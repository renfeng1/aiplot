"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AdminQuotaFormProps = {
  userId: string;
  distillationLimit: number;
  chatLimit: number;
  ttsLimit: number;
};

export function AdminQuotaForm({
  userId,
  distillationLimit,
  chatLimit,
  ttsLimit,
}: AdminQuotaFormProps) {
  const [distillation, setDistillation] = useState(distillationLimit);
  const [chat, setChat] = useState(chatLimit);
  const [tts, setTts] = useState(ttsLimit);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    const response = await fetch("/api/admin/quotas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "user",
        userId,
        distillationLimit: Number(distillation),
        chatLimit: Number(chat),
        ttsLimit: Number(tts),
      }),
    });

    setPending(false);

    if (!response.ok) {
      toast.error("更新配额失败。");
      return;
    }

    toast.success("用户配额已更新。");
    window.location.reload();
  }

  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={handleSubmit}>
      <Input
        className="w-20"
        type="number"
        min={0}
        value={distillation}
        onChange={(event) => setDistillation(Number(event.target.value))}
      />
      <Input
        className="w-20"
        type="number"
        min={0}
        value={chat}
        onChange={(event) => setChat(Number(event.target.value))}
      />
      <Input
        className="w-20"
        type="number"
        min={0}
        value={tts}
        onChange={(event) => setTts(Number(event.target.value))}
      />
      <Button type="submit" variant="outline" className="rounded-full" disabled={pending}>
        保存
      </Button>
    </form>
  );
}

