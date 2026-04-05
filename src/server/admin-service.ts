import "server-only";

import { getDb } from "@/db/prisma";

export async function listUsersForAdmin() {
  const db = getDb();
  return db.user.findMany({
    include: {
      quota: true,
      _count: {
        select: {
          characters: true,
          conversations: true,
          usageLogs: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listUsageLogs(options?: {
  eventType?: string;
  userId?: string;
}) {
  const db = getDb();
  return db.usageLog.findMany({
    where: {
      eventType: options?.eventType,
      userId: options?.userId,
    },
    include: {
      user: true,
      character: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function getUsageSummaryByUser() {
  const db = getDb();
  const users = await db.user.findMany({
    include: {
      quota: true,
      usageLogs: {
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return users.map((user) => {
    const totals = user.usageLogs.reduce(
      (acc, log) => {
        acc.total += 1;
        if (log.eventType === "distill") acc.distill += 1;
        if (log.eventType === "chat") acc.chat += 1;
        if (log.eventType === "tts") acc.tts += 1;
        if (log.success) acc.success += 1;
        else acc.failure += 1;
        return acc;
      },
      { total: 0, distill: 0, chat: 0, tts: 0, success: 0, failure: 0 },
    );

    return {
      user,
      totals,
      latestUsage: user.usageLogs[0] ?? null,
    };
  });
}
