import "server-only";

import { env } from "@/lib/env";
import type { ModelCapability, ModelInfo, ModelTier } from "@/types";

const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    provider: "bltcy",
    tier: "ADVANCED",
    capabilities: ["chat", "distill", "ocr"],
    recommended: true,
    description: "固定用于角色蒸馏的生产模型。",
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    provider: "bltcy",
    tier: "FREE",
    capabilities: ["chat", "distill", "ocr"],
    recommended: true,
    description: "低成本通用模型，适合轻量聊天和基础蒸馏。",
  },
  {
    id: "qwen3.5-flash",
    label: "Qwen 3.5 Flash",
    provider: "bltcy",
    tier: "FREE",
    capabilities: ["chat", "distill"],
    recommended: false,
    description: "中文理解较稳，适合低成本角色蒸馏与普通对话。",
  },
  {
    id: "glm-4.5-air",
    label: "GLM 4.5 Air",
    provider: "bltcy",
    tier: "FREE",
    capabilities: ["chat", "distill"],
    recommended: false,
    description: "低价可用的对话模型，适合一般文本场景。",
  },
  {
    id: "gpt-5-chat-latest",
    label: "GPT-5 Chat Latest",
    provider: "bltcy",
    tier: "ADVANCED",
    capabilities: ["chat", "distill", "ocr"],
    recommended: true,
    description: "角色一致性、复杂推理和长文本蒸馏表现更强。",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "bltcy",
    tier: "ADVANCED",
    capabilities: ["chat", "distill"],
    recommended: false,
    description: "长上下文理解强，适合复杂人物关系和文本归纳。",
  },
  {
    id: "text-embedding-3-small",
    label: "Text Embedding 3 Small",
    provider: "bltcy",
    tier: "FREE",
    capabilities: ["embedding"],
    recommended: true,
    description: "默认检索向量模型。",
  },
  {
    id: "tts-1-hd",
    label: "TTS-1 HD",
    provider: "bltcy",
    tier: "ADVANCED",
    capabilities: ["tts"],
    recommended: true,
    description: "默认高流畅度语音模型，更适合自然完整朗读。",
  },
  {
    id: "gpt-4o-mini-tts",
    label: "GPT-4o mini TTS",
    provider: "bltcy",
    tier: "ADVANCED",
    capabilities: ["tts"],
    recommended: false,
    description: "支持更强文本控音色，作为角色化语音补充。",
  },
  {
    id: "tts-1",
    label: "TTS-1",
    provider: "bltcy",
    tier: "FREE",
    capabilities: ["tts"],
    recommended: false,
    description: "基础语音模型，作为低成本 fallback。",
  },
];

let cachedModels: { data: ModelInfo[]; fetchedAt: number } | null = null;

function inferCapabilities(id: string): ModelCapability[] {
  const value = id.toLowerCase();
  const capabilities = new Set<ModelCapability>();

  if (
    value.includes("embed") ||
    value.includes("bge") ||
    value.includes("e5") ||
    value.includes("text-embedding")
  ) {
    capabilities.add("embedding");
  }

  if (
    value.includes("tts") ||
    value.includes("speech") ||
    value.includes("voice") ||
    value.includes("audio")
  ) {
    capabilities.add("tts");
  }

  if (
    value.includes("vision") ||
    value.includes("vl") ||
    value.includes("ocr") ||
    value.includes("omni") ||
    value.includes("4o")
  ) {
    capabilities.add("ocr");
  }

  if (!capabilities.has("embedding") && !capabilities.has("tts")) {
    capabilities.add("chat");
    capabilities.add("distill");
  }

  return [...capabilities];
}

function inferTier(id: string): ModelTier {
  const value = id.toLowerCase();
  if (
    value.includes("opus") ||
    value.includes("sonnet") ||
    value.includes("pro") ||
    value.includes("5") ||
    value.includes("high") ||
    value.includes("hd") ||
    value.includes("plus")
  ) {
    return "ADVANCED";
  }

  return "FREE";
}

