import "server-only";

import { z } from "zod";

import { getDb } from "@/db/prisma";
import { hashPassword } from "@/lib/passwords";
import { ApiError } from "@/server/http";
import { ensureUserQuota } from "@/server/quota-service";

const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(128),
  name: z.string().max(80).optional(),
});

export async function registerUser(input: z.infer<typeof registerSchema>) {
  const parsed = registerSchema.parse(input);
  const db = getDb();
  const config = await db.appConfig.findUnique({
    where: { key: "default" },
  });

  if (config && !config.allowRegistration) {
    throw new ApiError("当前暂未开放注册。", 403, "REGISTRATION_DISABLED");
  }

  const username = parsed.username.toLowerCase();
  const existing = await db.user.findUnique({
    where: { username },
  });

  if (existing) {
    throw new ApiError("用户名已存在。", 409, "USERNAME_TAKEN");
  }

  const passwordHash = await hashPassword(parsed.password);

  const user = await db.user.create({
    data: {
      username,
      passwordHash,
      name: parsed.name?.trim() || null,
      role: "USER",
      isActive: true,
    },
  });

  await ensureUserQuota(user.id);

  return user;
}

