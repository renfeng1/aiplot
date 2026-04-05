import "server-only";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { embed, embedMany, generateText, streamText, Output } from "ai";

import { env } from "@/lib/env";
import { distillationResultSchema } from "@/types";

const baseURL = env.BLTCY_BASE_URL.endsWith("/v1")
  ? env.BLTCY_BASE_URL
  : `${env.BLTCY_BASE_URL}/v1`;

export const bltcyProvider = createOpenAICompatible({
  name: "bltcy",
  baseURL,
  apiKey: env.BLTCY_API_KEY,
  includeUsage: true,
  supportsStructuredOutputs: true,
});

export { embed, embedMany, generateText, Output, streamText };

export type DistillationOutput = typeof distillationResultSchema;
