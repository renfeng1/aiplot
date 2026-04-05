import "dotenv/config";

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { hashPassword } from "@/lib/passwords";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run prisma/init-admin.ts");
}

if (!env.INITIAL_SUPER_ADMIN_USERNAME || !env.INITIAL_SUPER_ADMIN_PASSWORD) {
  throw new Error(
    "INITIAL_SUPER_ADMIN_USERNAME and INITIAL_SUPER_ADMIN_PASSWORD are required.",
  );
}

const adapter = new PrismaPg(
  new Pool({ connectionString: process.env.DATABASE_URL }),
);
const prisma = new PrismaClient({ adapter });

async function main() {
  const existingAdmin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
  });

  if (existingAdmin) {
    console.log("SUPER_ADMIN already exists, skipping.");
    return;
  }

  const passwordHash = await hashPassword(env.INITIAL_SUPER_ADMIN_PASSWORD!);
  const username = env.INITIAL_SUPER_ADMIN_USERNAME!.toLowerCase();

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      role: "SUPER_ADMIN",
      isActive: true,
      quota: {
        create: {
          distillationLimit: 999999,
          distillationUsed: 0,
          distillationRemaining: 999999,
          chatLimit: 999999,
          chatUsed: 0,
          chatRemaining: 999999,
          ttsLimit: 999999,
          ttsUsed: 0,
          ttsRemaining: 999999,
        },
      },
    },
  });

  await prisma.adminActionLog.create({
    data: {
      actorId: user.id,
      action: "script.initial_super_admin",
      targetType: "User",
      targetId: user.id,
      payload: { username },
    },
  });

  console.log(`Created SUPER_ADMIN: ${username}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
