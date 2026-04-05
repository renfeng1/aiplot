import { z } from "zod";

export const sourceKindSchema = z.enum([
  "TEXT",
  "TXT",
  "MD",
  "DOCX",
  "PDF",
  "IMAGE",
  "PASTE",
  "OCR_PDF",
]);

export const extractionMethodSchema = z.enum([
  "DIRECT_TEXT",
  "DOCX_EXTRACT",
  "PDF_TEXT",
  "OCR_VISION",
  "FALLBACK",
]);

export const extractionStatusSchema = z.enum([
  "PENDING",
  "UPLOADED",
  "PROCESSING",
  "READY",
  "FAILED",
]);

export const sourceFormatSchema = z.enum([
  "AUTO",
  "NOVEL",
  "PLAIN_TEXT",
  "CHAT_LOG",
  "SCRIPT",
]);

export const characterModeSchema = z.enum([
  "FULL",
  "PERSONA_ONLY",
  "MEMORY_ONLY",
]);

export const characterTypeSchema = z.enum([
  "HISTORICAL",
  "FICTIONAL",
  "REAL_PERSON",
  "CUSTOM",
]);

export const characterVisibilitySchema = z.enum(["PUBLIC", "PRIVATE"]);
export const creationStatusSchema = z.enum([
  "DRAFT",
  "DISTILLING",
  "FAILED",
  "READY",
]);

export const modelTierSchema = z.enum(["FREE", "ADVANCED"]);

export const modelCapabilitySchema = z.enum([
  "chat",
  "distill",
  "embedding",
  "ocr",
  "tts",
]);

export const targetCharacterSpecSchema = z.object({
  name: z.string().min(1).max(80),
  aliases: z.array(z.string().min(1).max(80)).max(8).default([]),
  formatHint: sourceFormatSchema.default("AUTO"),
});

export const createCharacterSchema = z.object({
  title: z.string().min(1).max(80),
  description: z.string().min(1).max(240),
  type: characterTypeSchema,
  visibility: characterVisibilitySchema.default("PRIVATE"),
  tags: z.array(z.string().min(1).max(24)).max(8).default([]),
  sourceIds: z.array(z.string().min(1)).max(16).default([]),
  pastedText: z.string().max(500_000).optional(),
  tier: modelTierSchema.default("FREE"),
  distillModelId: z.string().optional(),
  chatModelId: z.string().optional(),
  confirmRights: z.boolean().default(false),
  targetCharacterName: z.string().min(1).max(80),
  targetCharacterAliases: z.array(z.string().min(1).max(80)).max(8).default([]),
  userRoleHint: z.string().min(1).max(160),
  sourceFormatHint: sourceFormatSchema.default("AUTO"),
});

export const correctionSchema = z.object({
  text: z.string().min(1).max(1_000),
  appliesToModes: z.array(characterModeSchema).default([
    "FULL",
    "PERSONA_ONLY",
    "MEMORY_ONLY",
  ]),
  conversationId: z.string().optional(),
  messageId: z.string().optional(),
});

export const rollbackSchema = z.object({
  versionId: z.string().min(1),
});

export const rebuildSchema = z.object({
  sourceIds: z.array(z.string()).default([]),
  pastedText: z.string().max(500_000).optional(),
  description: z.string().max(240).optional(),
  tags: z.array(z.string().max(24)).max(8).default([]),
  tier: modelTierSchema.default("FREE"),
  distillModelId: z.string().optional(),
  targetCharacterName: z.string().min(1).max(80).optional(),
  targetCharacterAliases: z.array(z.string().min(1).max(80)).max(8).default([]),
  userRoleHint: z.string().min(1).max(160).optional(),
  sourceFormatHint: sourceFormatSchema.optional(),
});

export const voiceProfileInputSchema = z.object({
  provider: z.string(),
  model: z.string().optional(),
  voiceId: z.string().optional(),
  preset: z.string().optional(),
  styleInstructions: z.string(),
  speed: z.number().min(0.5).max(1.5).default(1),
  stability: z.number().min(0).max(1).optional(),
  similarity: z.number().min(0).max(1).optional(),
  expressiveLevel: z.number().min(0).max(1).optional(),
  language: z.string().default("zh-CN"),
  speakingRegister: z.string().default("自然口语"),
  pauseStyle: z.string().default("平衡停顿"),
  emotionBaseline: z.string().default("克制稳定"),
  energy: z.number().min(0).max(1).default(0.5),
  pitchHint: z.string().optional(),
  styleExamples: z.array(z.string().min(1).max(240)).max(5).default([]),
});

