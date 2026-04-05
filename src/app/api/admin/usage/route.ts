import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { getUsageSummaryByUser, listUsageLogs } from "@/server/admin-service";
import { jsonError, jsonOk } from "@/server/http";

const querySchema = z.object({
  eventType: z.string().optional(),
  userId: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const query = querySchema.parse({
      eventType: url.searchParams.get("eventType") ?? undefined,
      userId: url.searchParams.get("userId") ?? undefined,
    });

    const [logs, summary] = await Promise.all([
      listUsageLogs(query),
      getUsageSummaryByUser(),
    ]);
    return jsonOk({ logs, summary });
  } catch (error) {
    return jsonError(error);
  }
}

