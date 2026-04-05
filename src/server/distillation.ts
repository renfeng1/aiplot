import "server-only";

import { getDb } from "@/db/prisma";
import { defaultDisclaimers } from "@/lib/constants";
import {
  distillChunkPrompt,
  distillFallbackPrompt,
  distillFinalPrompt,
} from "@/prompts/distill";
import { bltcyProvider, embedMany, generateText, Output } from "@/server/ai/provider";
import { createCharacterVersion } from "@/server/characters";
import {
  ensureSourcesReady,
  normalizeText,
  type PreparedChunk,
} from "@/server/ingestion";
import { ApiError } from "@/server/http";
import { chooseModel, getFixedDistillModel } from "@/server/models";
import { extractRelevantChunks } from "@/server/target-extraction";
import { createUsageLog } from "@/server/usage";
import {
  createCharacterSchema,
  distillationResultSchema,
  type CreateCharacterInput,
  type DistilledCharacter,
  type ModelTier,
  type VoiceProfileInput,
} from "@/types";

type DistillStage =
  | "uploading"
  | "extracting"
  | "ocr"
  | "analyzing"
  | "building"
  | "ready";

const DISTILLATION_JSON_KEYS = [
  "identity",
  "user_role_hint",
  "relationship_to_user",
  "background",
  "timeline",
  "core_beliefs",
  "expertise_topics",
  "relationship_style",
  "speaking_style",
  "tone",
  "pacing",
  "catchphrases",
  "taboos",
  "uncertainty_policy",
  "example_replies",
  "source_summary",
  "voice_style_prompt",
  "speech_rules",
  "relationship_map",
  "habits",
  "behavior_preferences",
  "style_examples",
  "target_confidence",
  "confidence",
  "completeness",
] as const;

function heuristicDistillation(
  input: CreateCharacterInput,
  text: string,
): DistilledCharacter {
  const sentences = text
    .split(/[。！？?!\n]/)
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    identity: `${input.targetCharacterName}，${input.description}`,
    user_role_hint: input.userRoleHint,
    relationship_to_user: input.userRoleHint.trim()
      ? `把用户视为${input.userRoleHint}，默认以符合资料的关系姿态互动。`
      : "默认把用户当成当前正在相处的对话对象，关系递进保持自然。",
    background: sentences.slice(0, 4),
    timeline: sentences.slice(4, 8),
    core_beliefs: input.tags.slice(0, 4),
    expertise_topics: input.tags.slice(0, 5),
    relationship_style: ["会根据上下文调整距离感", "资料不足时保持克制"],
    speaking_style: input.tags.slice(0, 4),
    tone: input.tags.slice(0, 3),
    pacing: "稳健",
    catchphrases: [],
    taboos: ["避免脱离资料过度断言"],
    uncertainty_policy:
      "如果资料不足，应自然说明不确定，并给出保守理解。",
    example_replies: sentences.slice(0, 3),
    source_summary: text.slice(0, 800),
    voice_style_prompt: `${
      input.tags.join("、") || "自然、清醒、稳妥"
    }，中文口语表达自然，停顿克制。`,
    speech_rules: [
      "优先贴合角色本人说话方式。",
      "不要把旁白或作者口吻直接当成角色口吻。",
    ],
    relationship_map: [],
    habits: [],
    behavior_preferences: [],
    style_examples: sentences.slice(0, 3),
    target_confidence: 0.45,
    confidence: 0.42,
    completeness: Math.min(0.8, text.length / 4000),
  };
}

