import "server-only";

import { createHash } from "node:crypto";

import type { AuthContext } from "@/lib/auth";
import { getDb } from "@/db/prisma";
import { env } from "@/lib/env";
import { fetchBlobAsset, uploadPrivateAsset } from "@/server/blob";
import { ensureCharacterAccess } from "@/server/characters";
import { ApiError } from "@/server/http";
import { buildQwenTtsConfig } from "@/server/qwen-tts.js";
import { createUsageLog } from "@/server/usage";

type TtsProvider = "qwen" | "openai";

type GeneratedSpeech = {
  bytes: Buffer;
  contentType: string;
  modelId: string;
  provider: TtsProvider;
  voice: string;
};

type TtsProviderPlan = {
  provider: TtsProvider;
  modelId: string;
  voiceId: string;
  styleInstructions: string;
  speed: number;
  voiceSignature: string;
};

const inflightTts = new Map<
  string,
  Promise<{ buffer: Buffer; contentType: string }>
>();

function buildAudioCacheKey(text: string, voiceSignature: string) {
  return createHash("sha256")
    .update(`${voiceSignature}::${text}`)
    .digest("hex");
}

function preprocessTextForTts(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(\d+)\]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/，{2,}/g, "，")
    .replace(/。{2,}/g, "。")
    .replace(/([。！？?!；;])/g, "$1\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function inferFileExtension(contentType: string) {
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("mpeg") || contentType.includes("mp3")) return "mp3";
  return "audio";
}

function normalizeProviderHint(providerHint?: string | null): TtsProvider | null {
  const normalized = providerHint?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("openai")) return "openai";
  if (normalized.includes("qwen")) return "qwen";
  return null;
}

function mapQwenVoiceToOpenAiVoice(voiceId?: string | null) {
  switch (voiceId) {
    case "Cherry":
      return "nova";
    case "Nini":
      return "shimmer";
    case "Bella":
      return "coral";
    case "Kai":
      return "echo";
    case "Aiden":
      return "ash";
    case "Ryan":
      return "verse";
    case "Vincent":
      return "onyx";
    case "Eldric Sage":
      return "sage";
    case "Neil":
      return "alloy";
    default:
      return "alloy";
  }
}

function createVoiceSignature(plan: Omit<TtsProviderPlan, "voiceSignature">) {
  return JSON.stringify({
    provider: plan.provider,
    model: plan.modelId,
    voiceId: plan.voiceId,
    style: plan.styleInstructions,
    speed: plan.speed,
  });
}

function buildTtsProviderPlans(options: {
  providerHint?: string;
  qwenVoiceId: string;
  styleInstructions: string;
  speed: number;
}) {
  const requestedProvider = normalizeProviderHint(options.providerHint);
  const providers: TtsProvider[] = [];

  if (env.QWEN_TTS_API_KEY) {
    providers.push("qwen");
  }
  if (env.OPENAI_API_KEY) {
    providers.push("openai");
  }

  if (requestedProvider && providers.includes(requestedProvider)) {
    providers.splice(providers.indexOf(requestedProvider), 1);
    providers.unshift(requestedProvider);
  }

  return providers.map((provider) => {
    const base: Omit<TtsProviderPlan, "voiceSignature"> =
      provider === "qwen"
        ? {
            provider,
            modelId: env.QWEN_TTS_MODEL,
            voiceId: options.qwenVoiceId,
            styleInstructions: options.styleInstructions,
            speed: options.speed,
          }
        : {
            provider,
            modelId: "gpt-4o-mini-tts",
            voiceId: mapQwenVoiceToOpenAiVoice(options.qwenVoiceId),
            styleInstructions: options.styleInstructions,
            speed: options.speed,
          };

    return {
      ...base,
      voiceSignature: createVoiceSignature(base),
    };
  });
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 30_000,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function parseJsonErrorDetails(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      return await response.json();
    }
    return await response.text();
  } catch {
    return null;
  }
}

async function fetchRemoteAudio(url: string) {
  const response = await fetchWithTimeout(
    url.replace(/^http:\/\//i, "https://"),
    {},
    30_000,
  );
  if (!response.ok) {
    throw new ApiError("无法读取 Qwen TTS 音频结果。", 502, "QWEN_TTS_AUDIO_FETCH_FAILED");
  }

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "audio/wav",
  };
}

