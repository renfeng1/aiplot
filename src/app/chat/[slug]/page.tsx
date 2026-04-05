import type { UIMessage } from "ai";

import { ChatShell } from "@/components/chat-shell";
import { SiteHeader } from "@/components/site-header";
import { requireUserPage } from "@/lib/auth";
import { getConversationState } from "@/server/chat";
import { getMemorySummary } from "@/server/memory-service";
import { getGroupedModelCatalog } from "@/server/models";
import { getUserQuotaSnapshot } from "@/server/quota-service";
import type { ChatMetadata } from "@/types";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUserPage();
  const state = await getConversationState({
    slug,
    userId: user.id,
  });
  const [models, memorySummary, quota] = await Promise.all([
    getGroupedModelCatalog(),
    getMemorySummary({
      userId: user.id,
      characterId: state.character.id,
    }).catch(() => null),
    getUserQuotaSnapshot(user.id),
  ]);

  const initialMessages: UIMessage<ChatMetadata>[] = state.messages.map(
    (message) => ({
      id: message.id,
      role: message.role === "USER" ? "user" : "assistant",
      parts: [{ type: "text", text: message.plainText }],
      metadata:
        message.role === "ASSISTANT"
          ? {
              conversationId: state.conversation.id,
              messageId: message.id,
              model: message.modelUsed ?? undefined,
              mode: message.mode ?? undefined,
              evidence: Array.isArray(message.evidence)
                ? (message.evidence as ChatMetadata["evidence"])
                : [],
            }
          : undefined,
    }),
  );

  return (
    <div className="pb-10">
      <SiteHeader />
      <main className="page-shell mt-4 space-y-4 sm:mt-6">
        <ChatShell
          characterId={state.character.id}
          slug={slug}
          title={state.character.title}
          subtitle={state.character.description}
          welcomeMessage={state.character.currentVersion!.welcomeMessage}
          initialMode="FULL"
          models={models.models}
          initialMessages={initialMessages}
          relationshipSummary={memorySummary?.summaryText ?? "暂无长期关系记忆。"}
          remainingChatQuota={
            user.role === "SUPER_ADMIN" ? null : quota.chatRemaining
          }
        />
      </main>
    </div>
  );
}
