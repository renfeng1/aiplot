import { describe, expect, it } from "vitest";

import {
  chunkText,
  decodeTextBuffer,
  inferSourceKind,
  normalizeText,
  shouldFallbackToPdfOcr,
} from "@/server/ingestion";

describe("ingestion helpers", () => {
  it("normalizes whitespace", () => {
    expect(normalizeText("foo\r\n\r\nbar  \n")).toBe("foo\n\nbar");
  });

  it("infers source kinds", () => {
    expect(inferSourceKind("notes.pdf", "application/pdf")).toBe("PDF");
    expect(inferSourceKind("portrait.png", "image/png")).toBe("IMAGE");
    expect(
      inferSourceKind(
        "story.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("DOCX");
  });

  it("chunks long text", () => {
    const chunks = chunkText(
      Array.from({ length: 20 }, (_, index) => `Paragraph ${index}`).join(
        "\n\n",
      ),
      {
        sourceFileId: "src_1",
        sourceLabel: "test",
      },
    );

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.sourceFileId).toBe("src_1");
  });

  it("decodes utf-16 text buffers", () => {
    const buffer = Buffer.from("\ufeff你好，世界", "utf16le");
    const decoded = decodeTextBuffer(buffer);

    expect(decoded.text).toContain("你好");
    expect(decoded.encoding).toBe("utf-16le");
  });

  it("falls back to gb18030 when utf-8 quality is poor", () => {
    const buffer = Buffer.from([0xc4, 0xe3, 0xba, 0xc3]);
    const decoded = decodeTextBuffer(buffer);

    expect(decoded.text).toBe("你好");
    expect(decoded.encoding).toBe("gb18030");
  });

  it("flags low quality pdf text for ocr fallback", () => {
    expect(shouldFallbackToPdfOcr("x y z")).toBe(true);
    expect(
      shouldFallbackToPdfOcr(
        "这是一个可以直接提取的 PDF 文本内容，长度足够，而且没有乱码。".repeat(4),
      ),
    ).toBe(false);
  });
});
