import type { UIMessage } from "ai";
import { z } from "zod";

import { requireSignedIn } from "@/lib/auth";
import { createChatStream } from "@/server/chat";
import { jsonError } from "@/server/http";
import {
  characterModeSchema,
  modelTierSchema,
  type ChatMetadata,
} from "@/types";

const bodySchema = z.object({
  slug: z.string().min(1),
  conversationId: z.string().optional(),
  mode: characterModeSchema.default("FULL"),
  tier: modelTierSchema.default("FREE"),
  modelId: z.string().optional(),
  messages: z.array(z.any()) as z.ZodType<UIMessage[]>,
});

export async function POST(request: Request) {
  try {
    const auth = await requireSignedIn();
    const body = bodySchema.parse(await request.json());

    return createChatStream({
      slug: body.slug,
      auth,
      messages: body.messages as UIMessage<ChatMetadata>[],
      mode: body.mode,
      tier: body.tier,
      modelId: body.modelId,
    });
  } catch (error) {
    return jsonError(error);
  }
}
