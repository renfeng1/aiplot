import "server-only";

import { put } from "@vercel/blob";

import { env } from "@/lib/env";
import { ApiError } from "@/server/http";

async function fetchBlobCandidate(url: string, withAuth: boolean) {
  try {
    return await fetch(url, {
      headers:
        withAuth && env.BLOB_READ_WRITE_TOKEN
          ? {
              Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}`,
            }
          : undefined,
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

export async function fetchBlobAsset(
  blobUrl: string | Array<string | null | undefined>,
) {
  const candidates = Array.isArray(blobUrl) ? blobUrl : [blobUrl];
  const urls = [...new Set(candidates.filter(Boolean))] as string[];

  if (!urls.length) {
    throw new ApiError("缺少可读取的文件地址。", 400, "BLOB_URL_MISSING");
  }

  for (const url of urls) {
    const direct = await fetchBlobCandidate(url, false);
    if (direct?.ok) {
      return {
        buffer: Buffer.from(await direct.arrayBuffer()),
        contentType: direct.headers.get("content-type") ?? "audio/wav",
      };
    }

    if (!env.BLOB_READ_WRITE_TOKEN) {
      continue;
    }

    const authed = await fetchBlobCandidate(url, true);
    if (authed?.ok) {
      return {
        buffer: Buffer.from(await authed.arrayBuffer()),
        contentType: authed.headers.get("content-type") ?? "audio/wav",
      };
    }
  }

  throw new ApiError("无法读取上传文件。", 500, "BLOB_FETCH_FAILED");
}

export async function fetchBlobBuffer(
  blobUrl: string | Array<string | null | undefined>,
) {
  const asset = await fetchBlobAsset(blobUrl);
  return asset.buffer;
}

export async function uploadPrivateAsset(
  pathname: string,
  body: Buffer,
  contentType: string,
) {
  if (!env.BLOB_READ_WRITE_TOKEN) {
    throw new ApiError("Blob 存储未配置。", 500, "BLOB_NOT_CONFIGURED");
  }

  try {
    return await put(pathname, body, {
      access: "private",
      addRandomSuffix: true,
      contentType,
      token: env.BLOB_READ_WRITE_TOKEN,
    });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("Cannot use private access on a public store")
    ) {
      throw error;
    }

    return put(pathname, body, {
      access: "public",
      addRandomSuffix: true,
      contentType,
      token: env.BLOB_READ_WRITE_TOKEN,
    });
  }
}
