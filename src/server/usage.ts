import "server-only";

import { getDb } from "@/db/prisma";

type UsagePayload = {
  userId?: string | null;
  characterId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  eventType: string;
  provider?: string | null;
  model?: string | null;
  tier?: string | null;
  latencyMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  success?: boolean;
  errorCode?: string | null;
  meta?: Record<string, unknown> | null;
};

export async function createUsageLog(payload: UsagePayload) {
  try {
    const db = getDb();
    await db.usageLog.create({
      data: {
        userId: payload.userId ?? null,
        characterId: payload.characterId ?? null,
        conversationId: payload.conversationId ?? null,
        messageId: payload.messageId ?? null,
        eventType: payload.eventType,
        provider: payload.provider ?? null,
        model: payload.model ?? null,
        tier: payload.tier ?? null,
        latencyMs: payload.latencyMs ?? null,
        inputTokens: payload.inputTokens ?? null,
        outputTokens: payload.outputTokens ?? null,
        totalTokens: payload.totalTokens ?? null,
        success: payload.success ?? true,
        errorCode: payload.errorCode ?? null,
        meta: (payload.meta ?? undefined) as never,
      },
    });
  } catch (error) {
    console.warn("Failed to write usage log", error);
  }
}
