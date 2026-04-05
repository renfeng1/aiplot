import "server-only";

import { cosineSimilarity, embed } from "ai";

import { getDb } from "@/db/prisma";
import { env } from "@/lib/env";
import { bltcyProvider } from "@/server/ai/provider";
import { ApiError } from "@/server/http";
import { chooseModel } from "@/server/models";
import { createUsageLog } from "@/server/usage";

type MemoryCandidate = {
  memoryType: "FACT" | "PREFERENCE" | "RELATIONSHIP" | "EXPERIENCE" | "TASK";
  content: string;
  salience: number;
};

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function splitSentences(value: string) {
  return normalizeText(value)
    .split(/(?<=[。！？!?])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractCandidates(userText: string, assistantText: string): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];
  const sentences = splitSentences(userText);

  for (const sentence of sentences) {
    if (
      /(我叫|我是|我在|我来自|我住在|我现在|我一直|我的工作|我工作|我读|我学)/.test(
        sentence,
      )
    ) {
      candidates.push({
        memoryType: "FACT",
        content: sentence,
        salience: 0.78,
      });
    } else if (/(喜欢|讨厌|偏好|想要|希望|爱吃|习惯)/.test(sentence)) {
      candidates.push({
        memoryType: "PREFERENCE",
        content: sentence,
        salience: 0.8,
      });
    } else if (/(计划|打算|准备|目标|deadline|任务|明天|下周)/i.test(sentence)) {
      candidates.push({
        memoryType: "TASK",
        content: sentence,
        salience: 0.82,
      });
    } else if (sentence.length >= 12) {
      candidates.push({
        memoryType: "EXPERIENCE",
        content: sentence,
        salience: 0.58,
      });
    }
  }

  const assistantSentences = splitSentences(assistantText).slice(0, 2);
  for (const sentence of assistantSentences) {
    if (/(记得|以后|下次|我们|答应|会陪|会继续)/.test(sentence)) {
      candidates.push({
        memoryType: "RELATIONSHIP",
        content: sentence,
        salience: 0.74,
      });
    }
  }

  return candidates
    .map((item) => ({
      ...item,
      content: normalizeText(item.content),
    }))
    .filter((item) => item.content.length >= 6)
    .slice(0, 6);
}

async function maybeEmbedMemory(content: string) {
  if (!env.BLTCY_API_KEY) {
    return null;
  }

  try {
    const model = await chooseModel({
      capability: "embedding",
      tier: "FREE",
    });
    const result = await embed({
      model: bltcyProvider.embeddingModel(model.id),
      value: content,
    });
    return {
      model: model.id,
      embedding: result.embedding,
    };
  } catch (error) {
    console.warn("Memory embedding failed", error);
    return null;
  }
}

function scoreLexical(query: string, content: string) {
  const tokens = normalizeText(query)
    .toLowerCase()
    .split(/[\s,.!?，。！？；;:：]+/)
    .filter((item) => item.length >= 2);
  const haystack = content.toLowerCase();
  return tokens.reduce(
    (score, token) => score + (haystack.includes(token) ? 1 : 0),
    0,
  );
}

