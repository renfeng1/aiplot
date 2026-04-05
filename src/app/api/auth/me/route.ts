import { optionalAuth } from "@/lib/auth";
import { getUserQuotaSnapshot } from "@/server/quota-service";
import { jsonError, jsonOk } from "@/server/http";

export async function GET() {
  try {
    const user = await optionalAuth();

    if (!user) {
      return jsonOk({ user: null });
    }

    const quota = await getUserQuotaSnapshot(user.id);

    return jsonOk({
      user,
      quota,
    });
  } catch (error) {
    return jsonError(error);
  }
}
