import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdminPage } from "@/lib/auth";
import { getUsageSummaryByUser, listUsageLogs } from "@/server/admin-service";

export const dynamic = "force-dynamic";

export default async function AdminUsagePage() {
  await requireAdminPage();
  const [summary, logs] = await Promise.all([
    getUsageSummaryByUser(),
    listUsageLogs(),
  ]);

  return (
    <div className="pb-20">
      <SiteHeader />
      <main className="page-shell mt-6 space-y-6 sm:mt-10">
        <h1 className="font-heading text-4xl">调用统计</h1>

        <div className="grid gap-4 md:grid-cols-2">
          {summary.map((item) => (
            <Card key={item.user.id} className="rounded-[1.75rem]">
              <CardContent className="space-y-2 p-5">
                <div className="text-lg font-semibold">{item.user.username}</div>
                <div className="text-sm text-muted-foreground">
                  总调用 {item.totals.total} · 蒸馏 {item.totals.distill} · 聊天 {item.totals.chat}
                  {" "}· TTS {item.totals.tts}
                </div>
                <div className="text-sm text-muted-foreground">
                  成功 {item.totals.success} · 失败 {item.totals.failure}
                </div>
                <div className="text-sm text-muted-foreground">
                  最近调用：{item.latestUsage?.createdAt.toLocaleString("zh-CN") ?? "暂无"}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          {logs.map((log) => (
            <Card key={log.id} className="rounded-[1.75rem]">
              <CardContent className="space-y-1 p-5">
                <div className="text-sm font-semibold">
                  {log.user?.username ?? "匿名"} · {log.eventType} · {log.model ?? "unknown"}
                </div>
                <div className="text-sm text-muted-foreground">
                  时间：{log.createdAt.toLocaleString("zh-CN")} · tokens：
                  {log.totalTokens ?? 0} · {log.success ? "成功" : "失败"}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}

