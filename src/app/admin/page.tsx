import type { Route } from "next";
import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdminPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdminPage();

  const links = [
    { href: "/admin/users", title: "用户管理", body: "查看用户、启用或禁用账号。" },
    { href: "/admin/quotas", title: "配额管理", body: "查看剩余次数并调整默认或个人配额。" },
    { href: "/admin/usage", title: "调用统计", body: "查看蒸馏、聊天、TTS 等调用记录。" },
    { href: "/admin/characters", title: "公共角色管理", body: "查看和管理公共角色。" },
  ];

  return (
    <div className="pb-20">
      <SiteHeader />
      <main className="page-shell mt-6 space-y-6 sm:mt-10">
        <section className="surface px-5 py-6 sm:px-6">
          <h1 className="font-heading text-4xl sm:text-5xl">管理后台</h1>
        </section>
        <div className="grid gap-4 md:grid-cols-2">
          {links.map((item) => (
              <Link key={item.href} href={item.href as Route}>
              <Card className="rounded-[1.75rem] transition-transform hover:-translate-y-0.5">
                <CardContent className="space-y-2 p-5">
                  <div className="text-lg font-semibold">{item.title}</div>
                  <div className="text-sm leading-6 text-muted-foreground">
                    {item.body}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
