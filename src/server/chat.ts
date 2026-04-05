import "server-only";

import {
  convertToModelMessages,
  streamText,
  type UIMessage,
} from "ai";

import { getDb } from "@/db/prisma";
import type { AuthContext } from "@/lib/auth";
import { buildChatSystemPrompt, buildChatTurnReminder } from "@/prompts/chat";
import { ensureCharacterAccess } from "@/server/characters";
import { ApiError } from "@/server/http";
import { buildPromptMemoryContext, updateConversationMemories } from "@/server/memory-service";
import { chooseModel } from "@/server/models";
import { consumeQuota } from "@/server/quota-service";
import { retrieveEvidence } from "@/server/retrieval";
import { createUsageLog } from "@/server/usage";
import { bltcyProvider } from "@/server/ai/provider";
import {
  chatMetadataSchema,
  type CharacterMode,
  type ChatMetadata,
} from "@/types";

function messageText(message: UIMessage<ChatMetadata>) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function summarizeForMemory(messages: Array<{ role: string; content: string }>) {
  return messages
    .slice(-12)
    .map(
      (message) =>
        `${message.role === "USER" ? "用户" : "角色"}：${message.content}`,
    )
    .join("\n")
    .slice(-2200);
}

function isChatRole(
  role: string,
): role is "USER" | "ASSISTANT" {
  return role === "USER" || role === "ASSISTANT";
}

async function getOrCreateConversation(options: {
  characterId: string;
  userId: string;
}) {
  const db = getDb();
  const existing = await db.conversation.findFirst({
    where: {
      characterId: options.characterId,
      userId: options.userId,
      isActive: true,
      deletedAt: null,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    return existing;
  }

  return db.conversation.create({
    data: {
      characterId: options.characterId,
      userId: options.userId,
      title: "新的对话",
      isActive: true,
    },
  });
}

function buildHistoryMessages(
  persisted: Array<{ id: string; role: "USER" | "ASSISTANT"; plainText: string }>,
  currentUserText: string,
) {
  const uiMessages: UIMessage<ChatMetadata>[] = persisted.map((message) => ({
    id: message.id,
    role: message.role === "USER" ? "user" : "assistant",
    parts: [{ type: "text", text: message.plainText }],
  }));

  uiMessages.push({
    id: `user-${Date.now()}`,
    role: "user",
    parts: [{ type: "text", text: currentUserText }],
  });

  return uiMessages;
}

export async function getConversationState(options: {
  slug: string;
  userId: string;
}) {
  const character = await ensureCharacterAccess({
    slug: options.slug,
    userId: options.userId,
  });

  if (!character?.currentVersion) {
    throw new ApiError("角色不存在或不可访问。", 404, "CHARACTER_NOT_FOUND");
  }

  const conversation = await getOrCreateConversation({
    characterId: character.id,
    userId: options.userId,
  });

  const db = getDb();
  const messages = await db.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
  });

  return {
    character,
    conversation,
    messages,
  };
}

