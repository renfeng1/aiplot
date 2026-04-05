"use client";

import { Camera, LoaderCircle, Save } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { appLimits } from "@/lib/constants";
import { uploadSourceFile } from "@/lib/source-upload";

type UploadedSource = {
  id: string;
  name: string;
  status: "uploading" | "processing" | "uploaded" | "failed";
  progress: number;
};

function sourceStatusLabel(source: UploadedSource) {
  if (source.status === "uploaded") return "已完成";
  if (source.status === "failed") return "失败";
  if (source.status === "processing") return "解析中";
  return `${source.progress}%`;
}

export function CharacterEditForm(props: {
  characterId: string;
  slug: string;
  description: string;
  tags: string[];
  targetCharacterName: string;
  targetCharacterAliases: string[];
  userRoleHint: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState(props.description);
  const [tags, setTags] = useState(props.tags.join("，"));
  const [targetCharacterName, setTargetCharacterName] = useState(
    props.targetCharacterName,
  );
  const [targetCharacterAliases, setTargetCharacterAliases] = useState(
    props.targetCharacterAliases.join("，"),
  );
  const [userRoleHint, setUserRoleHint] = useState(props.userRoleHint);
  const [pastedText, setPastedText] = useState("");
  const [sources, setSources] = useState<UploadedSource[]>([]);
  const [isSaving, setSaving] = useState(false);
  const hasPendingSources = sources.some((source) =>
    ["uploading", "processing"].includes(source.status),
  );

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;

    for (const file of list) {
      const sourceId = crypto.randomUUID();
      setSources((current) => [
        ...current,
        {
          id: sourceId,
          name: file.name,
          status: "uploading",
          progress: 0,
        },
      ]);

      try {
        await uploadSourceFile({
          file,
          sourceId,
          onUploadProgress: ({ percentage }) => {
            setSources((current) =>
              current.map((source) =>
                source.id === sourceId
                  ? {
                      ...source,
                      status: "uploading",
                      progress: Math.round(percentage),
                    }
                  : source,
              ),
            );
          },
          onProcessingStart: () => {
            setSources((current) =>
              current.map((source) =>
                source.id === sourceId
                  ? {
                      ...source,
                      status: "processing",
                      progress: Math.max(source.progress, 96),
                    }
                  : source,
              ),
            );
          },
        });

        setSources((current) =>
          current.map((source) =>
            source.id === sourceId
              ? { ...source, status: "uploaded", progress: 100 }
              : source,
          ),
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Source upload failed.",
        );
        setSources((current) =>
          current.map((source) =>
            source.id === sourceId
              ? { ...source, status: "failed", progress: 100 }
              : source,
          ),
        );
      }
    }
  }

  async function handleSubmit() {
    if (hasPendingSources) {
      toast.error("Please wait for source uploads to finish processing.");
      return;
    }

    if (!userRoleHint.trim()) {
      toast.error("请先说明你在 ta 那里是谁。");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(
        `/api/characters/${props.characterId}/rebuild`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description,
            tags: tags
              .split(/[，,]/)
              .map((item) => item.trim())
              .filter(Boolean),
            targetCharacterName,
            targetCharacterAliases: targetCharacterAliases
              .split(/[，,]/)
              .map((item) => item.trim())
              .filter(Boolean),
            userRoleHint,
            pastedText: pastedText.trim() || undefined,
            sourceIds: sources
              .filter((item) => item.status === "uploaded")
              .map((item) => item.id),
            tier: "ADVANCED",
          }),
        },
      );

      if (!response.ok) {
        throw new Error("增量蒸馏失败。");
      }

      toast.success("角色已更新。");
      router.push(`/characters/${props.slug}/versions`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="surface px-5 py-6">
        <div className="space-y-3">
          <div className="text-xs tracking-[0.18em] text-muted-foreground">
            编辑角色
          </div>
          <h1 className="font-heading text-4xl">
            继续补资料，让角色更像 ta
          </h1>
          <p className="text-sm leading-7 text-muted-foreground">
            你可以补充新的文档、照片或更精确的文字描述，再重新蒸馏出新版本。
          </p>
        </div>
      </div>

      <div className="surface p-5">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>角色描述</Label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-28"
            />
          </div>
          <div className="space-y-2">
            <Label>目标人物 / 主角名</Label>
            <Input
              value={targetCharacterName}
              onChange={(event) => setTargetCharacterName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>别名 / 称呼</Label>
            <Input
              value={targetCharacterAliases}
              onChange={(event) => setTargetCharacterAliases(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>你是谁 / 你在 ta 那里是谁</Label>
            <Textarea
              value={userRoleHint}
              onChange={(event) => setUserRoleHint(event.target.value)}
              className="min-h-24"
              placeholder="例如：我是她从小认识的旧识；我是他护着的搭档；我是他迟迟没说破心意的人。"
            />
            <div className="text-xs text-muted-foreground">
              这会直接影响角色对你的默认关系姿态和情感张力。
            </div>
          </div>
          <div className="space-y-2">
            <Label>标签</Label>
            <Input value={tags} onChange={(event) => setTags(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>补充文本</Label>
            <Textarea
              value={pastedText}
              onChange={(event) => setPastedText(event.target.value)}
              maxLength={appLimits.maxPastedTextChars}
              className="min-h-32"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => fileInputRef.current?.click()}
            >
              上传资料
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => captureInputRef.current?.click()}
            >
              <Camera className="size-4" />
              拍照 / 相册
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".txt,.md,.docx,.pdf,image/png,image/jpeg,image/webp,image/heic"
            onChange={(event) =>
              event.target.files && void handleFiles(event.target.files)
            }
          />
          <input
            ref={captureInputRef}
            type="file"
            className="hidden"
            accept="image/*"
            capture="environment"
            onChange={(event) =>
              event.target.files && void handleFiles(event.target.files)
            }
          />

          <div className="space-y-3">
            {sources.map((source) => (
              <div key={source.id} className="rounded-3xl bg-secondary/60 p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{source.name}</span>
                  <span className="text-muted-foreground">
                    {sourceStatusLabel(source)}
                  </span>
                </div>
                <Progress value={source.progress} className="mt-3 h-1.5" />
                {source.status === "processing" ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    文件已上传，正在提取文本内容。
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <Button
            type="button"
            className="w-full rounded-full"
            disabled={isSaving || hasPendingSources}
            onClick={() => void handleSubmit()}
          >
            {isSaving ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            生成新版本
          </Button>
        </div>
      </div>
    </div>
  );
}
