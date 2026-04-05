import "server-only";

import { createRequire } from "node:module";
import mammoth from "mammoth";

import type { SourceFile } from "@/generated/prisma/client";
import { getDb } from "@/db/prisma";
import { appLimits } from "@/lib/constants";
import { isBltcyConfigured } from "@/lib/env";
import { ocrPrompt } from "@/prompts/ocr";
import { bltcyProvider, generateText } from "@/server/ai/provider";
import { fetchBlobBuffer } from "@/server/blob";
import { ApiError } from "@/server/http";
import { logWarn } from "@/server/logger";
import { chooseModel } from "@/server/models";
import type { ExtractionMethod, SourceKind } from "@/types";

const require = createRequire(import.meta.url);

function ensurePdfRuntimePolyfills() {
  const canvas = require(["@napi-rs", "canvas"].join("/")) as {
    DOMMatrix?: typeof globalThis.DOMMatrix;
    ImageData?: typeof globalThis.ImageData;
    Path2D?: typeof globalThis.Path2D;
  };

  if (typeof globalThis.DOMMatrix === "undefined" && canvas.DOMMatrix) {
    globalThis.DOMMatrix = canvas.DOMMatrix;
  }

  if (typeof globalThis.ImageData === "undefined" && canvas.ImageData) {
    globalThis.ImageData = canvas.ImageData;
  }

  if (typeof globalThis.Path2D === "undefined" && canvas.Path2D) {
    globalThis.Path2D = canvas.Path2D;
  }
}

export type PreparedChunk = {
  sourceFileId: string;
  chunkIndex: number;
  content: string;
  normalizedContent: string;
  pageNumber?: number | null;
  paragraphIndex?: number | null;
  imageIndex?: number | null;
  sourceLabel: string;
};

function countMatches(input: string, pattern: RegExp) {
  return input.match(pattern)?.length ?? 0;
}

function getTextQualityStats(text: string) {
  const normalized = normalizeText(text);
  const total = Math.max(normalized.length, 1);
  const replacementCount = countMatches(normalized, /\uFFFD/g);
  const nullCount = countMatches(normalized, /\u0000/g);
  const printableCount = countMatches(
    normalized,
    /[\n\r\t\u0020-\u007E\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF]/g,
  );
  const cjkCount = countMatches(normalized, /[\u4E00-\u9FFF]/g);

  return {
    normalized,
    length: normalized.length,
    replacementRatio: replacementCount / total,
    nullRatio: nullCount / total,
    printableRatio: printableCount / total,
    cjkRatio: cjkCount / total,
  };
}

function decodeWithEncoding(buffer: Buffer, encoding: string) {
  try {
    return new TextDecoder(encoding).decode(buffer);
  } catch {
    return null;
  }
}

function inferUtf16Encoding(buffer: Buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 64));
  let evenNulls = 0;
  let oddNulls = 0;

  for (let index = 0; index < sample.length; index += 1) {
    if (sample[index] !== 0) {
      continue;
    }

    if (index % 2 === 0) {
      evenNulls += 1;
    } else {
      oddNulls += 1;
    }
  }

  if (oddNulls >= 4 && evenNulls <= 1) {
    return "utf-16le";
  }

  if (evenNulls >= 4 && oddNulls <= 1) {
    return "utf-16be";
  }

  return null;
}