export async function retrieveRelevantMemories(options: {
  userId: string;
  characterId: string;
  query: string;
  topK?: number;
}) {
  const db = getDb();
  const memories = await db.memory.findMany({
    where: {
      userId: options.userId,
      characterId: options.characterId,
    },
    include: {
      embedding: true,
    },
    orderBy: [{ salience: "desc" }, { updatedAt: "desc" }],
    take: 40,
  });

  if (!memories.length) {
    return [];
  }

  let queryEmbedding: number[] | null = null;
  if (env.BLTCY_API_KEY && memories.some((item) => Array.isArray(item.embedding?.embedding))) {
    try {
      const model = await chooseModel({
        capability: "embedding",
        tier: "FREE",
      });
      const result = await embed({
        model: bltcyProvider.embeddingModel(model.id),
        value: options.query,
      });
      queryEmbedding = result.embedding;
    } catch (error) {
      console.warn("Memory query embedding failed", error);
    }
  }

  const ranked = memories
    .map((memory) => {
      const lexical = scoreLexical(options.query, memory.content);
      const semantic =
        queryEmbedding && Array.isArray(memory.embedding?.embedding)
          ? cosineSimilarity(queryEmbedding, memory.embedding.embedding as number[])
          : 0;
      return {
        id: memory.id,
        memoryType: memory.memoryType,
        content: memory.content,
        salience: memory.salience,
        score: lexical + semantic * 4 + memory.salience,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, options.topK ?? 4);

  if (ranked.length) {
    await db.memory.updateMany({
      where: {
        id: {
          in: ranked.map((item) => item.id),
        },
      },
      data: {
        lastAccessedAt: new Date(),
      },
    });
  }

  return ranked;
}

export async function getMemorySummary(options: {
  userId: string;
  characterId: string;
}) {
  const db = getDb();
  return db.memorySummary.findUnique({
    where: {
      userId_characterId: {
        userId: options.userId,
        characterId: options.characterId,
      },
    },
  });
}

async function rebuildMemorySummary(options: {
  userId: string;
  characterId: string;
}) {
  const db = getDb();
  const memories = await db.memory.findMany({
    where: {
      userId: options.userId,
      characterId: options.characterId,
    },
    orderBy: [{ salience: "desc" }, { updatedAt: "desc" }],
    take: 12,
  });

  const facts = memories
    .filter((item) => item.memoryType === "FACT" || item.memoryType === "PREFERENCE")
    .slice(0, 4)
    .map((item) => item.content)
    .join("；");
  const relationship = memories
    .filter((item) => item.memoryType === "RELATIONSHIP")
    .slice(0, 3)
    .map((item) => item.content)
    .join("；");
  const shared = memories
    .filter((item) => item.memoryType === "EXPERIENCE" || item.memoryType === "TASK")
    .slice(0, 4)
    .map((item) => item.content)
    .join("；");

  return db.memorySummary.upsert({
    where: {
      userId_characterId: {
        userId: options.userId,
        characterId: options.characterId,
      },
    },
    update: {
      relationshipSummary: relationship || "暂无明显关系变化。",
      userProfileSummary: facts || "暂无稳定用户画像。",
      sharedSummary: shared || "暂无共同经历摘要。",
      summaryText: [
        `用户画像：${facts || "暂无稳定用户画像。"}`,
        `关系摘要：${relationship || "暂无明显关系变化。"}`,
        `共同经历：${shared || "暂无共同经历摘要。"}`,
      ].join("\n"),
      sourceMemoryCount: memories.length,
      lastMessageAt: new Date(),
    },
    create: {
      userId: options.userId,
      characterId: options.characterId,
      relationshipSummary: relationship || "暂无明显关系变化。",
      userProfileSummary: facts || "暂无稳定用户画像。",
      sharedSummary: shared || "暂无共同经历摘要。",
      summaryText: [
        `用户画像：${facts || "暂无稳定用户画像。"}`,
        `关系摘要：${relationship || "暂无明显关系变化。"}`,
        `共同经历：${shared || "暂无共同经历摘要。"}`,
      ].join("\n"),
      sourceMemoryCount: memories.length,
      lastMessageAt: new Date(),
    },
  });
}

export async function updateConversationMemories(options: {
  userId: string;
  characterId: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  userText: string;
  assistantText: string;
}) {
  const db = getDb();
  const candidates = extractCandidates(options.userText, options.assistantText);

  for (const candidate of candidates) {
    const memory = await db.memory.create({
      data: {
        userId: options.userId,
        characterId: options.characterId,
        conversationId: options.conversationId,
        memoryType: candidate.memoryType,
        content: candidate.content,
        salience: candidate.salience,
        sourceMessageIds: [options.userMessageId, options.assistantMessageId],
      },
    });

    const embedded = await maybeEmbedMemory(candidate.content);
    if (embedded) {
      await db.memoryEmbedding.create({
        data: {
          memoryId: memory.id,
          model: embedded.model,
          embedding: embedded.embedding as never,
        },
      });
    }
  }

  const summary = await rebuildMemorySummary({
    userId: options.userId,
    characterId: options.characterId,
  });

  await createUsageLog({
    userId: options.userId,
    characterId: options.characterId,
    conversationId: options.conversationId,
    eventType: "memory_update",
    success: true,
    meta: {
      inserted: candidates.length,
      summaryId: summary.id,
    },
  });

  return summary;
}

export async function buildPromptMemoryContext(options: {
  userId: string;
  characterId: string;
  query: string;
}) {
  const [summary, memories] = await Promise.all([
    getMemorySummary({
      userId: options.userId,
      characterId: options.characterId,
    }),
    retrieveRelevantMemories({
      userId: options.userId,
      characterId: options.characterId,
      query: options.query,
    }),
  ]);

  return {
    summaryText: summary?.summaryText ?? "暂无长期关系记忆。",
    memories,
  };
}

