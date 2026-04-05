"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

function initials(value: string) {
  return value.slice(0, 2).toUpperCase();
}

export function HeaderAuth() {
  const { data, status } = useSession();

  if (status === "loading") {
    return null;
  }

  if (!data?.user) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" className="rounded-full">
          <a href="/sign-in">登录</a>
        </Button>
        <Button asChild className="rounded-full">
          <a href="/sign-up">注册</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" className="rounded-full">
        <Link href="/me">个人中心</Link>
      </Button>
      {data.user.role === "SUPER_ADMIN" ? (
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/admin">管理后台</Link>
        </Button>
      ) : null}
      <Avatar size="sm">
        <AvatarFallback>{initials(data.user.username)}</AvatarFallback>
      </Avatar>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="rounded-full"
        onClick={() => void signOut({ callbackUrl: "/" })}
      >
        <LogOut className="size-4" />
      </Button>
    </div>
  );
}
