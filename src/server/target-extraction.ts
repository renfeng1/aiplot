import "server-only";

import type { SourceFile } from "@/generated/prisma/client";
import { chunkText, normalizeText } from "@/server/ingestion";
import type { PreparedChunk } from "@/server/ingestion";
import type {
  CreateCharacterInput,
  RelevantChunk,
  SourceFormat,
  TargetCharacterSpec,
} from "@/types";

type SourceWithText = Pick<
  SourceFile,
  "id" | "originalFilename" | "normalizedText" | "rawText"
>;

type Unit = {
  sourceFileId: string;
  sourceLabel: string;
  content: string;
  normalizedContent: string;
  format: SourceFormat;
  paragraphIndex: number | null;
};

type ScoredUnit = Unit & {
  unitIndex: number;
  score: number;
  reason: string;
};

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function inferSourceFormat(
  text: string,
  formatHint: SourceFormat,
): SourceFormat {
  if (formatHint !== "AUTO") {
    return formatHint;
  }

  if (/第.{0,8}[章节回幕]/.test(text) || /【.*?】/.test(text)) {
    return "NOVEL";
  }

  if (
    /^\s*(\[\d{1,2}:\d{2}.*?\]|[\d\-/: ]+)\s*[\u4e00-\u9fa5A-Za-z0-9_-]{1,20}\s*[：:]/m.test(
      text,
    )
  ) {
    return "CHAT_LOG";
  }

  if (
    /^\s*[\u4e00-\u9fa5A-Za-z0-9_-]{1,20}\s*[：:][^\n]+$/m.test(text) &&
    /场景|人物|旁白|幕间|线索/.test(text)
  ) {
    return "SCRIPT";
  }

  return "PLAIN_TEXT";
}

export function buildTargetCharacterSpec(
  input: Pick<
    CreateCharacterInput,
    "targetCharacterName" | "targetCharacterAliases" | "sourceFormatHint"
  >,
): TargetCharacterSpec {
  const aliases = [input.targetCharacterName, ...input.targetCharacterAliases]
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    name: input.targetCharacterName.trim(),
    aliases: [...new Set(aliases)],
    formatHint: input.sourceFormatHint,
  };
}

function splitUnits(source: SourceWithText, format: SourceFormat): Unit[] {
  const text = normalizeText(source.normalizedText || source.rawText || "");
  if (!text) {
    return [];
  }

  const pieces =
    format === "CHAT_LOG" || format === "SCRIPT"
      ? text
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      : text
          .split(/\n{2,}/)
          .map((line) => line.trim())
          .filter(Boolean);

  return pieces.map((content, index) => ({
    sourceFileId: source.id,
    sourceLabel: source.originalFilename || "source-text",
    content,
    normalizedContent: normalizeText(content),
    format,
    paragraphIndex: index,
  }));
}

function scoreUnit(unit: Unit, aliases: string[]) {
  const content = unit.normalizedContent;
  let score = 0;
  const reasons: string[] = [];

  for (const alias of aliases) {
    const normalizedAlias = normalizeText(alias);
    if (!normalizedAlias) {
      continue;
    }

    const matches =
      content.match(new RegExp(escapeRegExp(normalizedAlias), "g"))?.length ?? 0;

    if (matches > 0) {
      score += matches * 4;
      reasons.push(`hit alias "${alias}" x${matches}`);
    }

    if (
      (unit.format === "CHAT_LOG" || unit.format === "SCRIPT") &&
      new RegExp(`^${escapeRegExp(normalizedAlias)}\\s*[：:]`).test(content)
    ) {
      score += 6;
      reasons.push(`detected direct speech by "${alias}"`);
    }
  }

  if (unit.format === "NOVEL" && /她|他|小姐|公子|夫人/.test(content)) {
    score += 0.5;
  }

  return {
    score,
    reason: reasons.join("; "),
  };
}

function limitUnitsByBudget(
  units: ScoredUnit[],
  options: {
    maxRelevantChars?: number;
    maxUnits?: number;
  },
) {
  const ranked = [...units].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.unitIndex - right.unitIndex;
  });

  const selected: ScoredUnit[] = [];
  let totalChars = 0;

  for (const unit of ranked) {
    if (
      typeof options.maxUnits === "number" &&
      selected.length >= options.maxUnits
    ) {
      break;
    }

    if (
      typeof options.maxRelevantChars === "number" &&
      selected.length > 0 &&
      totalChars + unit.content.length > options.maxRelevantChars
    ) {
      continue;
    }

    selected.push(unit);
    totalChars += unit.content.length;
  }

  return selected.sort((left, right) => left.unitIndex - right.unitIndex);
}

export function extractRelevantChunks(options: {
  sources: SourceWithText[];
  input: Pick<
    CreateCharacterInput,
    "targetCharacterName" | "targetCharacterAliases" | "sourceFormatHint"
  >;
  maxRelevantChars?: number;
  maxUnits?: number;
  maxPreparedChunks?: number;
}) {
  const target = buildTargetCharacterSpec(options.input);
  const aliases = target.aliases;
  const allUnits = options.sources.flatMap((source) => {
    const text = source.normalizedText || source.rawText || "";
    const format = inferSourceFormat(text, target.formatHint);
    return splitUnits(source, format);
  });

  const scored: ScoredUnit[] = allUnits.map((unit, index) => {
    const current = scoreUnit(unit, aliases);
    const prev = allUnits[index - 1];
    const next = allUnits[index + 1];

    let score = current.score;
    const reasons = current.reason ? [current.reason] : [];

    if (prev && scoreUnit(prev, aliases).score > 0) {
      score += 1;
      reasons.push("adjacent previous unit is relevant");
    }

    if (next && scoreUnit(next, aliases).score > 0) {
      score += 1;
      reasons.push("adjacent next unit is relevant");
    }

    return {
      ...unit,
      unitIndex: index,
      score,
      reason: reasons.join("; ") || "baseline keep",
    };
  });

  const stronglySelected = scored.filter((unit) => unit.score >= 2);
  const weaklySelected = scored.filter((unit) => unit.score > 0);

  const finalUnits = stronglySelected.length
    ? stronglySelected
    : weaklySelected.length
      ? weaklySelected
      : scored.slice(0, 24);

  const limitedUnits = limitUnitsByBudget(finalUnits, {
    maxRelevantChars: options.maxRelevantChars,
    maxUnits: options.maxUnits,
  });

  const relevantChunks: RelevantChunk[] = limitedUnits.map((unit) => ({
    sourceFileId: unit.sourceFileId,
    sourceLabel: unit.sourceLabel,
    content: unit.content,
    score: unit.score,
    reason: unit.reason,
    format: unit.format,
    paragraphIndex: unit.paragraphIndex,
  }));

  const preparedChunksRaw: PreparedChunk[] = limitedUnits.flatMap((unit) =>
    chunkText(unit.content, {
      sourceFileId: unit.sourceFileId,
      sourceLabel: unit.sourceLabel,
    }).map((chunk) => ({
      ...chunk,
      paragraphIndex: unit.paragraphIndex,
    })),
  );

  const preparedChunks =
    typeof options.maxPreparedChunks === "number"
      ? preparedChunksRaw.slice(0, options.maxPreparedChunks)
      : preparedChunksRaw;

  const relevantText = normalizeText(
    limitedUnits.map((unit) => unit.content).join("\n\n"),
  );

  return {
    target,
    relevantChunks,
    preparedChunks,
    relevantText,
  };
}
