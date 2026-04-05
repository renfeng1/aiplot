import "dotenv/config";

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { defaultQuotaConfig, env } from "@/lib/env";
import { hashPassword } from "@/lib/passwords";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run prisma/seed.ts");
}

const adapter = new PrismaPg(
  new Pool({ connectionString: process.env.DATABASE_URL }),
);
const prisma = new PrismaClient({ adapter });

async function ensureAppConfig() {
  await prisma.appConfig.upsert({
    where: { key: "default" },
    update: {
      defaultDistillationQuota: defaultQuotaConfig.distillation,
      defaultChatQuota: defaultQuotaConfig.chat,
      defaultTtsQuota: defaultQuotaConfig.tts,
    },
    create: {
      key: "default",
      defaultDistillationQuota: defaultQuotaConfig.distillation,
      defaultChatQuota: defaultQuotaConfig.chat,
      defaultTtsQuota: defaultQuotaConfig.tts,
    },
  });
}

async function ensureInitialAdmin() {
  if (
    !env.INITIAL_SUPER_ADMIN_USERNAME ||
    !env.INITIAL_SUPER_ADMIN_PASSWORD
  ) {
    return;
  }

  const existingAdmin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
  });

  if (existingAdmin) {
    return;
  }

  const passwordHash = await hashPassword(env.INITIAL_SUPER_ADMIN_PASSWORD);

  const user = await prisma.user.create({
    data: {
      username: env.INITIAL_SUPER_ADMIN_USERNAME.toLowerCase(),
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
      action: "seed.initial_super_admin",
      targetType: "User",
      targetId: user.id,
      payload: { username: user.username },
    },
  });
}

async function main() {
  await ensureAppConfig();
  await ensureInitialAdmin();
  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