function normalizeModelInfo(input: { id: string; name?: string }): ModelInfo {
  const fallback = FALLBACK_MODELS.find((item) => item.id === input.id);

  return {
    id: input.id,
    label: fallback?.label ?? input.name ?? input.id,
    provider: "bltcy",
    tier: fallback?.tier ?? inferTier(input.id),
    capabilities: fallback?.capabilities ?? inferCapabilities(input.id),
    recommended: fallback?.recommended ?? false,
    description: fallback?.description,
  };
}

async function fetchRemoteModels(): Promise<ModelInfo[]> {
  if (!env.BLTCY_API_KEY) {
    return FALLBACK_MODELS;
  }

  const endpoints = [
    `${env.BLTCY_BASE_URL}/v1/models`,
    `${env.BLTCY_BASE_URL}/models`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${env.BLTCY_API_KEY}`,
        },
        next: { revalidate: 600 },
      });

      if (!response.ok) {
        continue;
      }

      const json = (await response.json()) as {
        data?: Array<{ id: string; name?: string }>;
      };

      if (json.data?.length) {
        return json.data.map(normalizeModelInfo);
      }
    } catch (error) {
      console.warn("拉取远端模型目录失败", error);
    }
  }

  return FALLBACK_MODELS;
}

function dedupeModels(models: ModelInfo[]) {
  return [...new Map(models.map((item) => [item.id, item])).values()];
}

export async function getModelCatalog() {
  const now = Date.now();
  if (cachedModels && now - cachedModels.fetchedAt < 10 * 60 * 1000) {
    return cachedModels.data;
  }

  const models = dedupeModels([...(await fetchRemoteModels()), ...FALLBACK_MODELS]);

  cachedModels = {
    data: models,
    fetchedAt: now,
  };

  return models;
}

export async function chooseModel(options: {
  capability: ModelCapability;
  tier: ModelTier;
  preferredId?: string;
}) {
  const models = await getModelCatalog();

  const preferred = options.preferredId
    ? models.find((model) => model.id === options.preferredId)
    : null;

  if (preferred && preferred.capabilities.includes(options.capability)) {
    return preferred;
  }

  return (
    models.find(
      (model) =>
        model.tier === options.tier &&
        model.capabilities.includes(options.capability) &&
        model.recommended,
    ) ??
    models.find(
      (model) =>
        model.tier === options.tier &&
        model.capabilities.includes(options.capability),
    ) ??
    FALLBACK_MODELS.find((model) => model.capabilities.includes(options.capability)) ??
    FALLBACK_MODELS[0]
  );
}

export async function getFixedDistillModel() {
  const models = await getModelCatalog();

  return (
    models.find((model) => model.id === "gpt-5.4") ??
    normalizeModelInfo({ id: "gpt-5.4", name: "GPT-5.4" })
  );
}

export async function getGroupedModelCatalog() {
  const models = await getModelCatalog();

  return {
    models,
    free: models.filter((model) => model.tier === "FREE"),
    advanced: models.filter((model) => model.tier === "ADVANCED"),
    byCapability: {
      distill: models.filter((model) => model.capabilities.includes("distill")),
      chat: models.filter((model) => model.capabilities.includes("chat")),
      embedding: models.filter((model) => model.capabilities.includes("embedding")),
      ocr: models.filter((model) => model.capabilities.includes("ocr")),
      tts: models.filter((model) => model.capabilities.includes("tts")),
    },
  };
}

export async function getPreferredTtsCandidates() {
  const models = await getModelCatalog();
  const priorities = [
    "tts-1-hd",
    "gpt-4o-mini-tts",
    "tts-1",
    "speech-2.6-hd",
    "speech-2.6-turbo",
    "gpt-audio-mini",
    "gpt-audio",
  ];

  const found = priorities
    .map((id) => models.find((model) => model.id === id))
    .filter(Boolean) as ModelInfo[];

  return found.length
    ? found
    : models.filter((model) => model.capabilities.includes("tts"));
}
