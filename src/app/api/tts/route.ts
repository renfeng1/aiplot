import { z } from "zod";

import { requireSignedIn } from "@/lib/auth";
import { jsonError } from "@/server/http";
import { synthesizeMessageSpeech } from "@/server/tts";

const bodySchema = z.object({
  slug: z.string().min(1),
  messageId: z.string().min(1),
  providerHint: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireSignedIn();
    const body = bodySchema.parse(await request.json());
    const audio = await synthesizeMessageSpeech({
      slug: body.slug,
      messageId: body.messageId,
      providerHint: body.providerHint,
      auth,
    });

    return new Response(
      Uint8Array.from(audio.buffer).buffer,
      {
      headers: {
        "Content-Type": audio.contentType,
        "Cache-Control": "private, max-age=3600",
      },
      },
    );
  } catch (error) {
    console.error("TTS route failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError(error);
  }
}
