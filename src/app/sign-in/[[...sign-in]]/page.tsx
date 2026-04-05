"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignInPage() {
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    setSubmitting(false);

    if (!result || result.error) {
      toast.error("用户名或密码错误。");
      return;
    }

    window.location.href = searchParams.get("callbackUrl") || "/characters";
  }

  return (
    <main className="page-shell py-14">
      <Card className="mx-auto max-w-md rounded-[1.75rem]">
        <CardContent className="space-y-6 p-6">
          <div className="space-y-2">
            <h1 className="font-heading text-3xl">登录</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              登录后可创建角色、进入聊天并延续长期记忆。
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </div>
            <Button className="w-full rounded-full" disabled={submitting}>
              {submitting ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                "登录"
              )}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground">
            还没有账号？
            <a href="/sign-up" className="ml-2 text-primary">
              去注册
            </a>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