function buildPersonaPrompt(distilled: DistilledCharacter) {
  return `
身份感：${distilled.identity}
用户是谁：${distilled.user_role_hint || "未明确提供，按当前对话对象理解"}
对用户的关系：${distilled.relationship_to_user || "按资料中的关系风格自然递进"}
背景：${distilled.background.join("；") || "暂无"}
价值观：${distilled.core_beliefs.join("；") || "暂无"}
说话风格：${distilled.speaking_style.join("；") || "暂无"}
语气：${distilled.tone.join("；") || "暂无"}
节奏：${distilled.pacing}
关系风格：${distilled.relationship_style.join("；") || "暂无"}
行为偏好：${distilled.behavior_preferences.join("；") || "暂无"}
习惯：${distilled.habits.join("；") || "暂无"}
表达规则：${distilled.speech_rules.join("；") || "暂无"}
禁忌：${distilled.taboos.join("；") || "暂无"}
不确定时的表达方式：${distilled.uncertainty_policy}
`.trim();
}

function buildMemorySummary(distilled: DistilledCharacter) {
  return [
    `用户定位：${distilled.user_role_hint || "未明确提供，按当前对话对象理解"}`,
    `对用户关系：${distilled.relationship_to_user || "按资料中的关系风格自然递进"}`,
    `背景事实：${distilled.background.join("；") || "暂无"}`,
    `关键经历：${distilled.timeline.join("；") || "暂无"}`,
    `擅长话题：${distilled.expertise_topics.join("；") || "暂无"}`,
    `人物关系：${distilled.relationship_map.join("；") || "暂无"}`,
    `常见习惯：${distilled.habits.join("；") || "暂无"}`,
  ].join("\n");
}

function buildWelcomeMessage(title: string, distilled: DistilledCharacter) {
  const example = distilled.example_replies.find(Boolean)?.trim();
  if (example) {
    return example
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join("\n")
      .slice(0, 140);
  }

  return `我是${title}。\n想聊什么？`;
}

function buildVoiceProfile(
  distilled: DistilledCharacter,
  title: string,
): VoiceProfileInput {
  return {
    provider: "bltcy",
    preset: "character-default",
    styleInstructions: distilled.voice_style_prompt,
    speed: 1,
    stability: 0.7,
    similarity: 0.6,
    expressiveLevel: 0.55,
    language: "zh-CN",
    speakingRegister: "自然角色口语",
    pauseStyle: "按中文标点自然停顿",
    emotionBaseline: distilled.tone[0] ?? "稳定克制",
    energy: 0.55,
    pitchHint: "与角色设定一致",
    styleExamples:
      distilled.style_examples.length > 0
        ? distilled.style_examples
        : [`我是${title}。`, ...distilled.example_replies.slice(0, 2)],
  };
}

function getDistillationBudgets(tier: ModelTier) {
  return tier === "ADVANCED"
    ? {
        maxRelevantChars: 14_000,
        maxUnits: 36,
        maxPreparedChunks: 72,
        maxSummaryChunks: 10,
        fallbackChars: 10_000,
      }
    : {
        maxRelevantChars: 8_000,
        maxUnits: 20,
        maxPreparedChunks: 40,
        maxSummaryChunks: 6,
        fallbackChars: 8_000,
      };
}

function buildJsonOnlyInstructions() {
  return `
你必须只返回一个 JSON object。
- 不要输出 markdown
- 不要输出 \`\`\`json
- 不要添加解释、标题、前言或后记
- 所有这些 key 都必须出现：${DISTILLATION_JSON_KEYS.join(", ")}
- 数组字段即使为空也要返回 []
- 数值字段请返回 0 到 1 之间的小数
`.trim();
}

