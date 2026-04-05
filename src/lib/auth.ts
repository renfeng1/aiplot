import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getDb } from "@/db/prisma";

export type AuthContext = {
  localUserId: string | null;
  username: string | null;
  role: "SUPER_ADMIN" | "USER" | null;
  isSignedIn: boolean;
  isActive: boolean;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
};

export type AuthUser = {
  id: string;
  username: string;
  role: "SUPER_ADMIN" | "USER";
  isActive: boolean;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
};

export async function optionalAuth(): Promise<AuthUser | null> {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const db = getDb();
  const user = await db.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    email: user.email ?? null,
    name: user.name ?? null,
    imageUrl: user.imageUrl ?? null,
  };
}

export async function getAuthContext(): Promise<AuthContext> {
  const user = await optionalAuth();

  return {
    localUserId: user?.id ?? null,
    username: user?.username ?? null,
    role: user?.role ?? null,
    isSignedIn: Boolean(user),
    isActive: user?.isActive ?? false,
    email: user?.email ?? null,
    name: user?.name ?? null,
    imageUrl: user?.imageUrl ?? null,
  };
}

export async function requireUser() {
  const user = await optionalAuth();

  if (!user) {
    throw new Error("AUTH_REQUIRED");
  }

  if (!user.isActive) {
    throw new Error("ACCOUNT_DISABLED");
  }

  return user;
}

export async function requireSignedIn() {
  const user = await requireUser();

  return {
    localUserId: user.id,
    username: user.username,
    role: user.role,
    isSignedIn: true,
    isActive: true,
    email: user.email,
    name: user.name,
    imageUrl: user.imageUrl,
  } satisfies AuthContext;
}

export async function requireAdmin() {
  const user = await requireUser();

  if (user.role !== "SUPER_ADMIN") {
    throw new Error("FORBIDDEN");
  }

  return user;
}

export async function requireUserPage() {
  const user = await optionalAuth();

  if (!user) {
    redirect("/sign-in" as never);
  }

  if (!user.isActive) {
    redirect("/sign-in?error=disabled" as never);
  }

  return user;
}

export async function requireAdminPage() {
  const user = await requireUserPage();

  if (user.role !== "SUPER_ADMIN") {
    redirect("/" as never);
  }

  return user;
}