async function generateQwenSpeech(options: {
  text: string;
  voiceId?: string | null;
  styleInstructions: string;
  speed: number;
}): Promise<GeneratedSpeech> {
  if (!env.QWEN_TTS_API_KEY) {
    throw new ApiError("Qwen TTS 未配置。", 503, "QWEN_TTS_NOT_CONFIGURED");
  }

  const response = await fetchWithTimeout(env.QWEN_TTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.QWEN_TTS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.QWEN_TTS_MODEL,
      input: {
        text: preprocessTextForTts(options.text),
        voice: options.voiceId,
        language_type: "Chinese",
        instructions: options.styleInstructions,
        optimize_instructions: true,
      },
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        code?: string;
        message?: string;
        output?: {
          audio?: {
            data?: string;
            url?: string;
          };
        };
      }
    | null;

  if (!response.ok) {
    throw new ApiError(
      payload?.message ?? "Qwen TTS 生成失败。",
      response.status,
      payload?.code ?? "QWEN_TTS_FAILED",
      payload,
    );
  }

  const audio = payload?.output?.audio;
  if (!audio) {
    throw new ApiError("Qwen TTS 未返回音频数据。", 502, "QWEN_TTS_EMPTY_AUDIO");
  }

  if (audio.data) {
    return {
      bytes: Buffer.from(audio.data, "base64"),
      contentType: "audio/wav",
      modelId: env.QWEN_TTS_MODEL,
      provider: "qwen",
      voice: options.voiceId ?? "Cherry",
    };
  }

  if (audio.url) {
    const remote = await fetchRemoteAudio(audio.url);
    return {
      bytes: remote.bytes,
      contentType: remote.contentType,
      modelId: env.QWEN_TTS_MODEL,
      provider: "qwen",
      voice: options.voiceId ?? "Cherry",
    };
  }

  throw new ApiError("Qwen TTS 返回了空音频。", 502, "QWEN_TTS_EMPTY_AUDIO");
}

async function generateOpenAiSpeech(options: {
  text: string;
  voiceId: string;
  styleInstructions: string;
  speed: number;
  modelId: string;
}): Promise<GeneratedSpeech> {
  if (!env.OPENAI_API_KEY) {
    throw new ApiError("OpenAI TTS 未配置。", 503, "OPENAI_TTS_NOT_CONFIGURED");
  }

  const cleanedText = preprocessTextForTts(options.text).slice(0, 4096);
  if (!cleanedText) {
    throw new ApiError("没有可供语音合成的文本。", 400, "TTS_EMPTY_TEXT");
  }

  const response = await fetchWithTimeout("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.modelId,
      input: cleanedText,
      voice: options.voiceId,
      instructions: options.styleInstructions,
      response_format: "wav",
      speed: Math.min(4, Math.max(0.25, options.speed || 1)),
    }),
  });

  if (!response.ok) {
    throw new ApiError(
      "OpenAI TTS 生成失败。",
      response.status,
      "OPENAI_TTS_FAILED",
      await parseJsonErrorDetails(response),
    );
  }

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "audio/wav",
    modelId: options.modelId,
    provider: "openai",
    voice: options.voiceId,
  };
}

