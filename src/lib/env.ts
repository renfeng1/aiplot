import { z } from "zod";

function cleanEnvValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("https://aiplot.fun"),
  AUTH_SECRET: z.string().optional(),
  AUTH_TRUST_HOST: z.string().optional(),
  BLTCY_BASE_URL: z.string().url().default("https://api.bltcy.ai"),
  BLTCY_API_KEY: z.string().optional(),
  QWEN_TTS_API_KEY: z.string().optional(),
  QWEN_TTS_URL: z
    .string()
    .url()
    .default(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    ),
  QWEN_TTS_MODEL: z.string().default("qwen3-tts-instruct-flash"),
  DATABASE_URL: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  INITIAL_SUPER_ADMIN_USERNAME: z.string().optional(),
  INITIAL_SUPER_ADMIN_PASSWORD: z.string().optional(),
  DEFAULT_DISTILLATION_QUOTA: z.coerce.number().int().positive().default(3),
  DEFAULT_CHAT_QUOTA: z.coerce.number().int().positive().default(100),
  DEFAULT_TTS_QUOTA: z.coerce.number().int().positive().default(20),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.warn("Environment validation failed, falling back to partial env.");
}

const data = parsed.success ? parsed.data : envSchema.parse({});

export const env = {
  ...data,
  AUTH_SECRET: cleanEnvValue(process.env.AUTH_SECRET),
  AUTH_TRUST_HOST: cleanEnvValue(process.env.AUTH_TRUST_HOST),
  BLTCY_API_KEY: cleanEnvValue(process.env.BLTCY_API_KEY),
  QWEN_TTS_API_KEY: cleanEnvValue(process.env.QWEN_TTS_API_KEY),
  DATABASE_URL: cleanEnvValue(process.env.DATABASE_URL),
  BLOB_READ_WRITE_TOKEN: cleanEnvValue(process.env.BLOB_READ_WRITE_TOKEN),
  ELEVENLABS_API_KEY: cleanEnvValue(process.env.ELEVENLABS_API_KEY),
  OPENAI_API_KEY: cleanEnvValue(process.env.OPENAI_API_KEY),
  INITIAL_SUPER_ADMIN_USERNAME: cleanEnvValue(
    process.env.INITIAL_SUPER_ADMIN_USERNAME,
  ),
  INITIAL_SUPER_ADMIN_PASSWORD: cleanEnvValue(
    process.env.INITIAL_SUPER_ADMIN_PASSWORD,
  ),
};

export const defaultQuotaConfig = {
  distillation: data.DEFAULT_DISTILLATION_QUOTA,
  chat: data.DEFAULT_CHAT_QUOTA,
  tts: data.DEFAULT_TTS_QUOTA,
};

export const isBltcyConfigured = Boolean(env.BLTCY_BASE_URL && env.BLTCY_API_KEY);
export const isAuthConfigured = Boolean(env.AUTH_SECRET);
