import { requireAdmin } from "@/lib/auth";
import { listAdminPublicCharacters } from "@/server/characters";
import { jsonError, jsonOk } from "@/server/http";

export async function GET() {
  try {
    await requireAdmin();
    const characters = await listAdminPublicCharacters();
    return jsonOk({ characters });
  } catch (error) {
    return jsonError(error);
  }
}
