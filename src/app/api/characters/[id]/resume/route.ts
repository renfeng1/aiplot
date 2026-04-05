import { after } from "next/server";
import { z } from "zod";

import { requireSignedIn } from "@/lib/auth";
import { requireOwnedCharacter } from "@/server/characters";
import { runCharacterCreation } from "@/server/creation";
import { ApiError, jsonError, jsonOk } from "@/server/http";
import { createCharacterSchema } from "@/types";

const paramsSchema = z.object({ id: z.string().min(1) });
const resumeBodySchema = createCharacterSchema.partial();

function nonEmptyString(value: string | undefined) {
  return value?.trim() ? value : undefined;
}

function nonEmptyArray<T>(value: T[] | undefined) {
  return Array.isArray(value) && value.length > 0 ? value : undefined;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSignedIn();
    const { id } = paramsSchema.parse(await context.params);
    const body = resumeBodySchema.parse(await request.json().catch(() => ({})));
    const character = await requireOwnedCharacter({
      id,
      localUserId: auth.localUserId,
    });

    if (character.creationStatus === "READY" && character.currentVersionId) {
      throw new ApiError("角色已经完成，无需继续蒸馏。", 409, "CHARACTER_READY");
    }

    const draft =
      character.draftInput && typeof character.draftInput === "object"
        ? (character.draftInput as Record<string, unknown>)
        : null;

    if (!draft) {
      throw new ApiError("缺少可恢复的角色草稿。", 400, "DRAFT_INPUT_MISSING");
    }

    const input = createCharacterSchema.parse({
      title: body.title ?? character.title,
      description:
        nonEmptyString(body.description) ??
        draft.description ??
        character.description,
      type: body.type ?? draft.type ?? character.type,
      visibility: character.visibility,
      tags: nonEmptyArray(body.tags) ?? draft.tags ?? character.tags,
      sourceIds: nonEmptyArray(body.sourceIds) ?? draft.sourceIds ?? [],
      pastedText:
        nonEmptyString(body.pastedText) ?? draft.pastedText ?? undefined,
      tier: body.tier ?? draft.tier ?? "FREE",
      distillModelId: body.distillModelId ?? draft.distillModelId ?? undefined,
      chatModelId: undefined,
      confirmRights: true,
      targetCharacterName:
        nonEmptyString(body.targetCharacterName) ??
        draft.targetCharacterName ??
        character.title,
      targetCharacterAliases:
        nonEmptyArray(body.targetCharacterAliases) ??
        draft.targetCharacterAliases ??
        [],
      userRoleHint:
        nonEmptyString(body.userRoleHint) ??
        (typeof draft.userRoleHint === "string" ? draft.userRoleHint : undefined) ??
        "普通对话对象",
      sourceFormatHint: body.sourceFormatHint ?? draft.sourceFormatHint ?? "AUTO",
    });

    after(async () => {
      try {
        await runCharacterCreation({
          characterId: character.id,
          slug: character.slug,
          userId: auth.localUserId,
          input,
          onEvent: async () => {},
        });
      } catch (error) {
        console.error("Background resume distillation failed", error);
      }
    });

    return jsonOk({
      characterId: character.id,
      slug: character.slug,
      stage: "queued",
      progress: 5,
      message: "角色蒸馏已恢复，后台继续执行中。",
    });
  } catch (error) {
    return jsonError(error);
  }
}
