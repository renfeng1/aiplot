"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AdminDefaultQuotaFormProps = {
  distillation: number;
  chat: number;
  tts: number;
};

export function AdminDefaultQuotaForm({
  distillation,
  chat,
  tts,
}: AdminDefaultQuotaFormProps) {
  const [distillationValue, setDistillationValue] = useState(distillation);
  const [chatValue, setChatValue] = useState(chat);
  const [ttsValue, setTtsValue] = useState(tts);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    const response = await fetch("/api/admin/quotas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "default",
        distillation: Number(distillationValue),
        chat: Number(chatValue),
        tts: Number(ttsValue),
      }),
    });

    setPending(false);

    if (!response.ok) {
      toast.error("更新默认配额失败。");
      return;
    }

    toast.success("默认配额已更新。");
    window.location.reload();
  }

  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={handleSubmit}>
      <Input
        className="w-24"
        type="number"
        min={0}
        value={distillationValue}
        onChange={(event) => setDistillationValue(Number(event.target.value))}
      />
      <Input
        className="w-24"
        type="number"
        min={0}
        value={chatValue}
        onChange={(event) => setChatValue(Number(event.target.value))}
      />
      <Input
        className="w-24"
        type="number"
        min={0}
        value={ttsValue}
        onChange={(event) => setTtsValue(Number(event.target.value))}
      />
      <Button type="submit" variant="outline" className="rounded-full" disabled={pending}>
        保存默认配额
      </Button>
    </form>
  );
}

