"use client";

import type { Route } from "next";
import { LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ComponentProps, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

async function readApiError(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;

  return data?.error?.message ?? fallback;
}

export function DeleteCharacterButton(props: {
  characterId: string;
  characterTitle: string;
  redirectTo?: Route;
  className?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);

    try {
      const response = await fetch(`/api/characters/${props.characterId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "删除角色失败。"));
      }

      toast.success("角色已删除。");
      setOpen(false);

      if (props.redirectTo) {
        router.push(props.redirectTo);
      }

      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除角色失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={props.variant ?? "destructive"}
          size={props.size ?? "default"}
          className={props.className}
        >
          <Trash2 className="size-4" />
          {props.label ?? "删除角色"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            删除“{props.characterTitle}”？
          </AlertDialogTitle>
          <AlertDialogDescription>
            删除后，这个角色会从你的角色列表中移除，并且不会继续在角色页显示。
            这个操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={loading}
            onClick={(event) => {
              event.preventDefault();
              void handleDelete();
            }}
          >
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            确认删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
