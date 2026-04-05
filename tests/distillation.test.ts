import { describe, expect, it } from "vitest";

import { buildChatSystemPrompt, buildChatTurnReminder } from "@/prompts/chat";
import { parseDistillationJson } from "@/server/distillation";

describe("distillation json parsing", () => {
  it("parses fenced json output", () => {
    const parsed = parseDistillationJson(`
\`\`\`json
{
  "identity": "林黛玉，敏感聪明",
  "background": [],
  "timeline": [],
  "core_beliefs": [],
  "expertise_topics": [],
  "relationship_style": [],
  "speaking_style": [],
  "tone": [],
  "pacing": "稳健",
  "catchphrases": [],
  "taboos": [],
  "uncertainty_policy": "资料不足时直说不确定",
  "example_replies": ["嗯，我知道了。"],
  "source_summary": "角色摘要",
  "voice_style_prompt": "自然、克制",
  "speech_rules": [],
  "relationship_map": [],
  "habits": [],
  "behavior_preferences": [],
  "style_examples": [],
  "target_confidence": 0.5,
  "confidence": 0.5,
  "completeness": 0.5
}
\`\`\`
`);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.identity).toContain("林黛玉");
    }
  });

  it("returns validation error for incomplete json", () => {
    const parsed = parseDistillationJson(`{"identity":"x"}`);

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error).toContain("uncertainty_policy");
    }
  });
});

describe("chat prompt style", () => {
  it("asks for short human-like replies", () => {
    const prompt = buildChatSystemPrompt({
      title: "测试角色",
      mode: "FULL",
      personaPrompt: "说话短，口语化。",
      memorySummary: "记得一起吃过意面。",
      distilled: {
        identity: "测试角色",
        user_role_hint: "和角色暧昧拉扯的旧识",
        relationship_to_user: "把用户当成熟悉又舍不得放开的旧识。",
        background: [],
        timeline: [],
        core_beliefs: [],
        expertise_topics: [],
        relationship_style: [],
        speaking_style: [],
        tone: [],
        pacing: "快",
        catchphrases: [],
        taboos: [],
        uncertainty_policy: "不知道就直说",
        example_replies: [],
        source_summary: "",
        voice_style_prompt: "",
        speech_rules: [],
        relationship_map: [],
        habits: [],
        behavior_preferences: [],
        style_examples: [],
        target_confidence: 0.5,
        confidence: 0.5,
        completeness: 0.5,
      },
      corrections: [],
      conversationSummary: null,
      evidence: [],
    });

    expect(prompt).toContain("你当前唯一的任务，是作为【测试角色】真实存在于这段对话里");
    expect(prompt).toContain("用户在这段关系里的定位：和角色暧昧拉扯的旧识");
    expect(prompt).toContain("你不是被动答题器");
    expect(prompt).toContain("不要把“根据资料 / 根据证据”直接说出来");
    expect(prompt).toContain("禁止每次都用问句收尾");
    expect(prompt).toContain("大约四轮里至少三轮不用问号结束");
    expect(prompt).toContain("不要把“推进对话”偷懒做成“你怎么想 / 你想做什么 / 那你呢”这类空追问");
  });

  it("builds a short per-turn reminder", () => {
    const reminder = buildChatTurnReminder({
      title: "测试角色",
      distilled: {
        identity: "测试角色",
        user_role_hint: "关系很近的人",
        relationship_to_user: "把用户当成熟人，会主动接住对话。",
        background: [],
        timeline: [],
        core_beliefs: [],
        expertise_topics: [],
        relationship_style: ["直接", "护短"],
        speaking_style: ["短句", "明亮"],
        tone: ["热烈"],
        pacing: "快",
        catchphrases: [],
        taboos: [],
        uncertainty_policy: "不知道就直说",
        example_replies: [],
        source_summary: "",
        voice_style_prompt: "",
        speech_rules: [],
        relationship_map: [],
        habits: [],
        behavior_preferences: [],
        style_examples: [],
        target_confidence: 0.5,
        confidence: 0.5,
        completeness: 0.5,
      },
    });

    expect(reminder).toContain("你就是【测试角色】");
    expect(reminder).toContain("保持【热烈】气质");
    expect(reminder).toContain("大多数轮次不要用问句收尾");
    expect(reminder).toContain("少问“你怎么想 / 你想做什么”");
  });
});