export function decodeTextBuffer(buffer: Buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return {
      text: normalizeText(decodeWithEncoding(buffer, "utf-8") ?? buffer.toString("utf8")),
      encoding: "utf-8-bom",
    };
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return {
      text: normalizeText(decodeWithEncoding(buffer, "utf-16le") ?? ""),
      encoding: "utf-16le",
    };
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return {
      text: normalizeText(decodeWithEncoding(buffer, "utf-16be") ?? ""),
      encoding: "utf-16be",
    };
  }

  const inferredUtf16 = inferUtf16Encoding(buffer);
  if (inferredUtf16) {
    const decoded = decodeWithEncoding(buffer, inferredUtf16);
    if (decoded) {
      return {
        text: normalizeText(decoded),
        encoding: inferredUtf16,
      };
    }
  }

  const candidates = [
    { encoding: "utf-8", text: decodeWithEncoding(buffer, "utf-8") },
    { encoding: "gb18030", text: decodeWithEncoding(buffer, "gb18030") },
  ]
    .filter((candidate): candidate is { encoding: string; text: string } =>
      typeof candidate.text === "string",
    )
    .map((candidate) => ({
      encoding: candidate.encoding,
      text: normalizeText(candidate.text),
      stats: getTextQualityStats(candidate.text),
    }))
    .sort((left, right) => {
      const leftScore =
        left.stats.printableRatio -
        left.stats.replacementRatio * 4 -
        left.stats.nullRatio * 4 +
        Math.min(left.stats.cjkRatio, 0.35);
      const rightScore =
        right.stats.printableRatio -
        right.stats.replacementRatio * 4 -
        right.stats.nullRatio * 4 +
        Math.min(right.stats.cjkRatio, 0.35);

      return rightScore - leftScore;
    });

  if (candidates[0]) {
    return {
      text: candidates[0].text,
      encoding: candidates[0].encoding,
    };
  }

  return {
    text: normalizeText(buffer.toString("utf8")),
    encoding: "utf-8-fallback",
  };
}

export function shouldFallbackToPdfOcr(text: string) {
  const stats = getTextQualityStats(text);

  if (!stats.normalized) {
    return true;
  }

  return (
    stats.length < 80 ||
    stats.replacementRatio > 0.02 ||
    stats.nullRatio > 0.001 ||
    stats.printableRatio < 0.7
  );
}

function getBlobCandidateUrls(sourceFile: Pick<SourceFile, "blobUrl" | "sourceMeta">) {
  const meta =
    sourceFile.sourceMeta && typeof sourceFile.sourceMeta === "object"
      ? (sourceFile.sourceMeta as { downloadUrl?: string | null })
      : null;

  return [meta?.downloadUrl ?? null, sourceFile.blobUrl];
}

export function inferSourceKind(
  filename?: string | null,
  mimeType?: string | null,
): SourceKind {
  const lowerName = filename?.toLowerCase() ?? "";
  const lowerMime = mimeType?.toLowerCase() ?? "";

  if (lowerMime.includes("markdown") || lowerName.endsWith(".md")) return "MD";
  if (lowerMime.includes("plain") || lowerName.endsWith(".txt")) return "TXT";
  if (lowerMime.includes("pdf") || lowerName.endsWith(".pdf")) return "PDF";
  if (
    lowerMime.includes("wordprocessingml") ||
    lowerName.endsWith(".docx")
  )
    return "DOCX";
  if (lowerMime.startsWith("image/")) return "IMAGE";

  return "TEXT";
}

export function normalizeText(input: string) {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkText(
  text: string,
  options?: { sourceFileId?: string; sourceLabel?: string },
): PreparedChunk[] {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }

  const paragraphs = normalized.split(/\n{2,}/).filter(Boolean);
  const chunks: PreparedChunk[] = [];
  let chunkIndex = 0;
  let current = "";
  let paragraphIndex = 0;

  for (const paragraph of paragraphs) {
    if (
      (current + "\n\n" + paragraph).length > appLimits.chunkSize &&
      current
    ) {
      chunks.push({
        sourceFileId: options?.sourceFileId ?? "inline",
        chunkIndex,
        content: current,
        normalizedContent: normalizeText(current),
        paragraphIndex: paragraphIndex - 1,
        sourceLabel: options?.sourceLabel ?? "文本输入",
      });
      chunkIndex += 1;
      current = current.slice(-appLimits.chunkOverlap);
    }

    current = current ? `${current}\n\n${paragraph}` : paragraph;
    paragraphIndex += 1;
  }

  if (current.trim()) {
    chunks.push({
      sourceFileId: options?.sourceFileId ?? "inline",
      chunkIndex,
      content: current,
      normalizedContent: normalizeText(current),
      paragraphIndex: paragraphIndex - 1,
      sourceLabel: options?.sourceLabel ?? "文本输入",
    });
  }

  return chunks;
}

