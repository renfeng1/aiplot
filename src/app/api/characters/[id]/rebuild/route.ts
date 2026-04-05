import { z } from "zod";

import { getDb } from "@/db/prisma";
import { requireSignedIn } from "@/lib/auth";
import { distillCharacter } from "@/server/distillation";
import { ApiError, jsonError, jsonOk } from "@/server/http";
import { rebuildSchema, type CreateCharacterInput } from "@/types";

const paramsSchema = z.object({ id: z.string().min(1) });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSignedIn();
    const { id } = paramsSchema.parse(await context.params);
    const body = rebuildSchema.parse(await request.json());
    const db = getDb();

    const character = await db.character.findUnique({
      where: { id },
      include: {
        currentVersion: true,
        sourceFiles: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!character) {
      throw new ApiError("角色不存在。", 404, "CHARACTER_NOT_FOUND");
    }

    if (character.userId && character.userId !== auth.localUserId) {
      throw new ApiError("无权修改该角色。", 403, "FORBIDDEN");
    }

    const input: CreateCharacterInput = {
      title: character.title,
      description: body.description ?? character.description,
      type: character.type,
      visibility: character.visibility,
      tags: body.tags.length ? body.tags : character.tags,
      sourceIds: Array.from(
        new Set([
          ...character.sourceFiles.map((file: { id: string }) => file.id),
          ...body.sourceIds,
        ]),
      ),
      pastedText: body.pastedText,
      tier: body.tier,
      distillModelId: body.distillModelId,
      chatModelId: undefined,
      confirmRights: true,
      targetCharacterName: body.targetCharacterName ?? character.title,
      targetCharacterAliases: body.targetCharacterAliases,
      userRoleHint:
        body.userRoleHint ??
        ((character.currentVersion?.characterProfile as { userRoleHint?: string } | null)
          ?.userRoleHint ??
          "普通对话对象"),
      sourceFormatHint: body.sourceFormatHint ?? "AUTO",
    };

    await db.character.update({
      where: { id },
      data: {
        description: input.description,
        tags: [...input.tags],
      },
    });

    const result = await distillCharacter({
      characterId: id,
      userId: auth.localUserId,
      input,
    });

    return jsonOk({
      versionId: result.version.id,
      welcomeMessage: result.welcomeMessage,
    });
  } catch (error) {
    return jsonError(error);
  }
}
