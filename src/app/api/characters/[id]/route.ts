import { z } from "zod";

import { requireSignedIn } from "@/lib/auth";
import { softDeleteCharacterByActor } from "@/server/characters";
import { jsonError, jsonOk } from "@/server/http";

const paramsSchema = z.object({ id: z.string().min(1) });

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSignedIn();
    const { id } = paramsSchema.parse(await context.params);
    const character = await softDeleteCharacterByActor({
      id,
      actorUserId: auth.localUserId!,
      actorRole: auth.role!,
    });

    return jsonOk({
      deleted: true,
      id: character.id,
      slug: character.slug,
    });
  } catch (error) {
    return jsonError(error);
  }
}
