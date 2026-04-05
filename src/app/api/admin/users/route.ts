import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/db/prisma";
import { listUsersForAdmin } from "@/server/admin-service";
import { jsonError, jsonOk } from "@/server/http";

const bodySchema = z.object({
  userId: z.string().min(1),
  isActive: z.boolean(),
});

export async function GET() {
  try {
    await requireAdmin();
    const users = await listUsersForAdmin();
    return jsonOk({ users });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = bodySchema.parse(await request.json());
    const db = getDb();
    const user = await db.user.update({
      where: { id: body.userId },
      data: { isActive: body.isActive },
    });

    await db.adminActionLog.create({
      data: {
        actorId: admin.id,
        action: body.isActive ? "user.enabled" : "user.disabled",
        targetType: "User",
        targetId: user.id,
        payload: { username: user.username },
      },
    });

    return jsonOk({ user });
  } catch (error) {
    return jsonError(error);
  }
}

