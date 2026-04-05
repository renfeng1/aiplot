import type { Adapter } from "next-auth/adapters";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";

import { getDb } from "@/db/prisma";
import { verifyPassword } from "@/lib/passwords";

const credentialsSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(128),
});

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(getDb()) as Adapter,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/sign-in",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) {
          return null;
        }

        const db = getDb();
        const user = await db.user.findUnique({
          where: { username: parsed.data.username.toLowerCase() },
        });

        if (!user || !user.isActive) {
          return null;
        }

        const valid = await verifyPassword(
          parsed.data.password,
          user.passwordHash,
        );

        if (!valid) {
          return null;
        }

        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.name,
          image: user.imageUrl,
          role: user.role,
          isActive: user.isActive,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.username = user.username;
        token.role = user.role;
        token.isActive = user.isActive;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.username = String(token.username ?? "");
        session.user.role = (token.role as "SUPER_ADMIN" | "USER") ?? "USER";
        session.user.isActive = Boolean(token.isActive);
      }
      return session;
    },
  },
});
