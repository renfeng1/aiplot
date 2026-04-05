"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type AdminUserToggleProps = {
  userId: string;
  isActive: boolean;
};

export function AdminUserToggle({
  userId,
  isActive,
}: AdminUserToggleProps) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        isActive: !isActive,
      }),
    });
    setPending(false);

    if (!response.ok) {
      toast.error("更新用户状态失败。");
      return;
    }

    toast.success("用户状态已更新。");
    window.location.reload();
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="rounded-full"
      disabled={pending}
      onClick={() => void handleClick()}
    >
      {isActive ? "禁用" : "启用"}
    </Button>
  );
}

