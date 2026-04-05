import { after } from "next/server";

import { requireSignedIn } from "@/lib/auth";
import { createCharacterShell } from "@/server/characters";
import { runCharacterCreation } from "@/server/creation";
import { getDefaultDisclaimer } from "@/server/distillation";
import { jsonError, jsonOk } from "@/server/http";
import { consumeQuota } from "@/server/quota-service";
import { createCharacterSchema } from "@/types";

export async function POST(request: Request) {
  try {
    const auth = await requireSignedIn();
    const payload = createCharacterSchema.parse(await request.json());
    const visibility = auth.role === "SUPER_ADMIN" ? "PUBLIC" : "PRIVATE";

    await consumeQuota({
      userId: auth.localUserId!,
      userRole: auth.role!,
      kind: "distillation",
    });

    const shell = await createCharacterShell({
      userId: auth.localUserId,
      input: {
        ...payload,
        visibility,
      },
      disclaimer: getDefaultDisclaimer(payload),
    });

    after(async () => {
      try {
        await runCharacterCreation({
          characterId: shell.id,
          slug: shell.slug,
          userId: auth.localUserId,
          input: {
            ...payload,
            visibility,
          },
          onEvent: async () => {},
        });
      } catch (error) {
        console.error("Background distillation failed", error);
      }
    });

    return jsonOk({
      characterId: shell.id,
      slug: shell.slug,
      stage: "queued",
      progress: 5,
      message: "角色已创建，蒸馏任务正在后台继续执行。",
    });
  } catch (error) {
    return jsonError(error);
  }
}