async function synthesizeInternal(options: {
  slug: string;
  messageId: string;
  auth: AuthContext;
  providerHint?: string;
}) {
  const db = getDb();
  const message = await db.message.findUnique({
    where: { id: options.messageId },
    include: { conversation: true },
  });

  if (!message) {
    throw new ApiError("消息不存在。", 404, "MESSAGE_NOT_FOUND");
  }

  const character = await ensureCharacterAccess({
    slug: options.slug,
    localUserId: options.auth.localUserId,
  });

  if (!character || message.conversation.characterId !== character.id) {
    throw new ApiError("无权访问该角色语音。", 403, "FORBIDDEN");
  }

  if (message.audioUrl) {
    try {
      return await fetchBlobAsset(message.audioUrl);
    } catch (error) {
      console.warn("Current message audio cache fetch failed", {
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const voiceProfile = character.voiceProfiles[0];
  const qwenConfig = await buildQwenTtsConfig({
    characterTitle: character.title,
    characterDescription: character.description,
    characterProfile: character.currentVersion?.characterProfile as
      | Record<string, unknown>
      | null,
    voiceProfile: voiceProfile ?? null,
  });

  const providerPlans = buildTtsProviderPlans({
    providerHint: options.providerHint,
    qwenVoiceId: qwenConfig.voiceId,
    styleInstructions: qwenConfig.instructions,
    speed: voiceProfile?.speed ?? 1,
  });

  if (!providerPlans.length) {
    throw new ApiError(
      "语音能力未配置。请配置 QWEN_TTS_API_KEY 或 OPENAI_API_KEY。",
      503,
      "TTS_NOT_CONFIGURED",
    );
  }

  for (const plan of providerPlans) {
    const cacheKey = buildAudioCacheKey(message.plainText, plan.voiceSignature);
    const cached = await db.message.findFirst({
      where: {
        audioCacheKey: cacheKey,
        audioUrl: { not: null },
      },
    });

    if (!cached?.audioUrl) {
      continue;
    }

    try {
      const cachedAsset = await fetchBlobAsset(cached.audioUrl);
      await db.message.update({
        where: { id: message.id },
        data: {
          audioUrl: cached.audioUrl,
          audioProvider: cached.audioProvider,
          audioCacheKey: cacheKey,
        },
      });
      return cachedAsset;
    } catch (error) {
      console.warn("Shared TTS cache fetch failed", {
        messageId: message.id,
        cachedMessageId: cached.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const startedAt = Date.now();
  let speech: GeneratedSpeech | null = null;
  let activePlan: TtsProviderPlan | null = null;
  const providerErrors: Array<{ provider: TtsProvider; error: string }> = [];

  for (const plan of providerPlans) {
    try {
      speech =
        plan.provider === "qwen"
          ? await generateQwenSpeech({
              text: message.plainText,
              voiceId: plan.voiceId,
              styleInstructions: plan.styleInstructions,
              speed: plan.speed,
            })
          : await generateOpenAiSpeech({
              text: message.plainText,
              voiceId: plan.voiceId,
              styleInstructions: plan.styleInstructions,
              speed: plan.speed,
              modelId: plan.modelId,
            });
      activePlan = plan;
      break;
    } catch (error) {
      providerErrors.push({
        provider: plan.provider,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error("TTS provider failed", {
        messageId: message.id,
        characterId: character.id,
        provider: plan.provider,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!speech || !activePlan) {
    throw new ApiError(
      "所有可用语音提供方都失败了。",
      503,
      "TTS_ALL_PROVIDERS_FAILED",
      { providerErrors },
    );
  }

  try {
    const ext = inferFileExtension(speech.contentType);
    const cacheKey = buildAudioCacheKey(message.plainText, activePlan.voiceSignature);
    const uploaded = await uploadPrivateAsset(
      `tts/${character.slug}/${message.id}-${cacheKey}.${ext}`,
      speech.bytes,
      speech.contentType,
    );

    await db.message.update({
      where: { id: message.id },
      data: {
        audioUrl: uploaded.url,
        audioProvider: speech.provider,
        audioCacheKey: cacheKey,
      },
    });
  } catch (error) {
    console.error("TTS cache upload failed", {
      messageId: message.id,
      characterId: character.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  await createUsageLog({
    userId: options.auth.localUserId,
    characterId: character.id,
    conversationId: message.conversationId,
    messageId: message.id,
    eventType: "tts",
    provider: speech.provider,
    model: speech.modelId,
    latencyMs: Date.now() - startedAt,
    meta: { voice: speech.voice },
  });

  return {
    buffer: speech.bytes,
    contentType: speech.contentType,
  };
}

export async function synthesizeMessageSpeech(options: {
  slug: string;
  messageId: string;
  auth: AuthContext;
  providerHint?: string;
}) {
  const cacheToken = `${options.messageId}:${options.providerHint ?? "auto"}`;
  const existing = inflightTts.get(cacheToken);
  if (existing) {
    return existing;
  }

  const task = synthesizeInternal(options).finally(() => {
    inflightTts.delete(cacheToken);
  });

  inflightTts.set(cacheToken, task);
  return task;
}
