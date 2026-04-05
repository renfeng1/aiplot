import "server-only";
import { env } from "@/lib/env";
import { bltcyProvider, generateText } from "@/server/ai/provider";
import { chooseModel } from "@/server/models";

const VOICES = {
  Cherry: { description: "general female voice", bucket: "female-adult" },
  Nini: { description: "soft intimate female voice", bucket: "female-soft" },
  Bella: { description: "lively young female voice", bucket: "female-lively" },
  Kai: { description: "clean young male voice", bucket: "male-young" },
  Vincent: { description: "deep mature male voice", bucket: "male-deep" },
  "Eldric Sage": { description: "steady elder male voice", bucket: "male-elder" },
  Neil: { description: "clear host-like voice", bucket: "narrator" },
};

const GENERIC_PHRASES = [
  "\u81ea\u7136\u89d2\u8272\u53e3\u8bed",
  "\u6309\u4e2d\u6587\u6807\u70b9\u81ea\u7136\u505c\u987f",
  "\u4e0e\u89d2\u8272\u8bbe\u5b9a\u4e00\u81f4",
  "\u4f18\u5148\u8d34\u5408\u89d2\u8272\u672c\u4eba\u8bf4\u8bdd\u65b9\u5f0f\u3002",
  "\u4e0d\u8981\u628a\u65c1\u767d\u6216\u4f5c\u8005\u53e3\u543b\u76f4\u63a5\u5f53\u6210\u89d2\u8272\u53e3\u543b\u3002",
  "\u9879\u76ee \u5185\u5bb9",
];

const TOKENS = {
  narrator: ["\u4e3b\u6301", "\u64ad\u97f3", "\u65c1\u767d", "\u8bb2\u5e08", "\u65b0\u95fb", "\u8001\u5e08", "\u8bb2\u89e3"],
  male: ["\u7537\u6027", "\u7537\u58f0", "\u54e5\u54e5", "\u5b66\u957f", "\u5c11\u5e74", "\u9752\u5e74", "\u7537\u5b69", "\u5927\u53d4", "\u5148\u751f", "\u516c\u5b50", "\u5c11\u7237"],
  female: ["\u5973\u6027", "\u5973\u58f0", "\u59d0\u59d0", "\u59b9\u59b9", "\u5c11\u5973", "\u5973\u5b69", "\u841d\u8389", "\u5fa1\u59d0", "\u592a\u592a", "\u5c0f\u59d0"],
  young: ["\u5e74\u8f7b", "\u9752\u5e74", "\u5c11\u5e74", "\u5927\u5b66", "\u5b66\u751f", "\u5b66\u957f", "\u54e5\u54e5", "\u7537\u5b69", "\u5973\u5b69", "\u5c11\u5973"],
  elder: ["\u8001\u8005", "\u957f\u8005", "\u8001\u4eba", "\u5927\u7237", "\u8001\u7237\u5b50", "\u53d4"],
  deep: ["\u4f4e\u6c89", "\u78c1\u6027", "\u6e05\u6da6", "\u6c99\u54d1", "\u70df\u55d3", "\u6210\u719f", "\u539a\u91cd"],
  relaxed: ["\u6175\u61d2", "\u677e\u5f1b", "\u6f2b\u4e0d\u7ecf\u5fc3", "\u540a\u513f\u90ce\u5f53", "\u4ece\u5bb9", "\u7b11\u610f", "\u75de"],
  playful: ["\u8179\u9ed1", "\u6bd2\u820c", "\u8c03\u60c5", "\u64a9", "\u620f\u8c11", "\u8bf1\u5bfc", "\u5ba0\u6eba"],
  bright: ["\u9633\u5149", "\u6e05\u723d", "\u5143\u6c14", "\u660e\u4eae", "\u70ed\u8840", "\u6d3b\u529b", "\u8f7b\u5feb"],
  soft: ["\u6e29\u67d4", "\u7ec6\u817b", "\u8f7b\u58f0", "\u8f6f", "\u751c", "\u90bb\u5bb6", "\u6cbb\u6108"],
  cute: ["\u841d\u8389", "\u53ef\u7231", "\u4fcf\u76ae", "\u840c", "\u5c11\u5973\u611f"],
};

