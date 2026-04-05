import type {
  CharacterMode,
  CharacterType,
  CharacterVisibility,
  SourceFormat,
  SourceKind,
} from "@/types";

export const siteConfig = {
  name: "AIPLOT.FUN",
  domain: "aiplot.fun",
  url: "https://aiplot.fun",
  title: "AIPLOT.FUN | 角色蒸馏与长期陪伴聊天",
  description:
    "上传文本、文档、截图和照片，蒸馏成可持续对话、可积累长期记忆的正式角色。",
};

export const appLimits = {
  maxFileSizeBytes: 20 * 1024 * 1024,
  maxPastedTextChars: 500_000,
  maxSourceFilesPerRun: 16,
  chunkSize: 1200,
  chunkOverlap: 180,
  retrievalTopK: 6,
  clientUploadTokenMinutes: 20,
};

export const allowedMimeTypes = [
  "text/plain",
  "text/markdown",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
] as const;

export const supportedSourceKinds: SourceKind[] = [
  "TEXT",
  "TXT",
  "MD",
  "DOCX",
  "PDF",
  "IMAGE",
  "PASTE",
  "OCR_PDF",
];

export const sourceFormatOptions: Array<{
  value: SourceFormat;
  label: string;
  description: string;
}> = [
  {
    value: "AUTO",
    label: "自动识别",
    description: "根据内容自动判断是小说、纯文本、聊天记录还是剧本。",
  },
  {
    value: "NOVEL",
    label: "小说",
    description: "按章节、叙事段落和人物出场上下文提取。",
  },
  {
    value: "PLAIN_TEXT",
    label: "纯文本",
    description: "按自然段和语义块切分，再做目标人物过滤。",
  },
  {
    value: "CHAT_LOG",
    label: "聊天记录",
    description: "优先识别说话人和目标人物本人的发言风格。",
  },
  {
    value: "SCRIPT",
    label: "剧本",
    description: "优先抽取角色台词、舞台说明和关键人物关系。",
  },
];

export const characterModeOptions: Array<{
  value: CharacterMode;
  label: string;
  description: string;
}> = [
  {
    value: "FULL",
    label: "完整角色对话",
    description: "角色口吻与资料检索同时生效。",
  },
  {
    value: "PERSONA_ONLY",
    label: "仅人格模式",
    description: "更强调语气、性格和反应方式。",
  },
  {
    value: "MEMORY_ONLY",
    label: "仅记忆 / 知识",
    description: "更偏资料回答，弱化表演感。",
  },
];

export const visibilityOptions: Array<{
  value: CharacterVisibility;
  label: string;
}> = [
  { value: "PRIVATE", label: "仅自己可见" },
  { value: "PUBLIC", label: "公开角色" },
];

export const typeOptions: Array<{ value: CharacterType; label: string }> = [
  { value: "HISTORICAL", label: "历史人物" },
  { value: "FICTIONAL", label: "虚构角色" },
  { value: "REAL_PERSON", label: "现实人物" },
  { value: "CUSTOM", label: "自定义角色" },
];

export const defaultDisclaimers = {
  realPerson:
    "请确认你有权上传并使用这些资料。本产品生成的是 AI 模拟角色，不是真人本人。",
  general:
    "角色回答基于资料、设定与 AI 推断生成，可能存在偏差，请谨慎解读。",
};
