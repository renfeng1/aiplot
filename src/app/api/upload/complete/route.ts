import { after } from "next/server";
import { z } from "zod";

import { getDb } from "@/db/prisma";
import { requireSignedIn } from "@/lib/auth";
import { env } from "@/lib/env";
import { ApiError, jsonError, jsonOk } from "@/server/http";
import { extractSourceFileText, inferSourceKind } from "@/server/ingestion";

const completeUploadSchema = z.object({
  sourceId: z.string().min(1),
  filename: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
  blob: z
    .object({
      url: z.string().url().optional(),
      downloadUrl: z.string().url().optional(),
      pathname: z.string().min(1).optional(),
      contentType: z.string().optional(),
    })
    .optional(),
  url: z.string().url().optional(),
  downloadUrl: z.string().url().optional(),
  pathname: z.string().min(1).optional(),
  contentType: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireSignedIn();

    if (!env.DATABASE_URL) {
      throw new ApiError(
        "DATABASE_URL is not configured.",
        500,
        "DATABASE_NOT_CONFIGURED",
      );
    }

    const payload = completeUploadSchema.parse(await request.json());
    const db = getDb();
    const source = await db.sourceFile.findUnique({
      where: { id: payload.sourceId },
    });

    if (!source) {
      throw new ApiError("Source file was not found.", 404, "SOURCE_NOT_FOUND");
    }

    if (source.userId && source.userId !== auth.localUserId) {
      throw new ApiError(
        "You do not have access to this source file.",
        403,
        "FORBIDDEN",
      );
    }

    const blobUrl = payload.blob?.url ?? payload.url ?? null;
    const downloadUrl = payload.blob?.downloadUrl ?? payload.downloadUrl ?? null;
    const pathname =
      payload.blob?.pathname ??
      payload.pathname ??
      payload.filename ??
      source.originalFilename ??
      null;
    const mimeType =
      payload.mimeType ??
      payload.blob?.contentType ??
      payload.contentType ??
      source.mimeType ??
      "application/octet-stream";
    const originalFilename =
      payload.filename ?? source.originalFilename ?? pathname ?? "upload.bin";

    if (!blobUrl && !downloadUrl) {
      throw new ApiError(
        "上传已完成，但缺少可读取的文件地址。",
        400,
        "UPLOAD_BLOB_MISSING",
      );
    }

    const kind = inferSourceKind(originalFilename, mimeType);
    const finalBlobUrl = blobUrl ?? downloadUrl;
    const sourceMeta = {
      pathname,
      downloadUrl,
    };

    await db.sourceFile.update({
      where: { id: payload.sourceId },
      data: {
        kind,
        mimeType,
        originalFilename,
        blobUrl: finalBlobUrl,
        extractionStatus: "UPLOADED",
        parseError: null,
        sourceMeta,
      },
    });

    after(async () => {
      try {
        await extractSourceFileText({
          id: payload.sourceId,
          kind,
          mimeType,
          blobUrl: finalBlobUrl,
          rawText: source.rawText,
          originalFilename,
          sourceMeta,
        });
      } catch (error) {
        console.error("Background source extraction failed", {
          sourceId: payload.sourceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    return jsonOk({
      source: {
        id: payload.sourceId,
        extractionStatus: "UPLOADED",
        extractionMethod: null,
        pageCount: null,
        parseError: null,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
