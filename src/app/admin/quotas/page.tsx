import { AdminDefaultQuotaForm } from "@/components/admin-default-quota-form";
import { AdminQuotaManager } from "@/components/admin-quota-manager";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdminPage } from "@/lib/auth";
import { getDb } from "@/db/prisma";

export const dynamic = "force-dynamic";

export default async function AdminQuotasPage() {
  await requireAdminPage();
  const db = getDb();
  const [config, quotas] = await Promise.all([
    db.appConfig.findUnique({ where: { key: "default" } }),
    db.userQuota.findMany({
      include: { user: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <div className="pb-20">
      <SiteHeader />
      <main className="page-shell mt-6 space-y-6 sm:mt-10">
        <h1 className="font-heading text-4xl">配额管理</h1>
        <Card className="rounded-[1.75rem]">
          <CardContent className="space-y-4 p-5">
            <div className="text-lg font-semibold">默认新用户配额</div>
            <AdminDefaultQuotaForm
              distillation={config?.defaultDistillationQuota ?? 3}
              chat={config?.defaultChatQuota ?? 100}
              tts={config?.defaultTtsQuota ?? 20}
            />
          </CardContent>
        </Card>
        <AdminQuotaManager quotas={quotas} />
      </main>
    </div>
  );
}
