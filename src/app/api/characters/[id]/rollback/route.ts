import { z } from "zod";

import { getDb } from "@/db/prisma";
import { requireSignedIn } from "@/lib/auth";
import { jsonError, jsonOk, ApiError } from "@/server/http";
import { rollbackSchema } from "@/types";

const paramsSchema = z.object({ id: z.string().min(1) });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSignedIn();
    const { id } = paramsSchema.parse(await context.params);
    const body = rollbackSchema.parse(await request.json());
    const db = getDb();
    const character = await db.character.findUnique({ where: { id } });

    if (!character) {
      throw new ApiError("角色不存在。", 404, "CHARACTER_NOT_FOUND");
    }
    if (character.userId && character.userId !== auth.localUserId) {
      throw new ApiError("无权修改该角色。", 403, "FORBIDDEN");
    }

    const version = await db.characterVersion.findFirst({
      where: {
        id: body.versionId,
        characterId: id,
      },
    });

    if (!version) {
      throw new ApiError("版本不存在。", 404, "VERSION_NOT_FOUND");
    }

    await db.character.update({
      where: { id },
      data: {
        currentVersionId: version.id,
      },
    });

    return jsonOk({ success: true, versionId: version.id });
  } catch (error) {
    return jsonError(error);
  }
}
