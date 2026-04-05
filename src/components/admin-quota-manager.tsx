"use client";

import { useMemo, useState } from "react";

import { AdminQuotaForm } from "@/components/admin-quota-form";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type QuotaItem = {
  id: string;
  userId: string;
  distillationLimit: number;
  distillationUsed: number;
  distillationRemaining: number;
  chatLimit: number;
  chatUsed: number;
  chatRemaining: number;
  ttsLimit: number;
  ttsUsed: number;
  ttsRemaining: number;
  user: {
    username: string;
    name: string | null;
  };
};

export function AdminQuotaManager({ quotas }: { quotas: QuotaItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return quotas;

    return quotas.filter((quota) => {
      return (
        quota.user.username.toLowerCase().includes(normalized) ||
        (quota.user.name ?? "").toLowerCase().includes(normalized)
      );
    });
  }, [quotas, query]);

  return (
    <div className="space-y-4">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="按用户名或昵称筛选特定账号"
      />

      {filtered.map((quota) => (
        <Card key={quota.id} className="rounded-[1.75rem]">
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{quota.user.username}</div>
                <div className="text-sm text-muted-foreground">
                  昵称：{quota.user.name || "未设置"}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                可直接提高该账号的蒸馏 / 对话 / TTS 配额
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              已用蒸馏 {quota.distillationUsed} / 聊天 {quota.chatUsed} / TTS {quota.ttsUsed}
            </div>
            <div className="text-sm text-muted-foreground">
              剩余蒸馏 {quota.distillationRemaining} / 聊天 {quota.chatRemaining} / TTS {quota.ttsRemaining}
            </div>
            <AdminQuotaForm
              userId={quota.userId}
              distillationLimit={quota.distillationLimit}
              chatLimit={quota.chatLimit}
              ttsLimit={quota.ttsLimit}
            />
          </CardContent>
        </Card>
      ))}

      {!filtered.length ? (
        <div className="rounded-[1.75rem] border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
          没找到匹配的账号。
        </div>
      ) : null}
    </div>
  );
}