const voiceDecisionCache = new Map();

function cleanLine(input) {
  return String(input)
    .replace(/^#+\s*/g, "")
    .replace(/^[-*]\s*/g, "")
    .replace(/^\d+[.)]\s*/g, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFragments(input) {
  const items = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/\n+/)
      : [];

  return items
    .map((item) => cleanLine(item))
    .filter(Boolean)
    .filter((item) => !GENERIC_PHRASES.includes(item))
    .filter((item) => !/^role card|^basic info|^name|^structured/i.test(item.toLowerCase()))
    .filter((item) => !/^\u89d2\u8272\u5361|^\u57fa\u7840\u4fe1\u606f|^\u7ed3\u6784\u5316|^\u540d\u79f0|^\u59d3\u540d/.test(item))
    .slice(0, 8);
}

function firstCleanString(input) {
  return normalizeFragments(input)[0] ?? null;
}

function extractExplicitFacts(profile) {
  const rawParts = [
    profile.identity,
    profile.source_summary,
    ...(Array.isArray(profile.background) ? profile.background : []),
    ...(Array.isArray(profile.timeline) ? profile.timeline : []),
  ]
    .map((item) => String(item ?? ""))
    .filter(Boolean);

  const rawText = rawParts.join("\n");
  const cleanedText = cleanLine(rawText);

  let gender = null;
  if (
    /性别\s*[|:： ]\s*女/.test(rawText) ||
    /女生|女性|女孩|少女|妹妹|姐姐/.test(rawText)
  ) {
    gender = "female";
  } else if (
    /性别\s*[|:： ]\s*男/.test(rawText) ||
    /男生|男性|男孩|哥哥|弟弟|学长|先生|公子|少爷/.test(rawText)
  ) {
    gender = "male";
  }

  let ageBand = null;
  if (/1[0-9]岁|20岁|大学|高中|少年|少女|学长/.test(rawText)) {
    ageBand = "young";
  } else if (/老者|长者|老人|大爷|老爷子/.test(rawText)) {
    ageBand = "elder";
  } else if (/30岁|40岁|成熟|上班族|职场/.test(rawText)) {
    ageBand = "adult";
  }

  return {
    rawText,
    cleanedText,
    gender,
    ageBand,
  };
}

function containsAny(text, tokens) {
  return tokens.some((token) => text.includes(token));
}

function stableVoiceFromTitle(title) {
  const fallbackVoices = ["Cherry", "Nini", "Bella", "Kai", "Vincent", "Neil"];
  let hash = 0;
  for (const char of String(title)) {
    hash = (hash * 33 + char.codePointAt(0)) % 2147483647;
  }
  return fallbackVoices[Math.abs(hash) % fallbackVoices.length];
}

function collectSignal(options) {
  const profile = options.characterProfile ?? {};
  const voiceProfile = options.voiceProfile ?? {};

  const tone = normalizeFragments(profile.tone);
  const speakingStyle = normalizeFragments(profile.speaking_style);
  const relationshipStyle = normalizeFragments(profile.relationship_style);
  const habits = normalizeFragments(profile.habits);
  const speechRules = normalizeFragments(profile.speech_rules);
  const styleExamples = normalizeFragments(
    voiceProfile.styleExamples ?? profile.style_examples ?? profile.example_replies,
  );
  const explicitFacts = extractExplicitFacts(profile);
  const cleanedStyleInstructions =
    typeof voiceProfile.styleInstructions === "string"
      ? cleanLine(voiceProfile.styleInstructions)
      : null;
  const identity =
    firstCleanString(profile.identity) ??
    cleanLine(`${options.characterTitle} ${options.characterDescription ?? ""}`);
  const speakingRegister =
    voiceProfile.speakingRegister ??
    (containsAny(identity, ["\u54e5\u54e5", "\u5b66\u957f", "\u5c11\u5e74", "\u9752\u5e74", "\u7537\u5b69"])
      ? "young male conversational register"
      : "natural conversational register");
  const pauseStyle = voiceProfile.pauseStyle ?? "pause naturally with Chinese punctuation";
  const emotionBaseline = voiceProfile.emotionBaseline ?? (tone.join(", ") || "controlled and natural");
  const pitchHint =
    voiceProfile.pitchHint ??
    (containsAny(identity + speakingRegister, ["\u54e5\u54e5", "\u5b66\u957f", "\u5c11\u5e74", "\u9752\u5e74", "\u7537\u5b69", "\u7537\u6027", "\u7537\u58f0"])
      ? "mid-low youthful male tone"
      : "match the role naturally");

  const signalText = [
    identity,
    options.characterDescription ?? "",
    tone.join(" "),
    speakingStyle.join(" "),
    relationshipStyle.join(" "),
    habits.join(" "),
    speakingRegister,
    cleanedStyleInstructions ?? "",
    explicitFacts.cleanedText,
  ].join(" ");

  return {
    identity,
    tone,
    speakingStyle,
    relationshipStyle,
    habits,
    speechRules,
    styleExamples,
    explicitFacts,
    cleanedStyleInstructions,
    speakingRegister,
    pauseStyle,
    emotionBaseline,
    pitchHint,
    signalText,
  };
}

function heuristicDecision(signal, title) {
  const reasons = [];
  const scores = Object.fromEntries(Object.keys(VOICES).map((key) => [key, 0]));

  const isNarrator = containsAny(signal.signalText, TOKENS.narrator);
  const isMale =
    signal.explicitFacts.gender === "male" ||
    containsAny(signal.signalText, TOKENS.male);
  const isFemale =
    signal.explicitFacts.gender === "female" ||
    containsAny(signal.signalText, TOKENS.female);
  const isYoung =
    signal.explicitFacts.ageBand === "young" ||
    containsAny(signal.signalText, TOKENS.young);
  const isElder =
    signal.explicitFacts.ageBand === "elder" ||
    containsAny(signal.signalText, TOKENS.elder);
  const isDeep = containsAny(signal.signalText, TOKENS.deep);
  const isRelaxed = containsAny(signal.signalText, TOKENS.relaxed);
  const isPlayful = containsAny(signal.signalText, TOKENS.playful);
  const isBright = containsAny(signal.signalText, TOKENS.bright);
  const isSoft = containsAny(signal.signalText, TOKENS.soft);
  const isCute = containsAny(signal.signalText, TOKENS.cute);

  if (isNarrator) reasons.push("narrator");
  if (isMale) reasons.push(signal.explicitFacts.gender === "male" ? "explicit-male" : "male");
  if (isFemale) reasons.push(signal.explicitFacts.gender === "female" ? "explicit-female" : "female");
  if (isYoung) reasons.push(signal.explicitFacts.ageBand === "young" ? "explicit-young" : "young");
  if (isElder) reasons.push(signal.explicitFacts.ageBand === "elder" ? "explicit-elder" : "elder");
  if (isDeep) reasons.push("deep");
  if (isRelaxed) reasons.push("relaxed");
  if (isPlayful) reasons.push("playful");
  if (isBright) reasons.push("bright");
  if (isSoft) reasons.push("soft");
  if (isCute) reasons.push("cute");

  if (isNarrator) scores.Neil += 12;
  if (isMale) { scores.Kai += 5; scores.Vincent += 4; scores["Eldric Sage"] += 2; }
  if (isFemale) { scores.Cherry += 4; scores.Nini += 4; scores.Bella += 4; }
  if (isYoung && isMale) { scores.Kai += 8; scores.Vincent += 1; }
  if (isYoung && isFemale) { scores.Bella += 6; scores.Nini += 4; scores.Cherry += 2; }
  if (isElder) { scores["Eldric Sage"] += 10; scores.Vincent += 2; }
  if (isDeep) { scores.Vincent += 8; scores.Kai += 1; }
  if (isRelaxed) { scores.Kai += 4; scores.Vincent += 2; }
  if (isPlayful) { scores.Kai += 4; scores.Bella += 2; }
  if (isBright) { scores.Kai += 3; scores.Bella += 5; }
  if (isSoft) { scores.Nini += 6; scores.Cherry += 3; }
  if (isCute) { scores.Bella += 6; scores.Nini += 3; }
  if (!isMale && !isFemale && !isNarrator) { scores[stableVoiceFromTitle(title)] += 2; }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [voiceId, score] = ranked[0];
  const strong =
    signal.explicitFacts.gender !== null ||
    signal.explicitFacts.ageBand !== null ||
    reasons.length >= 2 ||
    signal.styleExamples.length >= 2 ||
    signal.speakingStyle.length >= 2 ||
    signal.relationshipStyle.length >= 2 ||
    signal.habits.length >= 2;

  return {
    voiceId: strong
      ? voiceId
      : stableVoiceFromTitle(title, signal.explicitFacts.gender ?? "unknown"),
    voiceReason: strong ? (reasons.join(", ") || "heuristic") : "title-seeded fallback",
    matchedSignals: strong ? reasons : ["low-signal-profile"],
    source: strong ? "heuristic" : "fallback",
    genderGuess: signal.explicitFacts.gender,
    ageGuess: signal.explicitFacts.ageBand,
  };
}

function extractJsonCandidate(text) {
  const trimmed = String(text).trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

async function classifyVoiceWithModel(signal, title) {
  const cacheKey = JSON.stringify({ title, signal });
  if (voiceDecisionCache.has(cacheKey)) return voiceDecisionCache.get(cacheKey);

  try {
    const model = await chooseModel({ capability: "chat", tier: "ADVANCED", preferredId: "gpt-5-chat-latest" });
    const voiceTable = Object.entries(VOICES)
      .map(([id, meta]) => `- ${id}: ${meta.description}`)
      .join("\n");
    const allowedVoices =
      signal.explicitFacts.gender === "female"
        ? ["Cherry", "Nini", "Bella"]
        : signal.explicitFacts.gender === "male"
          ? signal.explicitFacts.ageBand === "elder"
            ? ["Eldric Sage", "Vincent"]
            : ["Kai", "Vincent"]
          : Object.keys(VOICES);

    const result = await generateText({
      model: bltcyProvider.chatModel(model.id),
      prompt: [
        "You are assigning ONE base TTS voice for a role.",
        "Pick exactly one voice from the list below.",
        "Gender must be respected strongly when the role is clearly male or female.",
        "If explicit structured facts exist, they override weak style hints.",
        "Use the base voice only as timbre. The detailed personality will be handled later by instructions.",
        "Return JSON only with keys: voiceId, rationale, matchedSignals, genderGuess, ageGuess.",
        "Allowed voices:",
        voiceTable,
        `Allowed final choices: ${allowedVoices.join(", ")}`,
        `Role title: ${title}`,
        `Identity: ${signal.identity}`,
        `Description: ${signal.description}`,
        `Tone: ${signal.tone.join(", ")}`,
        `Speaking style: ${signal.speakingStyle.join(", ")}`,
        `Interaction style: ${signal.relationshipStyle.join(", ")}`,
        `Speech habits: ${signal.habits.join(", ")}`,
        `Examples: ${signal.styleExamples.join(" / ")}`,
        `Style instructions: ${signal.cleanedStyleInstructions ?? ""}`,
        `Explicit structured facts: gender=${signal.explicitFacts.gender ?? "unknown"}, ageBand=${signal.explicitFacts.ageBand ?? "unknown"}`,
        `Raw structured summary: ${signal.explicitFacts.cleanedText}`,
      ].join("\n\n"),
    });

    const candidate = extractJsonCandidate(result.text);
    const parsed = JSON.parse(candidate);
    if (
      !parsed.voiceId ||
      !VOICES[parsed.voiceId] ||
      !allowedVoices.includes(parsed.voiceId)
    ) {
      throw new Error("invalid voice");
    }

    const final = {
      voiceId: parsed.voiceId,
      voiceReason: parsed.rationale || "llm-classified",
      matchedSignals: Array.isArray(parsed.matchedSignals) ? parsed.matchedSignals.map(String) : [],
      source: "llm",
      genderGuess: parsed.genderGuess ?? signal.explicitFacts.gender ?? null,
      ageGuess: parsed.ageGuess ?? signal.explicitFacts.ageBand ?? null,
    };
    voiceDecisionCache.set(cacheKey, final);
    return final;
  } catch {
    const fallback = heuristicDecision(signal, title);
    voiceDecisionCache.set(cacheKey, fallback);
    return fallback;
  }
}

export async function buildQwenTtsConfig(options) {
  const signal = collectSignal(options);
  const decision = await classifyVoiceWithModel(signal, options.characterTitle);

  const instructions = [
    `role identity: ${signal.identity}`,
    options.characterDescription ? `character summary: ${cleanLine(options.characterDescription)}` : null,
    signal.tone.length ? `emotion baseline: ${signal.tone.join(", ")}` : `emotion baseline: ${signal.emotionBaseline}`,
    signal.speakingStyle.length ? `speaking style: ${signal.speakingStyle.join(", ")}` : null,
    signal.relationshipStyle.length ? `interaction style: ${signal.relationshipStyle.join(", ")}` : null,
    signal.habits.length ? `speech habits: ${signal.habits.join(", ")}` : null,
    `register: ${signal.speakingRegister}`,
    `pause style: ${signal.pauseStyle}`,
    `pitch hint: ${signal.pitchHint}`,
    `base system voice: ${decision.voiceId}`,
    `pace: ${options.voiceProfile?.speed && options.voiceProfile.speed > 1.05 ? "slightly fast but stable" : options.voiceProfile?.speed && options.voiceProfile.speed < 0.95 ? "steady without dragging" : "natural medium pace"}`,
    "must sound like a real person in casual conversation, not a broadcaster and not a narrator.",
    "use the selected system voice as the base timbre, then add role-specific emotion, attitude and rhythm through instructions.",
    "allow light breathiness, smile in the voice, and natural sentence-final softness, but avoid exaggerated performance.",
    "default to natural statements and do not end every line with a question.",
    signal.speechRules.length ? `speech constraints: ${signal.speechRules.join("; ")}` : null,
    signal.styleExamples.length ? `reference expressions: ${signal.styleExamples.slice(0, 3).join(" / ")}` : null,
  ].filter(Boolean).join("\n");

  return {
    provider: "qwen",
    model: env.QWEN_TTS_MODEL,
    voiceId: decision.voiceId,
    voiceDescription: VOICES[decision.voiceId]?.description ?? null,
    voiceReason: decision.voiceReason,
    matchedSignals: decision.matchedSignals,
    decisionSource: decision.source,
    genderGuess: decision.genderGuess ?? null,
    ageGuess: decision.ageGuess ?? null,
    styleInstructions: signal.cleanedStyleInstructions,
    speakingRegister: signal.speakingRegister,
    pauseStyle: signal.pauseStyle,
    emotionBaseline: signal.emotionBaseline,
    pitchHint: signal.pitchHint,
    styleExamples: signal.styleExamples,
    instructions,
  };
}
