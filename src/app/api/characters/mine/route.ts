import { requireSignedIn } from "@/lib/auth";
import { listOwnedCharacters } from "@/server/characters";
import { jsonError, jsonOk } from "@/server/http";

export async function GET() {
  try {
    const auth = await requireSignedIn();
    const characters = await listOwnedCharacters({
      localUserId: auth.localUserId,
    });
    return jsonOk({ characters });
  } catch (error) {
    return jsonError(error);
  }
}

