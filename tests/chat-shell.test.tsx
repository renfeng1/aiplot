import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";

import { ChatShell } from "@/components/chat-shell";

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "刚吃完饭。你呢？" }],
        metadata: {
          conversationId: "conv-1",
          messageId: "msg-1",
          evidence: [],
        },
      },
    ],
    sendMessage: vi.fn(),
    status: "ready",
    stop: vi.fn(),
    error: undefined,
  }),
}));

class MockAudio {
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  async play() {
    return;
  }
  pause() {
    return;
  }
}

describe("ChatShell auto read", () => {
  beforeEach(() => {
    vi.stubGlobal("Audio", MockAudio);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Blob(["audio"]), { status: 200 })),
    );
  });

  it("requests tts only once for the same assistant message", async () => {
    const user = userEvent.setup();

    render(
      <ChatShell
        characterId="char-1"
        slug="test-role"
        title="测试角色"
        subtitle="一个短句风格角色"
        welcomeMessage="你好。"
        initialMode="FULL"
        models={[
          {
            id: "gpt-4o-mini",
            label: "GPT-4o mini",
            provider: "bltcy",
            tier: "FREE",
            capabilities: ["chat"],
            recommended: true,
          },
        ]}
      />,
    );

    await user.click(screen.getAllByRole("switch")[0]!);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
});