async function runVisionOcr(options: {
  bytes: Buffer;
  mediaType: string;
  filename: string;
  tier?: "FREE" | "ADVANCED";
}) {
  if (!isBltcyConfigured) {
    throw new ApiError("OCR 能力未配置。", 503, "OCR_NOT_CONFIGURED");
  }

  const model = await chooseModel({
    capability: "ocr",
    tier: options.tier ?? "FREE",
  });

  const result = await generateText({
    model: bltcyProvider.chatModel(model.id),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: ocrPrompt },
          {
            type: "file",
            data: options.bytes,
            mediaType: options.mediaType,
            filename: options.filename,
          },
        ],
      },
    ],
  });

  return {
    text: normalizeText(result.text),
    modelId: model.id,
    usage: result.usage,
  };
}

export async function extractSourceFileText(
  sourceFile: Pick<
    SourceFile,
    | "id"
    | "kind"
    | "mimeType"
    | "blobUrl"
    | "rawText"
    | "originalFilename"
    | "sourceMeta"
  >,
) {
  const db = getDb();

  if (
    sourceFile.rawText &&
    (sourceFile.kind === "PASTE" || sourceFile.kind === "TEXT")
  ) {
    const normalized = normalizeText(sourceFile.rawText);
    await db.sourceFile.update({
      where: { id: sourceFile.id },
      data: {
        parsedText: sourceFile.rawText,
        normalizedText: normalized,
        extractionMethod: "DIRECT_TEXT",
        extractionStatus: "READY",
        parseError: null,
      },
    });

    return {
      text: normalized,
      extractionMethod: "DIRECT_TEXT" satisfies ExtractionMethod,
      pageCount: null,
    };
  }

  if (!sourceFile.blobUrl) {
    throw new ApiError("缺少上传文件。", 400, "SOURCE_BLOB_MISSING");
  }

  await db.sourceFile.update({
    where: { id: sourceFile.id },
    data: { extractionStatus: "PROCESSING", parseError: null },
  });

  const buffer = await fetchBlobBuffer(getBlobCandidateUrls(sourceFile));

  try {
    if (sourceFile.kind === "TXT" || sourceFile.kind === "MD") {
      const decoded = decodeTextBuffer(buffer);
      await db.sourceFile.update({
        where: { id: sourceFile.id },
        data: {
          parsedText: decoded.text,
          normalizedText: decoded.text,
          extractionMethod: "DIRECT_TEXT",
          extractionStatus: "READY",
          sourceMeta: {
            ...(sourceFile.sourceMeta &&
            typeof sourceFile.sourceMeta === "object"
              ? sourceFile.sourceMeta
              : {}),
            detectedEncoding: decoded.encoding,
          },
        },
      });

      return {
        text: decoded.text,
        extractionMethod: "DIRECT_TEXT" satisfies ExtractionMethod,
        pageCount: null,
      };
    }

    if (sourceFile.kind === "DOCX") {
      const doc = await mammoth.extractRawText({ buffer });
      const text = normalizeText(doc.value);
      await db.sourceFile.update({
        where: { id: sourceFile.id },
        data: {
          parsedText: doc.value,
          normalizedText: text,
          extractionMethod: "DOCX_EXTRACT",
          extractionStatus: "READY",
        },
      });

      return {
        text,
        extractionMethod: "DOCX_EXTRACT" satisfies ExtractionMethod,
        pageCount: null,
      };
    }

    if (sourceFile.kind === "PDF") {
      // `pdf-parse` depends on DOM-like geometry globals even on the server.
      // Provide them explicitly from `@napi-rs/canvas` before loading the parser.
      ensurePdfRuntimePolyfills();
      const { PDFParse } = require("pdf-parse") as typeof import("pdf-parse");
      const parser = new PDFParse({ data: buffer });

      let parsedText = "";
      let pageCount: number | null = null;
      let textError: string | null = null;

      try {
        const parsed = await parser.getText();
        parsedText = normalizeText(parsed.text);
        pageCount = parsed.pages.length ?? null;
      } catch (error) {
        textError = error instanceof Error ? error.message : "pdf text extraction failed";
      } finally {
        await parser.destroy?.().catch(() => undefined);
      }

      if (parsedText && !shouldFallbackToPdfOcr(parsedText)) {
        await db.sourceFile.update({
          where: { id: sourceFile.id },
          data: {
            pageCount,
            parsedText,
            normalizedText: parsedText,
            extractionMethod: "PDF_TEXT",
            extractionStatus: "READY",
          },
        });

        return {
          text: parsedText,
          extractionMethod: "PDF_TEXT" satisfies ExtractionMethod,
          pageCount,
        };
      }

      try {
        const ocr = await runVisionOcr({
          bytes: buffer,
          mediaType: sourceFile.mimeType || "application/pdf",
          filename: sourceFile.originalFilename ?? "document.pdf",
        });

        await db.sourceFile.update({
          where: { id: sourceFile.id },
          data: {
            kind: "OCR_PDF",
            pageCount,
            parsedText: ocr.text,
            normalizedText: ocr.text,
            extractionMethod: "OCR_VISION",
            extractionStatus: "READY",
            parseError: null,
          },
        });

        return {
          text: ocr.text,
          extractionMethod: "OCR_VISION" satisfies ExtractionMethod,
          pageCount,
        };
      } catch (ocrError) {
        const combinedError = [textError, ocrError instanceof Error ? ocrError.message : String(ocrError)]
          .filter(Boolean)
          .join(" | ");

        throw new ApiError(
          combinedError || "PDF text extraction and OCR both failed.",
          422,
          "PDF_EXTRACTION_FAILED",
        );
      }
    }

    if (sourceFile.kind === "IMAGE") {
      const ocr = await runVisionOcr({
        bytes: buffer,
        mediaType: sourceFile.mimeType || "image/png",
        filename: sourceFile.originalFilename ?? "image.png",
      });

      await db.sourceFile.update({
        where: { id: sourceFile.id },
        data: {
          parsedText: ocr.text,
          normalizedText: ocr.text,
          extractionMethod: "OCR_VISION",
          extractionStatus: "READY",
        },
      });

      return {
        text: ocr.text,
        extractionMethod: "OCR_VISION" satisfies ExtractionMethod,
        pageCount: null,
      };
    }

    throw new ApiError("暂不支持该资料类型。", 415, "UNSUPPORTED_SOURCE_KIND");
  } catch (error) {
    logWarn("Source extraction failed", {
      sourceFileId: sourceFile.id,
      error: error instanceof Error ? error.message : String(error),
    });

    await db.sourceFile.update({
      where: { id: sourceFile.id },
      data: {
        extractionStatus: "FAILED",
        parseError: error instanceof Error ? error.message : "解析失败",
      },
    });

    throw error;
  }
}

export async function ensureSourcesReady(sourceIds: string[]) {
  const db = getDb();
  const sourceFiles = await db.sourceFile.findMany({
    where: {
      id: { in: sourceIds },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!sourceFiles.length) {
    throw new ApiError("未找到可用资料。", 400, "NO_SOURCES");
  }

  const prepared = [];
  for (const file of sourceFiles) {
    if (file.normalizedText) {
      prepared.push(file);
      continue;
    }

    await extractSourceFileText(file);
    prepared.push(
      await db.sourceFile.findUniqueOrThrow({
        where: { id: file.id },
      }),
    );
  }

  return prepared;
}
