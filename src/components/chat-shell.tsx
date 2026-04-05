"use client";

import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import {
  AudioLines,
  Bot,
  Copy,
  LoaderCircle,
  MessageSquareDiff,
  Play,
  SendHorizonal,
  Square,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { characterModeOptions } from "@/lib/constants";
import {
  chatMetadataSchema,
  type CharacterMode,
  type ChatMetadata,
  type ModelInfo,
  type RetrievedEvidence,
} from "@/types";

type ChatMessage = UIMessage<ChatMetadata>;

type ChatShellProps = {
  characterId: string;
  slug: string;
  title: string;
  subtitle: string;
  welcomeMessage: string;
  initialMode: CharacterMode;
  models: ModelInfo[];
  initialMessages?: ChatMessage[];
  relationshipSummary?: string;
  remainingChatQuota?: number | null;
};

function textFromMessage(message: ChatMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

async function readApiError(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return data?.error?.message ?? fallback;
}

export function ChatShell({
  characterId,
  slug,
  title,
  subtitle,
  welcomeMessage,
  initialMode,
  models,
  initialMessages = [],
  relationshipSummary = "暂无长期关系记忆。",
  remainingChatQuota = null,
}: ChatShellProps) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<CharacterMode>(initialMode);
  const [tier, setTier] = useState<"FREE" | "ADVANCED">("FREE");
  const [modelId, setModelId] = useState<string | undefined>();
  const [showEvidence, setShowEvidence] = useState(false);
  const [showMemoryPanel, setShowMemoryPanel] = useState(true);
  const [autoRead, setAutoRead] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<{
    messageId: string;
    text: string;
  } | null>(null);
  const [correctionText, setCorrectionText] = useState("");
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const lastAutoReadMessageIdRef = useRef<string | null>(null);

  const chatModels = useMemo(
    () =>
      models.filter(
        (item) => item.capabilities.includes("chat") && item.tier === tier,
      ),
    [models, tier],
  );

  const { messages, sendMessage, status, stop, error } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: async ({ messages }) => ({
        body: {
          slug,
          mode,
          tier,
          modelId,
          messages,
        },
      }),
    }),
    messageMetadataSchema: chatMetadataSchema,
    messages: initialMessages,
  });

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [messages, status]);

  useEffect(() => {
    if (!autoRead) {
      return;
    }

    const lastAssistant = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");
    const messageId = lastAssistant?.metadata?.messageId;
    if (!lastAssistant || !messageId) {
      return;
    }

    if (lastAutoReadMessageIdRef.current === messageId) {
      return;
    }

    lastAutoReadMessageIdRef.current = messageId;

    void playMessage(messageId, textFromMessage(lastAssistant));
  }, [autoRead, messages]);

  useEffect(() => {
    if (error) {
      toast.error(error.message);
    }
  }, [error]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  async function handleSubmit() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await sendMessage({ text });
  }

  async function playMessage(messageId: string, text: string) {
    if (playingMessageId === messageId) {
      audioRef.current?.pause();
      setPlayingMessageId(null);
      return;
    }

    setPlayingMessageId(messageId);
    try {
      let response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, messageId }),
      });

      if (!response.ok) {
        response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, messageId }),
        });
      }

      if (!response.ok) {
        throw new Error(await readApiError(response, "语音生成失败。"));
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audioUrlRef.current = url;
      audio.onended = () => setPlayingMessageId(null);
      audio.onerror = () => setPlayingMessageId(null);
      await audio.play();
    } catch (playError) {
      await navigator.clipboard.writeText(text).catch(() => undefined);
      toast.error(
        playError instanceof Error ? playError.message : "语音播放失败。",
      );
      setPlayingMessageId(null);
    }
  }

  async function handleCorrectionSubmit() {
    if (!correctionTarget || !correctionText.trim()) {
      return;
    }

    const response = await fetch(`/api/characters/${characterId}/corrections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: correctionText,
        messageId: correctionTarget.messageId,
        appliesToModes: ["FULL", "PERSONA_ONLY", "MEMORY_ONLY"],
      }),
    }).catch(() => null);

    if (!response?.ok) {
      toast.error("角色纠错保存失败。");
      return;
    }

    toast.success("已保存角色纠错。");
    setCorrectionTarget(null);
    setCorrectionText("");
  }

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-4 lg:grid lg:grid-cols-[0.76fr_0.24fr]">
      <div className="surface flex min-h-[calc(100vh-7rem)] flex-col overflow-hidden">
        <div className="border-b border-border/70 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                聊天
              </div>
              <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
                {title}
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                {subtitle}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={mode}
                onValueChange={(value) => setMode(value as CharacterMode)}
              >
                <SelectTrigger className="min-w-40 rounded-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {characterModeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={tier}
                onValueChange={(value) => setTier(value as "FREE" | "ADVANCED")}
              >
                <SelectTrigger className="min-w-32 rounded-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FREE">免费档</SelectItem>
                  <SelectItem value="ADVANCED">进阶档</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={modelId ?? "auto"}
                onValueChange={(value) =>
                  setModelId(value === "auto" ? undefined : value)
                }
              >
                <SelectTrigger className="min-w-40 rounded-full">
                  <SelectValue placeholder="自动推荐" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">自动推荐</SelectItem>
                  {chatModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 px-4 sm:px-6">
          <div ref={viewportRef} className="flex min-h-full flex-col gap-4 py-5">
            {!messages.length ? (
              <div className="surface mx-auto mt-4 max-w-2xl rounded-[1.75rem] px-5 py-5 text-sm leading-7 text-muted-foreground">
                <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
                  <Bot className="size-4.5 text-primary" />
                  {title}
                </div>
                {welcomeMessage}
              </div>
            ) : null}

            {messages.map((message) => {
              const text = textFromMessage(message);
              const metadata = message.metadata;
              const evidence = metadata?.evidence ?? [];
              const messageId = metadata?.messageId;

              return (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[88%] rounded-[1.75rem] px-4 py-3 sm:max-w-[78%] ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary/85 text-foreground"
                    }`}
                  >
                    <div className="whitespace-pre-wrap text-sm leading-7">
                      {text}
                    </div>

                    {message.role === "assistant" ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-full px-3"
                          onClick={() =>
                            navigator.clipboard
                              .writeText(text)
                              .then(() => toast.success("已复制"))
                          }
                        >
                          <Copy className="size-4" />
                          复制
                        </Button>

                        {messageId ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 rounded-full px-3"
                              onClick={() => void playMessage(messageId, text)}
                            >
                              {playingMessageId === messageId ? (
                                <Square className="size-4" />
                              ) : (
                                <Play className="size-4" />
                              )}
                              朗读
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 rounded-full px-3"
                              onClick={() => {
                                setCorrectionTarget({ messageId, text });
                                setCorrectionText("");
                              }}
                            >
                              <MessageSquareDiff className="size-4" />
                              纠错
                            </Button>
                          </>
                        ) : null}

                        {showEvidence && evidence.length ? (
                          <details className="w-full rounded-2xl bg-background/60 p-3 text-sm">
                            <summary className="cursor-pointer font-medium">
                              显示依据
                            </summary>
                            <div className="mt-3 space-y-2">
                              {evidence.map((item: RetrievedEvidence) => (
                                <div
                                  key={item.chunkId}
                                  className="rounded-2xl border border-border/70 bg-card/70 p-3"
                                >
                                  <div className="text-xs text-muted-foreground">
                                    {item.sourceLabel}
                                    {item.pageNumber ? ` · 第${item.pageNumber}页` : ""}
                                  </div>
                                  <div className="mt-1 whitespace-pre-wrap text-sm leading-6">
                                    {item.quote}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="safe-bottom border-t border-border/70 bg-background/75 px-4 py-3 backdrop-blur sm:px-6">
          <div className="mb-3 flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>自动朗读</span>
              <Switch checked={autoRead} onCheckedChange={setAutoRead} />
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>显示依据</span>
              <Switch checked={showEvidence} onCheckedChange={setShowEvidence} />
            </div>
            <div className="text-muted-foreground">
              剩余对话次数：
              {remainingChatQuota === null ? "无限制" : remainingChatQuota}
            </div>
          </div>
          <div className="flex items-end gap-3">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={`和 ${title} 说点什么……`}
              className="min-h-12 max-h-40 rounded-[1.4rem] bg-card/80"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
            />
            {status === "streaming" ? (
              <Button
                type="button"
                size="icon"
                className="mb-1 size-11 rounded-full"
                onClick={() => stop()}
              >
                <Square className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                className="mb-1 size-11 rounded-full"
                onClick={() => void handleSubmit()}
                disabled={remainingChatQuota === 0}
              >
                {status === "submitted" ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <SendHorizonal className="size-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      <aside className="surface hidden p-5 lg:block">
        <div className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              长期关系记忆
            </div>
            <div className="mt-2 text-sm leading-6 text-muted-foreground">
              {showMemoryPanel ? relationshipSummary : "已隐藏"}
            </div>
            <Button
              type="button"
              variant="ghost"
              className="mt-3 h-8 rounded-full px-3"
              onClick={() => setShowMemoryPanel((value) => !value)}
            >
              <AudioLines className="size-4" />
              {showMemoryPanel ? "隐藏记忆摘要" : "显示记忆摘要"}
            </Button>
          </div>
        </div>
      </aside>

      <Dialog
        open={Boolean(correctionTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setCorrectionTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>纠正角色表达</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl bg-secondary/75 p-4 text-sm leading-6 text-muted-foreground">
              {correctionTarget?.text}
            </div>
            <Textarea
              value={correctionText}
              onChange={(event) => setCorrectionText(event.target.value)}
              className="min-h-28 max-h-52"
              placeholder="例如：这句太现代了，应该更克制、更像角色本人。"
            />
            <Button
              className="w-full rounded-full"
              onClick={() => void handleCorrectionSubmit()}
            >
              保存纠错
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
