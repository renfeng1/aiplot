import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUserPage } from "@/lib/auth";
import { listOwnedCharacters } from "@/server/characters";
import { getUserQuotaSnapshot } from "@/server/quota-service";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const user = await requireUserPage();
  const [quota, characters] = await Promise.all([
    getUserQuotaSnapshot(user.id),
    listOwnedCharacters({ userId: user.id, take: 5 }),
  ]);

  return (
    <div className="pb-20">
      <SiteHeader />
      <main className="page-shell mt-6 space-y-6 sm:mt-10">
        <section className="surface px-5 py-6 sm:px-6">
          <Badge
            variant="outline"
            className="rounded-full px-3 py-1 text-xs tracking-[0.18em]"
          >
            个人中心
          </Badge>
          <h1 className="mt-3 font-heading text-4xl sm:text-5xl">
            {user.name || user.username}
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            用户名：{user.username}
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: "剩余蒸馏次数",
              value: user.role === "SUPER_ADMIN" ? "无限制" : quota.distillationRemaining,
            },
            {
              title: "剩余对话次数",
              value: user.role === "SUPER_ADMIN" ? "无限制" : quota.chatRemaining,
            },
            {
              title: "最近使用时间",
              value: quota.lastUsedAt
                ? quota.lastUsedAt.toLocaleString("zh-CN")
                : "暂无",
            },
          ].map((item) => (
            <Card key={item.title} className="rounded-[1.75rem]">
              <CardContent className="space-y-2 p-5">
                <div className="text-sm text-muted-foreground">{item.title}</div>
                <div className="text-3xl font-semibold">{String(item.value)}</div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-heading text-3xl">最近角色</h2>
            </div>
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/characters">查看全部</Link>
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {characters.map((character) => (
              <Card key={character.id} className="rounded-[1.75rem]">
                <CardContent className="space-y-4 p-5">
                  <div className="text-lg font-semibold">{character.title}</div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {character.shortDescription ?? character.description}
                  </p>
                  <Button asChild className="w-full rounded-full">
                    <Link href={`/chat/${character.slug}`}>继续聊天</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

