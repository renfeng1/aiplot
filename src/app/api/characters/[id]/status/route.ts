import { z } from "zod";

import { requireSignedIn } from "@/lib/auth";
import { getOwnedCharacterById } from "@/server/characters";
import { isCreationStale } from "@/server/creation";
import { ApiError, jsonError, jsonOk } from "@/server/http";

const paramsSchema = z.object({ id: z.string().min(1) });

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSignedIn();
    const { id } = paramsSchema.parse(await context.params);
    const character = await getOwnedCharacterById({
      id,
      localUserId: auth.localUserId,
    });

    if (!character) {
      throw new ApiError("角色不存在。", 404, "CHARACTER_NOT_FOUND");
    }

    return jsonOk({
      id: character.id,
      slug: character.slug,
      title: character.title,
      creationStatus: character.creationStatus,
      creationStage: character.creationStage,
      creationProgress: character.creationProgress,
      creationMessage: character.creationMessage,
      lastError: character.lastError,
      currentVersionId: character.currentVersionId,
      isStale: isCreationStale(character.lastHeartbeatAt),
    });
  } catch (error) {
    return jsonError(error);
  }
}
