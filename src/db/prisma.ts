import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

declare global {
  var prismaGlobal: PrismaClient | undefined;
  var prismaPoolGlobal: Pool | undefined;
  var prismaAdapterGlobal: PrismaPg | undefined;
}

let prismaInstance: PrismaClient | undefined = globalThis.prismaGlobal;

export function getDb() {
  if (prismaInstance) {
    return prismaInstance;
  }

  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const pool =
    globalThis.prismaPoolGlobal ??
    new Pool({
      connectionString: env.DATABASE_URL,
    });

  const adapter = globalThis.prismaAdapterGlobal ?? new PrismaPg(pool);

  prismaInstance = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  if (process.env.NODE_ENV !== "production") {
    globalThis.prismaGlobal = prismaInstance;
    globalThis.prismaPoolGlobal = pool;
    globalThis.prismaAdapterGlobal = adapter;
  }

  return prismaInstance;
}