export const relevantChunkSchema = z.object({
  sourceFileId: z.string(),
  sourceLabel: z.string(),
  content: z.string(),
  score: z.number(),
  reason: z.string(),
  format: sourceFormatSchema,
  pageNumber: z.number().nullable().optional(),
  paragraphIndex: z.number().nullable().optional(),
  imageIndex: z.number().nullable().optional(),
});

export const retrievedEvidenceSchema = z.object({
  chunkId: z.string(),
  sourceFileId: z.string(),
  sourceLabel: z.string(),
  quote: z.string(),
  pageNumber: z.number().nullable().optional(),
  imageIndex: z.number().nullable().optional(),
  score: z.number().default(0),
  targetRelevance: z.number().optional(),
});

export const distillationResultSchema = z.object({
  identity: z.string(),
  user_role_hint: z.string().default(""),
  relationship_to_user: z.string().default(""),
  background: z.array(z.string()).default([]),
  timeline: z.array(z.string()).default([]),
  core_beliefs: z.array(z.string()).default([]),
  expertise_topics: z.array(z.string()).default([]),
  relationship_style: z.array(z.string()).default([]),
  speaking_style: z.array(z.string()).default([]),
  tone: z.array(z.string()).default([]),
  pacing: z.string().default("稳健"),
  catchphrases: z.array(z.string()).default([]),
  taboos: z.array(z.string()).default([]),
  uncertainty_policy: z.string(),
  example_replies: z.array(z.string()).default([]),
  source_summary: z.string(),
  voice_style_prompt: z.string(),
  speech_rules: z.array(z.string()).default([]),
  relationship_map: z.array(z.string()).default([]),
  habits: z.array(z.string()).default([]),
  behavior_preferences: z.array(z.string()).default([]),
  style_examples: z.array(z.string()).default([]),
  target_confidence: z.number().min(0).max(1).default(0.5),
  confidence: z.number().min(0).max(1).default(0.5),
  completeness: z.number().min(0).max(1).default(0.5),
});

export const modelInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
  provider: z.string(),
  tier: modelTierSchema,
  capabilities: z.array(modelCapabilitySchema),
  recommended: z.boolean().default(false),
  description: z.string().optional(),
});

export const chatMetadataSchema = z.object({
  conversationId: z.string().optional(),
  messageId: z.string().optional(),
  model: z.string().optional(),
  mode: characterModeSchema.optional(),
  evidence: z.array(retrievedEvidenceSchema).default([]),
});

export type SourceKind = z.infer<typeof sourceKindSchema>;
export type ExtractionMethod = z.infer<typeof extractionMethodSchema>;
export type ExtractionStatus = z.infer<typeof extractionStatusSchema>;
export type SourceFormat = z.infer<typeof sourceFormatSchema>;
export type CharacterMode = z.infer<typeof characterModeSchema>;
export type CharacterType = z.infer<typeof characterTypeSchema>;
export type CharacterVisibility = z.infer<typeof characterVisibilitySchema>;
export type CreationStatus = z.infer<typeof creationStatusSchema>;
export type ModelTier = z.infer<typeof modelTierSchema>;
export type ModelCapability = z.infer<typeof modelCapabilitySchema>;
export type TargetCharacterSpec = z.infer<typeof targetCharacterSpecSchema>;
export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type CorrectionInput = z.infer<typeof correctionSchema>;
export type RebuildInput = z.infer<typeof rebuildSchema>;
export type RollbackInput = z.infer<typeof rollbackSchema>;
export type VoiceProfileInput = z.infer<typeof voiceProfileInputSchema>;
export type RelevantChunk = z.infer<typeof relevantChunkSchema>;
export type RetrievedEvidence = z.infer<typeof retrievedEvidenceSchema>;
export type DistilledCharacter = z.infer<typeof distillationResultSchema>;
export type ModelInfo = z.infer<typeof modelInfoSchema>;
export type ChatMetadata = z.infer<typeof chatMetadataSchema>;
