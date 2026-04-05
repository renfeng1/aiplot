import "server-only";

import { getDb } from "@/db/prisma";
import { defaultQuotaConfig } from "@/lib/env";
import { ApiError } from "@/server/http";

type QuotaKind = "distillation" | "chat" | "tts";

const QUOTA_COLUMNS: Record<
  QuotaKind,
  {
    limit: "distillationLimit" | "chatLimit" | "ttsLimit";
    used: "distillationUsed" | "chatUsed" | "ttsUsed";
    remaining: "distillationRemaining" | "chatRemaining" | "ttsRemaining";
  }
> = {
  distillation: {
    limit: "distillationLimit",
    used: "distillationUsed",
    remaining: "distillationRemaining",
  },
  chat: {
    limit: "chatLimit",
    used: "chatUsed",
    remaining: "chatRemaining",
  },
  tts: {
    limit: "ttsLimit",
    used: "ttsUsed",
    remaining: "ttsRemaining",
  },
};

export async function ensureUserQuota(userId: string) {
  const db = getDb();
  const config =
    (await db.appConfig.findUnique({
      where: { key: "default" },
    })) ?? {
      defaultDistillationQuota: defaultQuotaConfig.distillation,
      defaultChatQuota: defaultQuotaConfig.chat,
      defaultTtsQuota: defaultQuotaConfig.tts,
    };

  return db.userQuota.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      distillationLimit: config.defaultDistillationQuota,
      distillationUsed: 0,
      distillationRemaining: config.defaultDistillationQuota,
      chatLimit: config.defaultChatQuota,
      chatUsed: 0,
      chatRemaining: config.defaultChatQuota,
      ttsLimit: config.defaultTtsQuota,
      ttsUsed: 0,
      ttsRemaining: config.defaultTtsQuota,
    },
  });
}

export async function getUserQuotaSnapshot(userId: string) {
  const db = getDb();
  const quota = await ensureUserQuota(userId);
  return quota;
}

export async function consumeQuota(options: {
  userId: string;
  userRole: "SUPER_ADMIN" | "USER";
  kind: QuotaKind;
  amount?: number;
}) {
  if (options.userRole === "SUPER_ADMIN") {
    return null;
  }

  const amount = options.amount ?? 1;
  const db = getDb();
  await ensureUserQuota(options.userId);
  const columns = QUOTA_COLUMNS[options.kind];

  const updated = await db.userQuota.updateMany({
    where: {
      userId: options.userId,
      [columns.remaining]: {
        gte: amount,
      },
    },
    data: {
      [columns.used]: { increment: amount },
      [columns.remaining]: { decrement: amount },
      lastUsedAt: new Date(),
    },
  });

  if (updated.count !== 1) {
    throw new ApiError("配额不足，请联系管理员。", 403, "QUOTA_EXCEEDED");
  }

  return db.userQuota.findUnique({
    where: { userId: options.userId },
  });
}

export async function updateUserQuota(options: {
  actorId: string;
  targetUserId: string;
  distillationLimit: number;
  chatLimit: number;
  ttsLimit: number;
  reason?: string;
}) {
  const db = getDb();
  const current = await ensureUserQuota(options.targetUserId);

  const next = await db.userQuota.update({
    where: { userId: options.targetUserId },
    data: {
      distillationLimit: options.distillationLimit,
      distillationRemaining: Math.max(
        0,
        options.distillationLimit - current.distillationUsed,
      ),
      chatLimit: options.chatLimit,
      chatRemaining: Math.max(0, options.chatLimit - current.chatUsed),
      ttsLimit: options.ttsLimit,
      ttsRemaining: Math.max(0, options.ttsLimit - current.ttsUsed),
    },
  });

  await db.quotaChangeLog.create({
    data: {
      actorId: options.actorId,
      targetUserId: options.targetUserId,
      reason: options.reason ?? null,
      distillationLimitBefore: current.distillationLimit,
      distillationLimitAfter: next.distillationLimit,
      chatLimitBefore: current.chatLimit,
      chatLimitAfter: next.chatLimit,
      ttsLimitBefore: current.ttsLimit,
      ttsLimitAfter: next.ttsLimit,
    },
  });

  return next;
}

export async function updateDefaultQuotaConfig(options: {
  actorId: string;
  distillation: number;
  chat: number;
  tts: number;
}) {
  const db = getDb();
  const config = await db.appConfig.upsert({
    where: { key: "default" },
    update: {
      defaultDistillationQuota: options.distillation,
      defaultChatQuota: options.chat,
      defaultTtsQuota: options.tts,
    },
    create: {
      key: "default",
      defaultDistillationQuota: options.distillation,
      defaultChatQuota: options.chat,
      defaultTtsQuota: options.tts,
    },
  });

  await db.adminActionLog.create({
    data: {
      actorId: options.actorId,
      action: "quota.defaults.updated",
      targetType: "AppConfig",
      targetId: config.key,
      payload: {
        distillation: options.distillation,
        chat: options.chat,
        tts: options.tts,
      },
    },
  });

  return config;
}

