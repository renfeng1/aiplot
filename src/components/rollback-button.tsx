"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function RollbackButton(props: {
  characterId: string;
  versionId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <Button
      variant="outline"
      className="rounded-full"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const response = await fetch(
            `/api/characters/${props.characterId}/rollback`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ versionId: props.versionId }),
            },
          );

          if (!response.ok) {
            throw new Error("回滚失败。");
          }

          toast.success("已切换到选定版本。");
          router.refresh();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "回滚失败。");
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <RotateCcw className="size-4" />
      )}
      回滚到此版本
    </Button>
  );
}
