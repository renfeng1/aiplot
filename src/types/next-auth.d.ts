import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      username: string;
      role: "SUPER_ADMIN" | "USER";
      isActive: boolean;
    };
  }

  interface User {
    username: string;
    role: "SUPER_ADMIN" | "USER";
    isActive: boolean;
  }
}
