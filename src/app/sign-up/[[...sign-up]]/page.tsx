"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function readApiError(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return data?.error?.message ?? fallback;
}

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, name }),
    });

    if (!response.ok) {
      setSubmitting(false);
      toast.error(await readApiError(response, "注册失败。"));
      return;
    }

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    setSubmitting(false);

    if (!result || result.error) {
      toast.error("注册成功，但自动登录失败，请手动登录。");
      window.location.href = "/sign-in";
      return;
    }

    window.location.href = "/characters";
  }

  return (
    <main className="page-shell py-14">
      <Card className="mx-auto max-w-md rounded-[1.75rem]">
        <CardContent className="space-y-6 p-6">
          <div className="space-y-2">
            <h1 className="font-heading text-3xl">注册</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              创建你的账号后，可拥有私有角色、聊天历史和长期关系记忆。
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="name">昵称</Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
              />
            </div>
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
                autoComplete="new-password"
              />
            </div>
            <Button className="w-full rounded-full" disabled={submitting}>
              {submitting ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                "注册"
              )}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground">
            已有账号？
            <a href="/sign-in" className="ml-2 text-primary">
              去登录
            </a>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
