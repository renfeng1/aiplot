import { put } from "@vercel/blob";
import { handleUpload } from "@vercel/blob/client";
import slugify from "slugify";
import { z } from "zod";
import { after } from "next/server";

import { getDb } from "@/db/prisma";
import { requireSignedIn } from "@/lib/auth";
import { allowedMimeTypes, appLimits } from "@/lib/constants";
import { env } from "@/lib/env";
import { extractSourceFileText, inferSourceKind } from "@/server/ingestion";
import { ApiError, jsonError, jsonOk } from "@/server/http";

const clientPayloadSchema = z.object({
  sourceId: z.string().min(1),
  filename: z.string(),
  mimeType: z.string(),
});

async function upsertSourceFileRecord(options: {
  sourceId: string;
  filename: string;
  mimeType: string;
  userId?: string | null;
}) {
  const db = getDb();
  await db.sourceFile.upsert({
    where: { id: options.sourceId },
    create: {
      id: options.sourceId,
      userId: options.userId ?? null,
      kind: inferSourceKind(options.filename, options.mimeType),
      mimeType: options.mimeType,
      originalFilename: options.filename,
      extractionStatus: "PENDING",
    },
    update: {
      userId: options.userId ?? null,
      kind: inferSourceKind(options.filename, options.mimeType),
      mimeType: options.mimeType,
      originalFilename: options.filename,
      extractionStatus: "PENDING",
      parseError: null,
    },
  });
}

async function uploadToBlob(options: {
  pathname: string;
  file: File;
}) {
  try {
    return await put(options.pathname, options.file, {
      access: "private",
      addRandomSuffix: true,
      contentType: options.file.type || "application/octet-stream",
      token: env.BLOB_READ_WRITE_TOKEN,
    });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("Cannot use private access on a public store")
    ) {
      throw error;
    }

    return put(options.pathname, options.file, {
      access: "public",
      addRandomSuffix: true,
      contentType: options.file.type || "application/octet-stream",
      token: env.BLOB_READ_WRITE_TOKEN,
    });
  }
}

async function handleMultipartUpload(request: Request) {
  const auth = await requireSignedIn();

  if (!env.BLOB_READ_WRITE_TOKEN) {
    throw new ApiError(
      "当前还未配置文件存储，请先在 Vercel 环境变量中配置 BLOB_READ_WRITE_TOKEN。",
      500,
      "BLOB_NOT_CONFIGURED",
    );
  }

  if (!env.DATABASE_URL) {
    throw new ApiError(
      "DATABASE_URL is not configured.",
      500,
      "DATABASE_NOT_CONFIGURED",
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const sourceId = String(formData.get("sourceId") ?? "");
  const filename = String(formData.get("filename") ?? "");
  const mimeType = String(formData.get("mimeType") ?? "");

  if (!(file instanceof File)) {
    throw new ApiError("缺少上传文件。", 400, "FILE_REQUIRED");
  }

  const finalFilename = filename || file.name || "upload.bin";
  const finalMimeType = mimeType || file.type || "application/octet-stream";

  if (!sourceId) {
    throw new ApiError("缺少 sourceId。", 400, "SOURCE_ID_REQUIRED");
  }

  if (
    !allowedMimeTypes.includes(finalMimeType as (typeof allowedMimeTypes)[number])
  ) {
    throw new ApiError("不支持的文件类型。", 400, "UNSUPPORTED_MIME");
  }

  if (file.size > appLimits.maxFileSizeBytes) {
    throw new ApiError("文件太大。", 400, "FILE_TOO_LARGE");
  }

  await upsertSourceFileRecord({
    sourceId,
    filename: finalFilename,
    mimeType: finalMimeType,
    userId: auth.localUserId,
  });

  const safeName = slugify(finalFilename.replace(/\.[^.]+$/, ""), {
    lower: true,
    strict: true,
    trim: true,
  });

  const pathname = `sources/${sourceId}-${safeName || "source"}-${finalFilename}`;
  const blob = await uploadToBlob({ pathname, file });
  const db = getDb();

  await db.sourceFile.update({
    where: { id: sourceId },
    data: {
      kind: inferSourceKind(finalFilename, finalMimeType),
      mimeType: finalMimeType,
      originalFilename: finalFilename,
      blobUrl: blob.url,
      extractionStatus: "UPLOADED",
      parseError: null,
      sourceMeta: {
        pathname: blob.pathname,
        downloadUrl: blob.downloadUrl ?? null,
      },
    },
  });

  after(async () => {
    try {
      await extractSourceFileText({
        id: sourceId,
        kind: inferSourceKind(finalFilename, finalMimeType),
        mimeType: finalMimeType,
        blobUrl: blob.url,
        rawText: null,
        originalFilename: finalFilename,
        sourceMeta: {
          pathname: blob.pathname,
          downloadUrl: blob.downloadUrl ?? null,
        },
      });
    } catch (error) {
      console.error("Background source extraction failed", {
        sourceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return jsonOk({
    source: {
      id: sourceId,
      extractionStatus: "UPLOADED",
      extractionMethod: null,
      pageCount: null,
      parseError: null,
    },
    blob: {
      url: blob.url,
      downloadUrl: blob.downloadUrl ?? null,
      pathname: blob.pathname,
      contentType: blob.contentType,
    },
  });
}

async function handleTokenUpload(request: Request) {
  const auth = await requireSignedIn();
  const body = await request.json();

  if (!env.BLOB_READ_WRITE_TOKEN) {
    throw new ApiError(
      "当前还未配置文件存储，请先在 Vercel 环境变量中配置 BLOB_READ_WRITE_TOKEN。",
      500,
      "BLOB_NOT_CONFIGURED",
    );
  }

  const jsonResponse = await handleUpload({
    request,
    body,
    token: env.BLOB_READ_WRITE_TOKEN,
    onBeforeGenerateToken: async (_pathname, clientPayload) => {
      const payload = clientPayloadSchema.parse(
        JSON.parse(clientPayload ?? "{}"),
      );

      if (
        !allowedMimeTypes.includes(
          payload.mimeType as (typeof allowedMimeTypes)[number],
        )
      ) {
        throw new ApiError("不支持的文件类型。", 400, "UNSUPPORTED_MIME");
      }

      await upsertSourceFileRecord({
        sourceId: payload.sourceId,
        filename: payload.filename,
        mimeType: payload.mimeType,
        userId: auth.localUserId,
      });

      return {
        addRandomSuffix: true,
        maximumSizeInBytes: appLimits.maxFileSizeBytes,
        allowedContentTypes: [...allowedMimeTypes],
        tokenPayload: JSON.stringify({
          sourceId: payload.sourceId,
          filename: payload.filename,
          mimeType: payload.mimeType,
        }),
      };
    },
  });

  return Response.json(jsonResponse);
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      return await handleMultipartUpload(request);
    }

    return await handleTokenUpload(request);
  } catch (error) {
    return jsonError(error);
  }
}
