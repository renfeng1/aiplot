import { listPublicCharacters } from "@/server/characters";
import { jsonError, jsonOk } from "@/server/http";

export async function GET() {
  try {
    const characters = await listPublicCharacters();
    return jsonOk({ characters });
  } catch (error) {
    return jsonError(error);
  }
}