export async function createChatStream(options: {
  slug: string;
  auth: AuthContext;
  messages: UIMessage<ChatMetadata>[];
  mode: CharacterMode;
  tier: "FREE" | "ADVANCED";
  modelId?: string;
}) {
  if (!options.auth.localUserId || !options.auth.role) {
    throw new ApiError("请先登录。", 401, "AUTH_REQUIRED");
  }

  const character = await ensureCharacterAccess({
    slug: options.slug,
    userId: options.auth.localUserId,
  });

  if (!character?.currentVersion) {
    throw new ApiError("角色不存在或当前版本不可用。", 404, "CHARACTER_NOT_FOUND");
  }

  const lastUserMessage = [...options.messages]
    .reverse()
    .find((item) => item.role === "user");
  const lastUserText = lastUserMessage ? messageText(lastUserMessage) : "";

  if (!lastUserText) {
    throw new ApiError("消息内容不能为空。", 400, "EMPTY_MESSAGE");
  }

  await consumeQuota({
    userId: options.auth.localUserId,
    userRole: options.auth.role,
    kind: "chat",
  });

  const db = getDb();
  const conversation = await getOrCreateConversation({
    characterId: character.id,
    userId: options.auth.localUserId,
  });

  const recentPersistedMessages = await db.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  const evidence = await retrieveEvidence({
    characterId: character.id,
    characterVersionId: character.currentVersion.id,
    query: lastUserText,
  });

  const memoryContext = await buildPromptMemoryContext({
    userId: options.auth.localUserId,
    characterId: character.id,
    query: lastUserText,
  });

  const corrections = await db.correction.findMany({
    where: { characterId: character.id },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  const model = await chooseModel({
    capability: "chat",
    tier: options.tier,
    preferredId: options.modelId,
  });

  const userMessage = await db.message.create({
    data: {
      conversationId: conversation.id,
      userId: options.auth.localUserId,
      role: "USER",
      content: lastUserText,
      plainText: lastUserText,
      mode: options.mode,
      tier: options.tier,
    },
  });

  const assistantDraft = await db.message.create({
    data: {
      conversationId: conversation.id,
      role: "ASSISTANT",
      content: "",
      plainText: "",
      modelUsed: model.id,
      mode: options.mode,
      tier: options.tier,
      metadata: { conversationId: conversation.id },
    },
  });

  await db.conversation.update({
    where: { id: conversation.id },
    data: {
      title:
        conversation.title === "新的对话"
          ? lastUserText.slice(0, 24)
          : conversation.title,
      lastMode: options.mode,
      lastModelId: model.id,
    },
  });

  const promptMessages = buildHistoryMessages(
    recentPersistedMessages
      .filter(
        (
          item,
        ): item is typeof item & { role: "USER" | "ASSISTANT" } =>
          isChatRole(item.role),
      )
      .map((item) => ({
        id: item.id,
        role: item.role,
        plainText: item.plainText,
      })),
    lastUserText,
  );

  const modelMessages = await convertToModelMessages(promptMessages);
  const reminder = buildChatTurnReminder({
    title: character.title,
    distilled: character.currentVersion.characterProfile as never,
  });
  modelMessages.splice(Math.max(modelMessages.length - 1, 0), 0, {
    role: "system",
    content: reminder,
  });

  const startedAt = Date.now();
  const result = streamText({
    model: bltcyProvider.chatModel(model.id),
    system: buildChatSystemPrompt({
      title: character.title,
      description: character.description,
      tags: character.tags,
      mode: options.mode,
      personaPrompt: character.currentVersion.personaPrompt,
      memorySummary: character.currentVersion.memorySummary,
      distilled: character.currentVersion.characterProfile as never,
      corrections: corrections.map((item) => item.text),
      conversationSummary:
        conversation.summary ||
        summarizeForMemory(
          recentPersistedMessages.map((item) => ({
            role: item.role,
            content: item.plainText,
          })),
        ),
      evidence,
      relationshipSummary: memoryContext.summaryText,
      retrievedMemories: memoryContext.memories.map((item) => item.content),
    }),
    messages: modelMessages,
    temperature: options.mode === "PERSONA_ONLY" ? 1.1 : 0.95,
    topP: 0.92,
    onFinish: async (event) => {
      const assistantText = event.text.trim();

      const assistantMessage = await db.message.update({
        where: { id: assistantDraft.id },
        data: {
          content: assistantText,
          plainText: assistantText,
          latencyMs: Date.now() - startedAt,
          inputTokens: event.totalUsage.inputTokens ?? null,
          outputTokens: event.totalUsage.outputTokens ?? null,
          totalTokens: event.totalUsage.totalTokens ?? null,
          metadata: {
            conversationId: conversation.id,
            model: model.id,
            mode: options.mode,
            evidence,
          },
          evidence,
        },
      });

      await db.conversation.update({
        where: { id: conversation.id },
        data: {
          summary: summarizeForMemory([
            ...recentPersistedMessages.map((item) => ({
              role: item.role,
              content: item.plainText,
            })),
            { role: "USER", content: lastUserText },
            { role: "ASSISTANT", content: assistantText },
          ]),
          updatedAt: new Date(),
        },
      });

      await updateConversationMemories({
        userId: options.auth.localUserId!,
        characterId: character.id,
        conversationId: conversation.id,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        userText: lastUserText,
        assistantText,
      });

      await createUsageLog({
        userId: options.auth.localUserId,
        characterId: character.id,
        conversationId: conversation.id,
        messageId: assistantMessage.id,
        eventType: "chat",
        provider: "bltcy",
        model: model.id,
        tier: options.tier,
        latencyMs: Date.now() - startedAt,
        inputTokens: event.totalUsage.inputTokens ?? null,
        outputTokens: event.totalUsage.outputTokens ?? null,
        totalTokens: event.totalUsage.totalTokens ?? null,
        meta: {
          evidenceCount: evidence.length,
          memoryCount: memoryContext.memories.length,
        },
      });
    },
  });

  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }) => {
      if (part.type === "finish") {
        return chatMetadataSchema.parse({
          conversationId: conversation.id,
          messageId: assistantDraft.id,
          model: model.id,
          mode: options.mode,
          evidence,
        });
      }
      return undefined;
    },
  });
}
