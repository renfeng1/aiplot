import "server-only";

import { cosineSimilarity, embed } from "ai";

import { getDb } from "@/db/prisma";
import { env } from "@/lib/env";
import { bltcyProvider } from "@/server/ai/provider";
import { chooseModel } from "@/server/models";
import type { RetrievedEvidence } from "@/types";

function tokenize(input: string) {
  return normalize(input)
    .split(/[\s,.!?;:，。！？；：、]+/)
    .filter((token) => token.length >= 2);
}

function normalize(input: string) {
  return input.toLowerCase().trim();
}

function lexicalScore(query: string, content: string) {
  const queryTokens = tokenize(query);
  const haystack = normalize(content);
  return queryTokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

export async function retrieveEvidence(options: {
  characterId: string;
  characterVersionId: string;
  query: string;
}) {
  const db = getDb();
  const chunks = await db.extractedChunk.findMany({
    where: {
      characterId: options.characterId,
      characterVersionId: options.characterVersionId,
    },
    orderBy: { chunkIndex: "asc" },
    take: 120,
  });

  if (!chunks.length) {
    return [] as RetrievedEvidence[];
  }

  let queryEmbedding: number[] | null = null;
  if (env.BLTCY_API_KEY && chunks.some((chunk) => Array.isArray(chunk.embedding))) {
    try {
      const embeddingModel = await chooseModel({
        capability: "embedding",
        tier: "FREE",
      });
      const result = await embed({
        model: bltcyProvider.embeddingModel(embeddingModel.id),
        value: options.query,
      });
      queryEmbedding = result.embedding;
    } catch (error) {
      console.warn("Query embedding failed.", error);
    }
  }

  return chunks
    .map((chunk) => {
      const lexical = lexicalScore(options.query, chunk.normalizedContent);
      const semantic =
        queryEmbedding && Array.isArray(chunk.embedding)
          ? cosineSimilarity(queryEmbedding, chunk.embedding as number[])
          : 0;

      return {
        chunkId: chunk.id,
        sourceFileId: chunk.sourceFileId,
        sourceLabel: chunk.sourceLabel || "资料片段",
        quote: chunk.content.slice(0, 360),
        pageNumber: chunk.pageNumber,
        imageIndex: chunk.imageIndex,
        score: lexical + semantic * 4,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);
}
