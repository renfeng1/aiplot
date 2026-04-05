import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/db/prisma";
import {
  updateDefaultQuotaConfig,
  updateUserQuota,
} from "@/server/quota-service";
import { jsonError, jsonOk } from "@/server/http";

const userQuotaSchema = z.object({
  mode: z.literal("user"),
  userId: z.string().min(1),
  distillationLimit: z.number().int().min(0),
  chatLimit: z.number().int().min(0),
  ttsLimit: z.number().int().min(0),
  reason: z.string().max(240).optional(),
});

const defaultQuotaSchema = z.object({
  mode: z.literal("default"),
  distillation: z.number().int().min(0),
  chat: z.number().int().min(0),
  tts: z.number().int().min(0),
});

export async function GET() {
  try {
    await requireAdmin();
    const db = getDb();
    const [config, quotas] = await Promise.all([
      db.appConfig.findUnique({ where: { key: "default" } }),
      db.userQuota.findMany({
        include: {
          user: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
    ]);
    return jsonOk({ config, quotas });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const payload = await request.json();

    if (payload.mode === "default") {
      const body = defaultQuotaSchema.parse(payload);
      const config = await updateDefaultQuotaConfig({
        actorId: admin.id,
        distillation: body.distillation,
        chat: body.chat,
        tts: body.tts,
      });
      return jsonOk({ config });
    }

    const body = userQuotaSchema.parse(payload);
    const quota = await updateUserQuota({
      actorId: admin.id,
      targetUserId: body.userId,
      distillationLimit: body.distillationLimit,
      chatLimit: body.chatLimit,
      ttsLimit: body.ttsLimit,
      reason: body.reason,
    });
    return jsonOk({ quota });
  } catch (error) {
    return jsonError(error);
  }
}

