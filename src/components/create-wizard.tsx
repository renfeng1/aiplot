"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, RefreshCcw, Sparkles, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { appLimits, sourceFormatOptions, typeOptions } from "@/lib/constants";
import { uploadSourceFile } from "@/lib/source-upload";
import type { CharacterVisibility } from "@/types";

const FIXED_DISTILL_MODEL_ID = "gpt-5.4";
const FIXED_DISTILL_MODEL_LABEL = "GPT-5.4";
const ACTIVE_CHARACTER_KEY = "aiplot:create:character-id";
const DRAFT_KEY = "aiplot:create:draft";

type LocalSource = {
  id: string;
  name: string;
  mimeType: string;
  status: "queued" | "uploading" | "processing" | "uploaded" | "failed";
  progress: number;
  error?: string;
};

type CharacterStatus = {
  id: string;
  slug: string;
  title: string;
  creationStatus: "DRAFT" | "DISTILLING" | "FAILED" | "READY";
  creationStage: string | null;
  creationProgress: number;
  creationMessage: string | null;
  lastError: string | null;
  currentVersionId: string | null;
  isStale: boolean;
};

type PersistedDraft = {
  title: string;
  targetCharacterName: string;
  aliases: string;
  userRoleHint: string;
  description: string;
  tags: string;
  type: "CUSTOM" | "HISTORICAL" | "FICTIONAL" | "REAL_PERSON";
  sourceFormatHint: "AUTO" | "NOVEL" | "PLAIN_TEXT" | "CHAT_LOG" | "SCRIPT";
  tier: "FREE" | "ADVANCED";
  pastedText: string;
  sources: LocalSource[];
};

function emptyDraft(): PersistedDraft {
  return {
    title: "",
    targetCharacterName: "",
    aliases: "",
    userRoleHint: "",
    description: "",
    tags: "",
    type: "CUSTOM",
    sourceFormatHint: "AUTO",
    tier: "FREE",
    pastedText: "",
    sources: [],
  };
}

async function readApiError(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return data?.error?.message ?? fallback;
}