function extractJsonCandidate(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

export function parseDistillationJson(text: string) {
  const candidate = extractJsonCandidate(text);

  if (!candidate) {
    return {
      success: false as const,
      error: "empty response",
    };
  }

  try {
    const parsed = JSON.parse(candidate);
    const validated = distillationResultSchema.safeParse(parsed);

    if (!validated.success) {
      return {
        success: false as const,
        error: validated.error.issues
          .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
          .join("; "),
      };
    }

    return {
      success: true as const,
      data: validated.data,
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "invalid json",
    };
  }
}

async function summarizeChunks(options: {
  chunks: PreparedChunk[];
  modelId: string;
  maxChunks: number;
}) {
  const sampleChunks = options.chunks.slice(0, options.maxChunks);
  const summaries: string[] = [];

  for (const chunk of sampleChunks) {
    const result = await generateText({
      model: bltcyProvider.chatModel(options.modelId),
      prompt: `${distillChunkPrompt}

目标人物相关资料片段：
${chunk.content}
`,
    });

    summaries.push(result.text.trim());
  }

  return summaries.join("\n\n");
}

async function buildEmbeddings(chunks: PreparedChunk[]) {
  try {
    const embeddingModel = await chooseModel({
      capability: "embedding",
      tier: "FREE",
    });

    const { embeddings } = await embedMany({
      model: bltcyProvider.embeddingModel(embeddingModel.id),
      values: chunks.map((chunk) => chunk.normalizedContent),
    });

    return chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index],
    }));
  } catch (error) {
    console.warn("生成向量失败，回退到纯文本检索。", error);
    return chunks.map((chunk) => ({ ...chunk, embedding: null }));
  }
}

function buildStructuredDistillationPrompt(options: {
  input: CreateCharacterInput;
  relevantText: string;
  chunkSummary: string;
  repairBlock?: string;
}) {
  return `${distillFinalPrompt}

${buildJsonOnlyInstructions()}
${options.repairBlock ?? ""}

角色名称：${options.input.title}
目标人物：${options.input.targetCharacterName}
目标别名：${options.input.targetCharacterAliases.join("、") || "无"}
用户是谁：${options.input.userRoleHint}
角色描述：${options.input.description}
角色类型：${options.input.type}
文本形态：${options.input.sourceFormatHint}
标签：${options.input.tags.join("、") || "无"}

目标人物相关原始资料摘录：${options.relevantText}

中间分析结果：${options.chunkSummary}
`;
}

async function generateStructuredDistillationWithSchema(options: {
  input: CreateCharacterInput;
  modelId: string;
  relevantText: string;
  chunkSummary: string;
}) {
  try {
    const result = await generateText({
      model: bltcyProvider.chatModel(options.modelId),
      output: Output.object({
        schema: distillationResultSchema,
      }),
      prompt: buildStructuredDistillationPrompt({
        input: options.input,
        relevantText: options.relevantText,
        chunkSummary: options.chunkSummary,
      }),
    });

    return {
      distilled: result.output,
      usage: result.usage,
    };
  } catch (error) {
    console.warn(
      "Structured distillation output failed, falling back to text parsing.",
      error,
    );

    return generateStructuredDistillation(options);
  }
}

async function generateStructuredDistillation(options: {
  input: CreateCharacterInput;
  modelId: string;
  relevantText: string;
  chunkSummary: string;
}) {
  let lastError = "unknown parse failure";
  let lastText = "";
  let lastUsage:
    | {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
      }
    | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const repairBlock =
      attempt === 0
        ? ""
        : `

上一次输出无法通过本地 JSON 校验。
错误：${lastError}
上一次输出：
${lastText.slice(0, 4_000)}
`;

    const result = await generateText({
      model: bltcyProvider.chatModel(options.modelId),
      prompt: `${distillFinalPrompt}

${buildJsonOnlyInstructions()}
${repairBlock}

角色名称：${options.input.title}
目标人物：${options.input.targetCharacterName}
目标别名：${options.input.targetCharacterAliases.join("、") || "无"}
用户是谁：${options.input.userRoleHint}
角色描述：${options.input.description}
角色类型：${options.input.type}
文本形态：${options.input.sourceFormatHint}
标签：${options.input.tags.join("、") || "无"}

目标人物相关原始资料摘录：
${options.relevantText}

中间分析结果：
${options.chunkSummary}
`,
    });

    lastText = result.text.trim();
    lastUsage = result.usage;

    const parsed = parseDistillationJson(lastText);
    if (parsed.success) {
      return {
        distilled: parsed.data,
        usage: lastUsage,
      };
    }

    lastError = parsed.error;
  }

  throw new ApiError(
    `结构化蒸馏输出无法解析：${lastError}`,
    502,
    "DISTILLATION_JSON_INVALID",
  );
}

