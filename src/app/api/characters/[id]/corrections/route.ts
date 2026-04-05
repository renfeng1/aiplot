import { z } from "zod";

import { getDb } from "@/db/prisma";
import { requireSignedIn } from "@/lib/auth";
import { jsonError, jsonOk, ApiError } from "@/server/http";
import { correctionSchema } from "@/types";

const paramsSchema = z.object({ id: z.string().min(1) });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSignedIn();
    const { id } = paramsSchema.parse(await context.params);
    const body = correctionSchema.parse(await request.json());
    const db = getDb();

    const character = await db.character.findUnique({ where: { id } });
    if (!character) {
      throw new ApiError("角色不存在。", 404, "CHARACTER_NOT_FOUND");
    }
    if (character.userId && character.userId !== auth.localUserId) {
      throw new ApiError("无权修改该角色。", 403, "FORBIDDEN");
    }

    const correction = await db.correction.create({
      data: {
        characterId: id,
        characterVersionId: character.currentVersionId ?? null,
        conversationId: body.conversationId ?? null,
        messageId: body.messageId ?? null,
        userId: auth.localUserId ?? null,
        text: body.text,
        normalizedText: body.text.trim(),
        appliesToModes: body.appliesToModes,
      },
    });

    return jsonOk({ correction });
  } catch (error) {
    return jsonError(error);
  }
}
