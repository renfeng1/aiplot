import { AdminUserToggle } from "@/components/admin-user-toggle";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdminPage } from "@/lib/auth";
import { listUsersForAdmin } from "@/server/admin-service";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireAdminPage();
  const users = await listUsersForAdmin();

  return (
    <div className="pb-20">
      <SiteHeader />
      <main className="page-shell mt-6 space-y-4 sm:mt-10">
        <h1 className="font-heading text-4xl">用户管理</h1>
        <div className="space-y-4">
          {users.map((user) => (
            <Card key={user.id} className="rounded-[1.75rem]">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <div className="text-lg font-semibold">{user.username}</div>
                  <div className="text-sm text-muted-foreground">
                    角色：{user.role} · 状态：{user.isActive ? "启用" : "禁用"} ·
                    拥有角色数：{user._count.characters}
                  </div>
                </div>
                <AdminUserToggle userId={user.id} isActive={user.isActive} />
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}