export async function distillCharacter(options: {
  characterId: string;
  userId?: string | null;
  input: CreateCharacterInput;
  onStage?: (event: {
    stage: DistillStage;
    progress: number;
    message: string;
  }) => void | Promise<void>;
}) {
  const input = createCharacterSchema.parse(options.input);
  const db = getDb();
  const budgets = getDistillationBudgets(input.tier);

  await options.onStage?.({
    stage: "extracting",
    progress: 15,
    message: "正在读取并清洗资料…",
  });

  const sourceFiles = input.sourceIds.length
    ? await ensureSourcesReady(input.sourceIds)
    : [];
  let inlineSourceId: string | null = null;

  if (input.pastedText?.trim()) {
    const pasted = await db.sourceFile.create({
      data: {
        userId: options.userId ?? null,
        characterId: options.characterId,
        kind: "PASTE",
        mimeType: "text/plain",
        originalFilename: "pasted-text.txt",
        rawText: input.pastedText,
        parsedText: input.pastedText,
        normalizedText: normalizeText(input.pastedText),
        extractionMethod: "DIRECT_TEXT",
        extractionStatus: "READY",
      },
    });

    inlineSourceId = pasted.id;
    sourceFiles.push(pasted);
  }

  if (!sourceFiles.length) {
    throw new ApiError("No usable source content was found.", 400, "NO_SOURCES");
  }

  const extraction = extractRelevantChunks({
    sources: sourceFiles.map((file) => ({
      id: file.id,
      originalFilename: file.originalFilename,
      normalizedText: file.normalizedText,
      rawText: file.rawText,
    })),
    input: {
      targetCharacterName: input.targetCharacterName,
      targetCharacterAliases: input.targetCharacterAliases,
      sourceFormatHint: input.sourceFormatHint,
    },
    maxRelevantChars: budgets.maxRelevantChars,
    maxUnits: budgets.maxUnits,
    maxPreparedChunks: budgets.maxPreparedChunks,
  });

  if (!extraction.relevantText) {
    throw new ApiError(
      "没有提取到与目标人物相关的资料。",
      400,
      "NO_TARGET_CONTENT",
    );
  }

  await options.onStage?.({
    stage: "analyzing",
    progress: 45,
    message: "正在围绕目标人物提炼记忆、知识与说话方式…",
  });

  const distillModel = await getFixedDistillModel();

  const startedAt = Date.now();
  let distilled: DistilledCharacter;
  let finalUsage:
    | {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
      }
    | undefined;

  try {
    const chunkSummary = await summarizeChunks({
      chunks: extraction.preparedChunks,
      modelId: distillModel.id,
      maxChunks: budgets.maxSummaryChunks,
    });

    const final = await generateStructuredDistillationWithSchema({
      input,
      modelId: distillModel.id,
      relevantText: extraction.relevantText,
      chunkSummary,
    });

    distilled = final.distilled;
    finalUsage = final.usage;
  } catch (error) {
    console.warn("结构化蒸馏失败，回退到启发式方案。", error);

    const fallback = await generateText({
      model: bltcyProvider.chatModel(distillModel.id),
      prompt: `${distillFallbackPrompt}

角色名称：${input.title}
目标人物：${input.targetCharacterName}
目标别名：${input.targetCharacterAliases.join("、") || "无"}
用户是谁：${input.userRoleHint}
角色描述：${input.description}
资料：
${extraction.relevantText.slice(0, budgets.fallbackChars)}
`,
    }).catch(() => null);

    distilled = heuristicDistillation(
      input,
      fallback?.text?.trim() || extraction.relevantText,
    );
  }

  await options.onStage?.({
    stage: "building",
    progress: 78,
    message: "正在构建角色卡、记忆层与语音风格…",
  });

  const personaPrompt = buildPersonaPrompt(distilled);
  const memorySummary = buildMemorySummary(distilled);
  const welcomeMessage = buildWelcomeMessage(input.title, distilled);
  const voiceProfile = buildVoiceProfile(distilled, input.title);
  const versionNumber =
    (await db.characterVersion.count({
      where: { characterId: options.characterId },
    })) + 1;

  const version = await createCharacterVersion({
    characterId: options.characterId,
    versionNumber,
    input,
    distilled,
    personaPrompt,
    memorySummary,
    welcomeMessage,
    sourceSummary: distilled.source_summary,
    modelUsed: distillModel.id,
    tierUsed: input.tier,
    voiceProfile,
  });

  await db.character.update({
    where: { id: options.characterId },
    data: {
      shortDescription: distilled.source_summary.slice(0, 140),
    },
  });

  const chunkRows = await buildEmbeddings(extraction.preparedChunks);

  for (const file of sourceFiles) {
    await db.sourceFile.update({
      where: { id: file.id },
      data: {
        characterId: options.characterId,
        characterVersionId: version.id,
      },
    });
  }

  if (inlineSourceId) {
    await db.sourceFile.update({
      where: { id: inlineSourceId },
      data: { characterVersionId: version.id },
    });
  }

  if (chunkRows.length) {
    await db.extractedChunk.createMany({
      data: chunkRows.map((chunk) => ({
        characterId: options.characterId,
        characterVersionId: version.id,
        sourceFileId: chunk.sourceFileId,
        chunkIndex: chunk.chunkIndex,
        pageNumber: chunk.pageNumber ?? null,
        paragraphIndex: chunk.paragraphIndex ?? null,
        imageIndex: chunk.imageIndex ?? null,
        content: chunk.content,
        normalizedContent: chunk.normalizedContent,
        sourceLabel: chunk.sourceLabel,
        embedding: chunk.embedding ?? undefined,
        chunkMeta: {
          targetCharacterName: input.targetCharacterName,
          targetCharacterAliases: input.targetCharacterAliases,
          sourceFormatHint: input.sourceFormatHint,
          relevant: true,
        },
      })),
    });
  }

  await db.distillationResult.create({
    data: {
      characterId: options.characterId,
      characterVersionId: version.id,
      provider: "bltcy",
      model: distillModel.id,
      tier: input.tier,
      structuredResult: {
        ...distilled,
        targetCharacterName: input.targetCharacterName,
        targetCharacterAliases: input.targetCharacterAliases,
        userRoleHint: input.userRoleHint,
        sourceFormatHint: input.sourceFormatHint,
        relevantChunks: extraction.relevantChunks,
      },
      sourceSummary: distilled.source_summary,
      latencyMs: Date.now() - startedAt,
      inputTokens: finalUsage?.inputTokens ?? null,
      outputTokens: finalUsage?.outputTokens ?? null,
      totalTokens: finalUsage?.totalTokens ?? null,
    },
  });

  await createUsageLog({
    userId: options.userId,
    characterId: options.characterId,
    eventType: "distill",
    provider: "bltcy",
    model: distillModel.id,
    tier: input.tier,
    latencyMs: Date.now() - startedAt,
    inputTokens: finalUsage?.inputTokens ?? null,
    outputTokens: finalUsage?.outputTokens ?? null,
    totalTokens: finalUsage?.totalTokens ?? null,
      meta: {
        targetCharacterName: input.targetCharacterName,
        userRoleHint: input.userRoleHint,
        sourceFormatHint: input.sourceFormatHint,
        relevantChunkCount: extraction.relevantChunks.length,
      },
  });

  await options.onStage?.({
    stage: "ready",
    progress: 100,
    message: "角色已经蒸馏完成，可以开始对话。",
  });

  return {
    version,
    distilled,
    personaPrompt,
    memorySummary,
    welcomeMessage,
    voiceProfile,
  };
}

export function getDefaultDisclaimer(input: CreateCharacterInput) {
  if (input.type === "REAL_PERSON") {
    return defaultDisclaimers.realPerson;
  }

  return defaultDisclaimers.general;
}