export function CreateWizard(props: {
  blobConfigured: boolean;
  databaseConfigured: boolean;
  aiConfigured: boolean;
  allowPublicCreation: boolean;
  initialVisibility: CharacterVisibility;
  initialCharacterId?: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<PersistedDraft>(emptyDraft());
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(
    props.initialCharacterId ?? null,
  );
  const [status, setStatus] = useState<CharacterStatus | null>(null);
  const [progress, setProgress] = useState({
    progress: 0,
    message: "准备开始",
  });
  const [submitting, setSubmitting] = useState(false);

  const uploadedSourceIds = useMemo(
    () =>
      draft.sources
        .filter((source) => source.status === "uploaded")
        .map((source) => source.id),
    [draft.sources],
  );

  useEffect(() => {
    const savedDraft = localStorage.getItem(DRAFT_KEY);
    const savedActive = localStorage.getItem(ACTIVE_CHARACTER_KEY);

    if (savedDraft) {
      try {
        setDraft({
          ...emptyDraft(),
          ...(JSON.parse(savedDraft) as PersistedDraft),
        });
      } catch {}
    }

    if (!props.initialCharacterId && savedActive) {
      setActiveCharacterId(savedActive);
    }
  }, [props.initialCharacterId]);

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  useEffect(() => {
    if (activeCharacterId) {
      localStorage.setItem(ACTIVE_CHARACTER_KEY, activeCharacterId);
    } else {
      localStorage.removeItem(ACTIVE_CHARACTER_KEY);
    }
  }, [activeCharacterId]);

  async function fetchStatus(characterId: string) {
    const response = await fetch(`/api/characters/${characterId}/status`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(await readApiError(response, "读取角色状态失败。"));
    }

    return (await response.json()) as CharacterStatus;
  }

  useEffect(() => {
    if (!activeCharacterId) {
      return;
    }

    let cancelled = false;
    const sync = async () => {
      const next = await fetchStatus(activeCharacterId).catch(() => null);
      if (!next || cancelled) return;
      setStatus(next);
      setProgress({
        progress: next.creationProgress,
        message:
          next.creationMessage ||
          next.lastError ||
          "角色状态已同步。",
      });
    };

    void sync();
    const timer = window.setInterval(sync, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeCharacterId]);

  useEffect(() => {
    if (status?.creationStatus === "READY" && status.slug) {
      localStorage.removeItem(ACTIVE_CHARACTER_KEY);
    }
  }, [status]);

  useEffect(() => {
    if (!draft.targetCharacterName.trim() && draft.title.trim()) {
      setDraft((current) => ({
        ...current,
        targetCharacterName: current.title.trim(),
      }));
    }
  }, [draft.targetCharacterName, draft.title]);

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;

    if (draft.sources.length + list.length > appLimits.maxSourceFilesPerRun) {
      toast.error(`单次最多上传 ${appLimits.maxSourceFilesPerRun} 份资料。`);
      return;
    }

    for (const file of list) {
      const sourceId = crypto.randomUUID();
      setDraft((current) => ({
        ...current,
        sources: [
          ...current.sources,
          {
            id: sourceId,
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            status: "queued",
            progress: 0,
          },
        ],
      }));

      try {
        await uploadSourceFile({
          file,
          sourceId,
          onUploadProgress: ({ percentage }) =>
            setDraft((current) => ({
              ...current,
              sources: current.sources.map((item) =>
                item.id === sourceId
                  ? {
                      ...item,
                      status: "uploading",
                      progress: percentage,
                      error: undefined,
                    }
                  : item,
              ),
            })),
          onProcessingStart: () =>
            setDraft((current) => ({
              ...current,
              sources: current.sources.map((item) =>
                item.id === sourceId
                  ? {
                      ...item,
                      status: "processing",
                      progress: 96,
                      error: undefined,
                    }
                  : item,
              ),
            })),
        });

        setDraft((current) => ({
          ...current,
          sources: current.sources.map((item) =>
            item.id === sourceId
              ? { ...item, status: "uploaded", progress: 100 }
              : item,
          ),
        }));
      } catch (error) {
        setDraft((current) => ({
          ...current,
          sources: current.sources.map((item) =>
            item.id === sourceId
              ? {
                  ...item,
                  status: "failed",
                  error: error instanceof Error ? error.message : "上传失败",
                }
              : item,
          ),
        }));
      }
    }
  }

  async function startCreation(url: string) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: draft.title,
        targetCharacterName: draft.targetCharacterName.trim() || draft.title.trim(),
        targetCharacterAliases: draft.aliases
          .split(/[，,]/)
          .map((item) => item.trim())
          .filter(Boolean),
        userRoleHint: draft.userRoleHint,
        description: draft.description,
        tags: draft.tags
          .split(/[，,]/)
          .map((item) => item.trim())
          .filter(Boolean),
        type: draft.type,
        visibility: props.allowPublicCreation ? "PUBLIC" : "PRIVATE",
        sourceFormatHint: draft.sourceFormatHint,
        tier: draft.tier,
        distillModelId: FIXED_DISTILL_MODEL_ID,
        pastedText: draft.pastedText.trim() || undefined,
        sourceIds: uploadedSourceIds,
        confirmRights: draft.type !== "REAL_PERSON",
      }),
    });

    if (!response.ok) {
      throw new Error(await readApiError(response, "角色蒸馏失败。"));
    }

    return (await response.json()) as {
      characterId: string;
      slug: string;
      progress: number;
      message: string;
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!props.databaseConfigured) {
      toast.error("当前没有配置 DATABASE_URL。");
      return;
    }
    if (!props.aiConfigured) {
      toast.error("当前没有配置 BLTCY_API_KEY。");
      return;
    }
    if (!draft.title.trim() || !draft.description.trim() || !draft.userRoleHint.trim()) {
      toast.error("请至少填写角色名称、描述和关系锚点。");
      return;
    }
    if (!uploadedSourceIds.length && !draft.pastedText.trim()) {
      toast.error("请至少上传一份资料或粘贴一段文本。");
      return;
    }

    setSubmitting(true);
    try {
      const payload = await startCreation(
        activeCharacterId && status?.creationStatus !== "READY"
          ? `/api/characters/${activeCharacterId}/resume`
          : "/api/distill",
      );

      setActiveCharacterId(payload.characterId);
      setProgress({
        progress: payload.progress,
        message: payload.message,
      });
      toast.success("角色蒸馏已转入后台执行。你可以继续新建其他角色。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "角色蒸馏失败。");
    } finally {
      setSubmitting(false);
    }
  }

  function startFreshCreate() {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(ACTIVE_CHARACTER_KEY);
    setDraft(emptyDraft());
    setActiveCharacterId(null);
    setStatus(null);
    setProgress({
      progress: 0,
      message: "准备开始",
    });
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <Card className="rounded-[1.75rem]">
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <h1 className="font-heading text-4xl sm:text-5xl">创建角色</h1>
              <p className="text-sm leading-7 text-muted-foreground">
                上传资料并蒸馏成长期可聊天的角色。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={startFreshCreate}
            >
              <RefreshCcw className="size-4" />
              新建角色
            </Button>
          </div>

          <div className="space-y-2">
            <Label>蒸馏进度</Label>
            <Progress value={progress.progress} className="h-2" />
            <div className="text-sm text-muted-foreground">{progress.message}</div>
          </div>

          {status ? (
            <div className="rounded-3xl border border-border/70 bg-secondary/60 p-4 text-sm">
              <div className="font-medium">{status.title}</div>
              <div className="mt-1 text-muted-foreground">
                状态：
                {status.creationStatus === "READY"
                  ? "已完成"
                  : status.creationStatus === "FAILED"
                    ? "失败"
                    : status.creationStatus === "DISTILLING"
                      ? "创建中"
                      : "草稿"}
              </div>
              <div className="mt-1 text-muted-foreground">
                {status.creationMessage || status.lastError || "角色状态已同步。"}
              </div>
              {status.creationStatus === "READY" ? (
                <div className="mt-4">
                  <Button
                    type="button"
                    className="rounded-full"
                    onClick={() => router.push(`/chat/${status.slug}`)}
                  >
                    进入聊天
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="rounded-[1.75rem]">
        <CardContent className="p-6">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>角色名称</Label>
                <Input
                  value={draft.title}
                  onChange={(e) =>
                    setDraft((current) => ({ ...current, title: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>目标人物 / 主角名</Label>
                <Input
                  value={draft.targetCharacterName}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      targetCharacterName: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>别名 / 称呼</Label>
                <Input
                  value={draft.aliases}
                  onChange={(e) =>
                    setDraft((current) => ({ ...current, aliases: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>你在 ta 那里是谁</Label>
                <Textarea
                  className="min-h-24"
                  value={draft.userRoleHint}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      userRoleHint: e.target.value,
                    }))
                  }
                  placeholder="例如：我是他的搭档 / 我是她记着的人 / 我是正在被他带着的徒弟。"
                />
              </div>
              <div className="space-y-2">
                <Label>文本形态</Label>
                <Select
                  value={draft.sourceFormatHint}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      sourceFormatHint:
                        value as "AUTO" | "NOVEL" | "PLAIN_TEXT" | "CHAT_LOG" | "SCRIPT",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceFormatOptions.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>角色类型</Label>
                <Select
                  value={draft.type}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      type: value as PersistedDraft["type"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>角色归属</Label>
                <Input
                  value={
                    props.allowPublicCreation
                      ? "公共角色（管理员创建自动公开）"
                      : "我的角色（普通用户默认私有）"
                  }
                  readOnly
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>一句话描述</Label>
                <Textarea
                  className="min-h-24"
                  value={draft.description}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      description: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>标签</Label>
                <Input
                  value={draft.tags}
                  onChange={(e) =>
                    setDraft((current) => ({ ...current, tags: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label>上传资料</Label>
              <button
                type="button"
                className="surface flex min-h-32 w-full flex-col items-center justify-center gap-3 border-dashed px-4 py-8 text-center"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="size-6 text-primary" />
                <div className="space-y-1">
                  <div className="font-medium">点击上传文件</div>
                  <div className="text-sm text-muted-foreground">
                    支持 txt、md、docx、pdf、图片
                  </div>
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".txt,.md,.docx,.pdf,image/png,image/jpeg,image/webp,image/heic"
                onChange={(event) => {
                  if (event.target.files) void handleFiles(event.target.files);
                }}
              />
              <div className="space-y-2">
                {draft.sources.map((source) => (
                  <div
                    key={source.id}
                    className="rounded-3xl bg-secondary/65 px-4 py-3 text-sm"
                  >
                    <div className="font-medium">{source.name}</div>
                    <div className="text-muted-foreground">
                      {source.status} · {source.progress}%
                    </div>
                    {source.error ? (
                      <div className="text-destructive">{source.error}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>补充文本</Label>
              <Textarea
                className="min-h-40"
                maxLength={appLimits.maxPastedTextChars}
                value={draft.pastedText}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    pastedText: e.target.value,
                  }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>模型档位</Label>
                <Select
                  value={draft.tier}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      tier: value as "FREE" | "ADVANCED",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FREE">免费档</SelectItem>
                    <SelectItem value="ADVANCED">进阶档</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>蒸馏模型</Label>
                <Input value={FIXED_DISTILL_MODEL_LABEL} readOnly />
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className="h-12 w-full rounded-full"
              disabled={
                submitting || !props.databaseConfigured || !props.aiConfigured
              }
            >
              {submitting ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {activeCharacterId && status?.creationStatus !== "READY"
                ? "继续蒸馏角色"
                : "开始蒸馏角色"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
