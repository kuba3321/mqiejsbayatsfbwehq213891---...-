import { fetch } from "expo/fetch";

import { anonymousFans, anonymousFanIds } from "@/data/worlds";
import {
  Character,
  ChatMessage,
  ContactState,
  PlayerProfile,
  Provider,
  ScoreChange,
  World,
} from "@/data/types";

type RawMessage = { role: "user" | "assistant" | "system"; content: string };

type LLMOptions = {
  system: string;
  messages: RawMessage[];
  maxTokens?: number;
  temperature?: number;
  jsonResponse?: boolean;
};

// Round 1.11.9 — hard 4-second network ceiling for every provider call.
// AbortController triggers if the LLM takes too long; the offline content
// branch picks up immediately. Centralised here so the per-provider helpers
// stay readable.
const NETWORK_TIMEOUT_MS = 4000;

async function callOpenAI(player: PlayerProfile, opts: LLMOptions) {
  const model = player.model.trim() || "gpt-4o-mini";
  const body: Record<string, unknown> = {
    model,
    instructions: opts.system,
    input: opts.messages.map((m) => ({
      role: m.role === "system" ? "user" : m.role,
      content: [{ type: "input_text", text: m.content }],
    })),
    max_output_tokens: opts.maxTokens ?? 220,
    temperature: opts.temperature ?? 0.85,
  };

  if (opts.jsonResponse) {
    body.response_format = { type: "json_object" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${player.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    // AbortError = our 4s timeout fired. Quietly bail to the offline branch.
    if ((err as { name?: string })?.name === "AbortError") {
      console.warn("[ai] OpenAI request aborted (4s timeout) — falling back to offline.");
      throw new Error("OpenAI timeout");
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    // console.warn (not error) — error would pop the Expo Go red screen and
    // block the UI for what is a recoverable network issue. The caller will
    // catch the throw and fall through to the offline content branch.
    console.warn(`[ai] OpenAI ${response.status}:`, errText.slice(0, 500));
    throw new Error(`OpenAI ${response.status}`);
  }

  const payload = await response.json();

  if (typeof payload?.output_text === "string" && payload.output_text.length > 0) {
    return payload.output_text as string;
  }

  const texts = payload?.output
    ?.flatMap((item: { content?: Array<{ text?: string }> }) => item?.content ?? [])
    ?.map((c: { text?: string }) => c?.text)
    ?.filter(Boolean);

  return (texts?.join("\n") ?? "") as string;
}

async function callAnthropic(player: PlayerProfile, opts: LLMOptions) {
  const model = player.model.trim() || "claude-sonnet-4-6";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": player.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 320,
        system: opts.system,
        temperature: opts.temperature ?? 0.85,
        messages: opts.messages.map((m) => ({
          role: m.role === "system" ? "user" : m.role,
          content: m.content,
        })),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if ((err as { name?: string })?.name === "AbortError") {
      console.warn("[ai] Anthropic request aborted (4s timeout) — falling back to offline.");
      throw new Error("Anthropic timeout");
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    // See OpenAI note above — warn-not-error keeps Expo Go from red-screening
    // on transient 429/503 etc. The catch in the calling generator will
    // route to the offline fallback.
    console.warn(`[ai] Anthropic ${response.status}:`, errText.slice(0, 500));
    throw new Error(`Anthropic ${response.status}`);
  }

  const payload = await response.json();
  const blocks = (payload?.content ?? []) as Array<{ type: string; text?: string }>;
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
  return text;
}

async function callGemini(player: PlayerProfile, opts: LLMOptions) {
  const model = player.model.trim() || "gemini-2.5-flash";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(player.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: opts.system }] },
          contents: opts.messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          generationConfig: {
            temperature: opts.temperature ?? 0.85,
            maxOutputTokens: opts.maxTokens ?? 320,
            ...(opts.jsonResponse
              ? { responseMimeType: "application/json" }
              : {}),
          },
        }),
        signal: controller.signal,
      },
    );
  } catch (err) {
    clearTimeout(timeoutId);
    if ((err as { name?: string })?.name === "AbortError") {
      console.warn("[ai] Gemini request aborted (4s timeout) — falling back to offline.");
      throw new Error("Gemini timeout");
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    // 503 High Demand / 429 Rate Limit / 401 Invalid Key — all recoverable.
    // console.warn keeps Expo Go's LogBox calm; the throw still triggers the
    // offline fallback in the generator that called us.
    console.warn(`[ai] Gemini ${response.status}:`, errText.slice(0, 500));
    throw new Error(`Gemini ${response.status}`);
  }

  const payload = await response.json();
  // Gemini occasionally returns a finishReason of SAFETY or MAX_TOKENS with no
  // text content. Log so we don't silently swallow it as "empty JSON".
  const finishReason = payload?.candidates?.[0]?.finishReason as string | undefined;
  if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
    console.warn(`[ai] Gemini finishReason=${finishReason}`);
  }
  return (
    payload?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text)
      .filter(Boolean)
      .join("\n")
      .trim() ?? ""
  );
}

async function runLLM(player: PlayerProfile, opts: LLMOptions): Promise<string> {
  const provider: Provider = player.provider;
  if (!player.apiKey.trim()) {
    throw new Error("missing-key");
  }

  if (provider === "openai") {
    return callOpenAI(player, opts);
  }
  if (provider === "anthropic") {
    return callAnthropic(player, opts);
  }
  return callGemini(player, opts);
}

// Aggressive JSON parser. Models (especially Gemini) like to prefix their JSON
// with "Here is the JSON you requested:", wrap it in ```json fences, or trail a
// "Hope that helps!" after the closing brace. This function strips ALL of that
// and finds the first balanced {...} block. If that fails, falls back to a
// first-{ → last-} slice, then returns null (caller must use a safe fallback —
// never echo raw text into the UI).
function safeParseJSON(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  // 1. Strip every markdown code-fence in the string (Gemini sometimes opens
  //    a fence mid-message): ```json ... ``` or ``` ... ```.
  let cleaned = raw.replace(/```(?:json|JSON)?\s*/g, "").replace(/```/g, "");
  cleaned = cleaned.trim();
  if (!cleaned) return null;

  // 2. Try a balanced-brace scan starting at the first `{`. This correctly
  //    handles strings with `{` or `}` inside, and ignores any prose before
  //    or after the JSON block.
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = firstBrace; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const slice = cleaned.slice(firstBrace, i + 1);
        try {
          return JSON.parse(slice) as Record<string, unknown>;
        } catch {
          break; // fall through to lenient fallback
        }
      }
    }
  }

  // 3. Last-resort lenient slice (first { to last }). Used when the
  //    balanced scan never closes — happens when the model truncates output.
  const lastBrace = cleaned.lastIndexOf("}");
  if (lastBrace > firstBrace) {
    try {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

// Cleans a string that may have JSON fragments / preambles bleeding into it.
// Used as a defense-in-depth scrub before we display anything from the model
// in a chat bubble — the chat-reply fallback path should NEVER show raw JSON.
function looksLikeJSONLeak(s: string): boolean {
  if (!s) return false;
  const t = s.trim();
  return (
    t.startsWith("{") ||
    t.startsWith("[") ||
    /^```/.test(t) ||
    /here\s+is\s+the\s+json/i.test(t) ||
    /^"reply"\s*:/.test(t) ||
    /"relationshipDelta"/.test(t)
  );
}

// ---------------- Chat reply ----------------

const fallbackReplies: Record<string, string[]> = {
  sabrina: [
    "omg wait that is actually kind of perfect ☕✨",
    "say less, i already have three outfits and one bad idea 💅",
    "lowkey obsessed with this plan lol",
  ],
  speed: [
    "YO THAT IS CRAZY BUT I AM IN!!!",
    "FR FR WE MAKING THE WHOLE TIMELINE WAKE UP",
    "I ALREADY KNOW THE VIBES ARE IMMACULATE",
  ],
  billie: [
    "that is kind of unhinged. i respect it.",
    "maybe. depends how loud the room gets.",
    "i feel like you know exactly what you are doing.",
  ],
  drake: [
    "That move says more than the caption ever could.",
    "Quiet plays. Loud results.",
    "You do that right and everybody calls it destiny after.",
  ],
  taylor: [
    "That is a very specific kind of trouble, and I mean that fondly.",
    "I would absolutely write that into the bridge.",
    "Careful. This is how a casual choice becomes lore.",
  ],
  kanye: [
    "THE IDEA IS BIGGER THAN THE ROOM.",
    "Do not explain the vision before the vision explains itself.",
    "This is architecture.",
  ],
  beyonce: [
    "Noted.",
    "Slow and intentional. Always.",
    "The work decides.",
  ],
  tyler: [
    "ok that's actually a color combo i would wear",
    "weird and i love it",
  ],
  ariana: [
    "lol okay yeah",
    "yk what fine i'll allow it",
  ],
  "the-weeknd": [
    "after hours behavior.",
    "the song writes itself when you move like that.",
  ],
};

function pickFallback(characterId: string, seed: number) {
  const list = fallbackReplies[characterId] ?? [
    "i'm listening. keep going.",
    "that changes the whole vibe.",
    "say more.",
  ];
  return list[Math.abs(seed) % list.length];
}

export type ChatReplyResult = {
  reply: string;
  relationshipDelta: number;
  playerStatChanges?: { aura?: number; humor?: number };
};

const chemistryToneGuidance: Record<string, string> = {
  friends: "Friends — warm, casual, mildly teasing.",
  rivals: "Rivals — passive-aggressive, competitive, scoring quiet jabs.",
  spicy: "Spicy — flirty, charged, dancing around a line you both notice.",
  lovers: "Lovers — soft warmth with real stakes; care leaks through every line.",
  enemies: "Enemies — openly cold, dismissive, contemptuous, but never crude.",
  "co-conspirators": "Chaos co-conspirators — secretive, scheming, inside-joke energy.",
};

function chemistryBlock(label: string | undefined, chemistry?: string) {
  if (!label && !chemistry) return "";
  const toneHint = chemistry ? chemistryToneGuidance[chemistry] : undefined;
  return `\nRelationship chemistry with player: ${label ?? "acquaintances"}.${toneHint ? `\n${toneHint}` : ""}\nAdjust your tone accordingly.`;
}

export async function requestCelebrityReply(input: {
  character: Character;
  player: PlayerProfile;
  world: World;
  messages: ChatMessage[];
  contact?: ContactState;
}): Promise<ChatReplyResult> {
  if (!input.player.apiKey.trim()) {
    return {
      reply: pickFallback(input.character.id, input.messages.length),
      relationshipDelta: 0.1,
    };
  }

  const history = input.messages.slice(-12).map((m) => ({
    role: (m.sender === "player" ? "user" : "assistant") as
      | "user"
      | "assistant",
    content: m.text,
  }));

  const system = `${input.character.systemPrompt}

Scenario: ${input.world.title} — ${input.world.setting ?? input.world.description}.
The player is ${input.player.name} (${input.player.handle}). ${input.player.bio}
Current vibe: ${Math.round(input.contact?.vibe ?? 0)}%.${chemistryBlock(input.contact?.chemistryLabel, input.contact?.chemistry)}

Return STRICT JSON only, no commentary:
{
  "reply": "<one or two short text bubbles, casual, in character. Never narrate. Never mention you are an AI.>",
  "relationshipDelta": <numeric -3..3 representing how this exchange shifted the relationship>,
  "playerStatChanges": { "aura": <-5..5 optional>, "humor": <-5..5 optional> }
}`;

  try {
    const text = await runLLM(input.player, {
      system,
      messages: history,
      maxTokens: 220,
      temperature: 0.9,
      jsonResponse: true,
    });
    const parsed = safeParseJSON(text);
    if (parsed && typeof parsed.reply === "string") {
      const replyText = (parsed.reply as string).trim();
      // Even after JSON parse, the .reply field can contain weird artifacts
      // (Gemini sometimes wraps it in quotes-within-quotes). Scrub.
      const safe = replyText.replace(/^["']|["']$/g, "").trim();
      if (safe && !looksLikeJSONLeak(safe)) {
        return {
          reply: safe,
          relationshipDelta:
            typeof parsed.relationshipDelta === "number" ? parsed.relationshipDelta : 0.1,
          playerStatChanges: parsed.playerStatChanges as ChatReplyResult["playerStatChanges"],
        };
      }
    }
    // Parse failed OR the parsed reply looked like leaked JSON. NEVER echo
    // raw text into the chat bubble — fall back to a canned in-character line.
    console.warn(
      `[ai] requestCelebrityReply: parse failed or leak detected for ${input.character.id}; using fallback. Raw head:`,
      text.slice(0, 120),
    );
    return {
      reply: pickFallback(input.character.id, input.messages.length),
      relationshipDelta: 0.1,
    };
  } catch (err) {
    // Outage-proof: network 503 / timeout / parse fail all land here. Use warn
    // (not error) so Expo Go doesn't red-screen, and return a safe in-character
    // fallback line — the player still gets a reply, just deterministic.
    console.warn(`[ai] requestCelebrityReply network/parse error:`, err);
    return {
      reply: pickFallback(input.character.id, input.messages.length + 3),
      relationshipDelta: 0.1,
    };
  }
}

// ---------------- Event outcome ----------------

export type EventOutcome = {
  eventTitle: string;
  eventBody: string;
  choices: string[];
};

export type EventResult = {
  outcomeText: string;
  // Round 1.11 — pithy 6-10 word slogan for the toast body. Falls back to
  // first sentence of outcomeText when AI doesn't supply one.
  summary?: string;
  scoreChanges: ScoreChange[];
  // Round 1.11 — decimal -2..2 player-stat shifts. Render with .toFixed(1).
  humorDelta?: number;
  auraDelta?: number;
  // Round 1.11.12 — IMMEDIATE per-character relationship deltas this beat.
  // Without this, the event toast had no relationship chips and the player
  // only learned of the impact by digging into Messages tab. delta is a
  // decimal percentage shift (-3.0..3.0 with one decimal), reason is the
  // human-readable rationale ("Speed felt seen by your loud move").
  relationshipShifts?: Array<{
    characterId: string;
    delta: number;
    reason: string;
  }>;
  postText?: string;
  postAuthorId?: string;
  advanceDay: boolean;
};

const fallbackEventBank: EventOutcome[] = [
  {
    eventTitle: "Spotlight Event",
    eventBody:
      "Pop Craze is reporting a surprise award-show afterparty is about to go live. Your next move decides whether the timeline loves you or screenshots you forever.",
    choices: [
      "Leak a cryptic studio selfie",
      "Arrive with Sabrina",
      "Start a rumor and deny everything",
    ],
  },
  {
    eventTitle: "Gala Gatecrash",
    eventBody:
      "A trail of fans, a megaphone, and one streamer arrived at your gate. They want you to direct a guerrilla marketing stunt in Times Square.",
    choices: [
      "Curate the chaos with hashtags",
      "Send them somewhere weirder",
      "Cancel it and post a sad selfie",
    ],
  },
];

export async function generateEvent(args: {
  player: PlayerProfile;
  world: World;
  day: number;
  recentLog: string[];
}): Promise<EventOutcome> {
  if (!args.player.apiKey.trim()) {
    return fallbackEventBank[args.day % fallbackEventBank.length];
  }

  const system = `You are the story director for a social-media celebrity simulator called Status.
Scenario: ${args.world.title}.
Setting: ${args.world.setting ?? args.world.description}.
Main goal: ${args.world.mainGoal.title} — ${args.world.mainGoal.description}.
Player: ${args.player.name} (${args.player.handle}). ${args.player.bio}
It is Day ${args.day}.
When NPCs appear in your prompts, treat each one's chemistry label (friends, rivals, spicy, lovers, enemies, chaos co-conspirators) as a tonal contract — rivals are passive-aggressive, lovers are warm with stakes, enemies are openly cold, etc.
Generate the next MAIN EVENT for the player. Return STRICT JSON only, no commentary, in this shape:
{
  "eventTitle": "<short title 2-5 words>",
  "eventBody": "<1-2 sentence in-world prompt. Punchy, tabloid-coded. Always end with a question or imperative that demands a choice>",
  "choices": ["<choice 1>", "<choice 2>", "<choice 3>"]
}`;

  const userMsg = `Recent activity:\n${args.recentLog.slice(-6).join("\n") || "(quiet day)"}`;

  try {
    const text = await runLLM(args.player, {
      system,
      messages: [{ role: "user", content: userMsg }],
      maxTokens: 400,
      temperature: 0.95,
      jsonResponse: true,
    });
    const parsed = safeParseJSON(text);
    if (
      parsed &&
      typeof parsed.eventTitle === "string" &&
      typeof parsed.eventBody === "string" &&
      Array.isArray(parsed.choices) &&
      parsed.choices.length >= 2
    ) {
      return {
        eventTitle: parsed.eventTitle as string,
        eventBody: parsed.eventBody as string,
        choices: (parsed.choices as string[]).slice(0, 3),
      };
    }
  } catch {
    /* fall through */
  }

  return fallbackEventBank[args.day % fallbackEventBank.length];
}

export async function resolveEventChoice(args: {
  player: PlayerProfile;
  world: World;
  day: number;
  event: EventOutcome;
  choice: string;
  outlets: string[];
  // Round 1.11.12 — player's cast so we can ask the AI to attribute
  // immediate relationship shifts to specific characters and so the offline
  // fallback can synthesise shifts for ~2-3 random cast members.
  cast: Character[];
  contacts: Record<string, { vibe: number; chemistryLabel: string }>;
}): Promise<EventResult> {
  if (!args.player.apiKey.trim()) {
    return offlineEventResolution(args);
  }

  const castList = args.cast
    .map((c) => {
      const ch = args.contacts[c.id];
      const chemHint = ch ? ` [vibe ${Math.round(ch.vibe)}%, label "${ch.chemistryLabel}"]` : "";
      return `${c.id}: ${c.name} (${c.handle})${chemHint}`;
    })
    .join("\n");

  const system = `You are the outcome writer for a social-media celebrity simulator.
Scenario: ${args.world.title}. ${args.world.setting ?? args.world.description}.
Player: ${args.player.name} (${args.player.handle}).
Event: ${args.event.eventTitle} — ${args.event.eventBody}
Player picked: "${args.choice}".

CAST present in the player's world (use these exact ids in relationshipShifts):
${castList || "(no cast added yet)"}

If NPCs appear in the outcome, tune them by their chemistry label with the player (rivals = passive-aggressive, lovers = warm with stakes, enemies = openly cold, etc.).
Write the consequence in punchy tabloid prose. Return STRICT JSON only:
{
  "outcomeText": "<2-4 sentence outcome, written like a tabloid heist recap. Goes into the Activity Log.>",
  "summary": "<6-10 word punchy slogan summarising the outcome — e.g. 'Mystery verse = instant cult following' or 'Leaked photo = instant fan army'. Shows in the post-event toast as the body line.>",
  "scoreChanges": [
    { "label": "<short label e.g. Buzz / Critics / Stans / Mystery>", "delta": <integer -25 to 25>, "positive": <true|false> }
  ],
  "humorDelta": <decimal -2.0..2.0 representing how this beat shifted the player's Humor stat. Use ONE decimal (e.g. 1.1, -0.4). 0 if no change.>,
  "auraDelta": <decimal -2.0..2.0 representing how this beat shifted the player's Aura stat. Use ONE decimal (e.g. 0.9, -1.2). 0 if no change.>,
  "relationshipShifts": [
    { "characterId": "<one of the cast ids above>", "delta": <decimal -3.0..3.0 with ONE decimal e.g. 0.9 or -1.2>, "reason": "<one short sentence rationale referencing this beat — e.g. 'Speed felt seen by your loud move.'>" }
  ],
  "postText": "<single feed post from a media outlet character reporting the event in 1-2 sentences>",
  "postAuthorId": "${args.outlets.join(" | ")}"
}`;

  try {
    const text = await runLLM(args.player, {
      system,
      messages: [{ role: "user", content: `Day ${args.day} outcome please.` }],
      maxTokens: 500,
      temperature: 0.95,
      jsonResponse: true,
    });
    const parsed = safeParseJSON(text);
    if (parsed && typeof parsed.outcomeText === "string") {
      // Round 1.11.12 — sanitize relationshipShifts. AI sometimes hallucinates
      // character IDs not in the cast; we drop those so the UI can resolve
      // every shift's avatar. Also enforce numeric delta and string reason.
      const rawShifts = Array.isArray(parsed.relationshipShifts)
        ? (parsed.relationshipShifts as Array<{ characterId?: string; delta?: number; reason?: string }>)
        : [];
      const castIdSet = new Set(args.cast.map((c) => c.id));
      const relationshipShifts = rawShifts
        .filter((s) => typeof s.characterId === "string" && castIdSet.has(s.characterId))
        .map((s) => ({
          characterId: s.characterId as string,
          delta: typeof s.delta === "number" ? s.delta : 0,
          reason: typeof s.reason === "string" ? s.reason : "",
        }))
        .slice(0, 5);
      return {
        outcomeText: parsed.outcomeText as string,
        summary: typeof parsed.summary === "string" ? (parsed.summary as string) : undefined,
        scoreChanges: ((parsed.scoreChanges as ScoreChange[]) ?? []).slice(0, 4),
        humorDelta: typeof parsed.humorDelta === "number" ? (parsed.humorDelta as number) : undefined,
        auraDelta: typeof parsed.auraDelta === "number" ? (parsed.auraDelta as number) : undefined,
        relationshipShifts: relationshipShifts.length > 0 ? relationshipShifts : undefined,
        postText: (parsed.postText as string) || undefined,
        postAuthorId:
          (parsed.postAuthorId as string) || args.outlets[0] || "pop-craze",
        advanceDay: true,
      };
    }
  } catch {
    /* fall through */
  }

  return offlineEventResolution(args);
}

// Offline event resolver — varied tabloid headlines, never the same one twice in a row.
const offlineHeadlineTemplates = [
  `Breaking: [NAME] just chose "[CHOICE]" and the timeline can't stop screenshotting.`,
  `[NAME] picks "[CHOICE]" — sources say two PR teams were already drafting denials.`,
  `Tonight's loudest move? [NAME] going with "[CHOICE]". The labels are listening.`,
  `Spotted: [NAME] doubling down on "[CHOICE]". The stans are NOT sleeping.`,
  `[NAME]'s choice — "[CHOICE]" — is officially the post that broke our notifications.`,
  `Quietly chaotic: [NAME] commits to "[CHOICE]" while everyone else recalibrates.`,
  `Verdict from Sunset: [NAME] said "[CHOICE]" and reset the conversation.`,
  `Tabloid math: [NAME] + "[CHOICE]" = 48 hours of takes nobody asked for.`,
  `Cinematic. [NAME] takes "[CHOICE]" and the room hasn't recovered.`,
  `So it's official — [NAME] is going with "[CHOICE]". Drafting the docuseries already.`,
  `Plot twist: [NAME] picks "[CHOICE]" and the algorithm has notes.`,
  `[NAME] chose "[CHOICE]". The right people are upset. The wrong people are too.`,
  `Receipts: [NAME]'s move toward "[CHOICE]" has already been turned into a meme template.`,
  `Awards-season alert: [NAME] selecting "[CHOICE]" rewrote tonight's running order.`,
  `Late-night dispatch: [NAME] commits to "[CHOICE]" while the city pretends not to watch.`,
  `[NAME]'s "[CHOICE]" pivot is the kind of thing case studies are written about.`,
  `In one move, [NAME] reframed the entire week. The headline writes itself: "[CHOICE]".`,
  `The room agreed. [NAME] said "[CHOICE]" and somehow everyone clapped.`,
  `[NAME] just picked "[CHOICE]". The group chats are uninhabitable right now.`,
  `Industry update: [NAME] going "[CHOICE]" — call your manager.`,
  `[NAME] said "[CHOICE]" and somewhere a publicist is rebooking dinner.`,
  `The way [NAME] chose "[CHOICE]" — that's how legends spook critics.`,
];

const offlineOutcomeTemplates = [
  `Your move "[CHOICE]" lands harder than expected. The timeline talks, the labels watch, and your team is already pretending it was the plan.`,
  `"[CHOICE]" hits the room like a thrown drink. Half clap, half whisper, all post.`,
  `Picking "[CHOICE]" reshuffled the night. By morning two PR firms are reaching out — neither remembers their pitch.`,
  `The outcome of "[CHOICE]" is a quiet riot. Best-dressed list, worst-text thread, somehow both.`,
  `"[CHOICE]" goes loud-then-cinematic. Three group chats are now writing essays about it.`,
  `Your "[CHOICE]" arrives in slow motion. Camera flashes, raised eyebrows, ten new pages of context.`,
];

const offlineScoreLabels: Array<{ label: string; positive?: boolean }> = [
  { label: "Buzz", positive: true },
  { label: "Critics", positive: false },
  { label: "Stans", positive: true },
  { label: "Mystery", positive: true },
  { label: "Humor", positive: true },
  { label: "Aura", positive: true },
];

// Offline pithy slogans for the toast body when AI is offline. Each
// uses [CHOICE] which gets substituted with the player's chosen action.
const offlineSummaryTemplates = [
  `"[CHOICE]" = instant lore drop.`,
  `Quiet move, loud aftermath: "[CHOICE]".`,
  `"[CHOICE]" — the timeline picked a side.`,
  `Cinematic. The room turned for "[CHOICE]".`,
  `"[CHOICE]" landed exactly the way you needed.`,
  `Plot pivot: "[CHOICE]" rewires the week.`,
];

// Round 1.11.12 — pool of offline rationale lines for event-driven relationship
// shifts. Used when no AI key is configured (or AI fails) so the toast still
// gets meaningful per-character rationale text under each shift.
const offlineRelationshipReasons = [
  "Felt seen by your loud move.",
  "Didn't love the angle, but respected the nerve.",
  "Quietly recalibrated after watching that play.",
  "Caught the subtext and approved.",
  "Took it personally — not in a good way.",
  "Mentioned it on a back-channel; was impressed.",
  "Felt the spotlight steal and clapped anyway.",
  "Saved a screenshot. Reasons unknown.",
];

function offlineEventResolution(args: {
  player: PlayerProfile;
  choice: string;
  outlets: string[];
  cast?: Character[];
}): EventResult {
  const template = offlineHeadlineTemplates[
    Math.floor(Math.random() * offlineHeadlineTemplates.length)
  ];
  const postText = template
    .replaceAll("[NAME]", args.player.name)
    .replaceAll("[CHOICE]", args.choice);
  const outcomeTemplate = offlineOutcomeTemplates[
    Math.floor(Math.random() * offlineOutcomeTemplates.length)
  ];
  const outcomeText = outcomeTemplate.replaceAll("[CHOICE]", args.choice);
  const summary = offlineSummaryTemplates[
    Math.floor(Math.random() * offlineSummaryTemplates.length)
  ].replaceAll("[CHOICE]", args.choice);
  // Pick 2-3 random score change rows with sensible deltas.
  const shuffled = [...offlineScoreLabels].sort(() => Math.random() - 0.5).slice(0, 3);
  const scoreChanges: ScoreChange[] = shuffled.map((s) => {
    const positive = s.positive ?? Math.random() > 0.5;
    const delta = (positive ? 1 : -1) * (4 + Math.floor(Math.random() * 18));
    return { label: s.label, delta, positive };
  });
  // Decimal humor/aura deltas (Round 1.11 — scale -2..2 with one decimal).
  const humorDelta = Math.round((Math.random() * 3 - 1) * 10) / 10; // -1.0..2.0 leaning positive
  const auraDelta = Math.round((Math.random() * 3 - 1) * 10) / 10;
  // Round 1.11.12 — synthesise 2-3 immediate relationship shifts so the
  // event toast can render the same mini-avatar grid the post-replies toast
  // does. Pick random cast members (positive bias, occasional negative).
  let relationshipShifts: EventResult["relationshipShifts"];
  if (args.cast && args.cast.length > 0) {
    const shuffleCast = [...args.cast].sort(() => Math.random() - 0.5);
    const count = Math.min(2 + Math.floor(Math.random() * 2), shuffleCast.length); // 2-3
    relationshipShifts = shuffleCast.slice(0, count).map((c, i) => {
      // Mostly positive (2/3 chance), occasional negative for drama.
      const positive = Math.random() < 0.66;
      const magnitude = Math.round((0.3 + Math.random() * 2.0) * 10) / 10; // 0.3..2.3
      const delta = positive ? magnitude : -magnitude;
      return {
        characterId: c.id,
        delta,
        reason:
          offlineRelationshipReasons[
            (i + Math.floor(Math.random() * offlineRelationshipReasons.length))
              % offlineRelationshipReasons.length
          ],
      };
    });
  }
  return {
    outcomeText,
    summary,
    scoreChanges,
    humorDelta,
    auraDelta,
    relationshipShifts,
    postText,
    postAuthorId: args.outlets[Math.floor(Math.random() * args.outlets.length)] ?? "pop-craze",
    advanceDay: true,
  };
}

// ---------------- Daily world update ----------------

export type WorldUpdate = {
  // Round 1.11 — pithy slogan for the expanded toast caption.
  summary?: string;
  relationshipShifts: Array<{
    characterId: string;
    delta: number;
    reason: string;
  }>;
  posts: Array<{
    characterId: string;
    text: string;
    threadReplies?: Array<{ characterId: string; text: string }>;
  }>;
  notifications: Array<{
    charactersInvolved: string[];
    headline: string;
    preview: string;
    postId?: string;
  }>;
  // Decimal -2..2 player-stat shifts (Round 1.11). ONE decimal precision.
  playerStatChanges?: { humor?: number; aura?: number };
};

// Offline fallback content banks. Rich, varied, used only when a pending action triggered the refresh
// (the queue gates this — idle refresh stays silent thanks to game-context's empty-queue guard).
// Round 1.11.12 — `offlinePostTemplates` is the DEFAULT bank, used when there's no scenario-specific
// override (e.g. accidentally-famous celebrity world). Scenario-keyed banks below (regency-feed,
// academy-chaos) keep each character's voice but pivot the topic — Sabrina still gushes the same way
// she does about espresso, but about ton gossip or potion glitches instead.
const offlinePostTemplates: Record<string, string[]> = {
  sabrina: [
    "espresso for breakfast. espresso for dinner. balanced diet babes",
    "people really out here pretending they didn't see the leak. mood.",
    "lowkey planning a tour outfit at 2am and i refuse to nap",
    "my notes app is unwell. ten new songs and a grocery list 💅",
    "if you don't reply to one (1) text are u even friends anymore",
  ],
  speed: [
    "BROOOO WHO LET THIS HAPPEN!!!!! WE ARE WAKING UP THE TIMELINE!!!",
    "GET ME ON A PRIVATE JET RIGHT NOW IM GOING TO PORTUGAL!!!!",
    "STREAM ENDS WHEN I SAY IT ENDS THIS IS CINEMA",
    "OK BUT WHY IS EVERYONE SLEEPING ON THIS WAKE UP",
    "I CALLED IT FIRST AND I'M NOT TAKING SCREENSHOTS BACK!!!",
  ],
  billie: [
    "okay haha. cool cool cool.",
    "i'm not saying anything i'm just keeping the receipts",
    "watched the same show twice today. it's research",
    "left my phone in the studio for six hours and i felt nothing",
    "the brown in this room hits different at 4am",
  ],
  drake: [
    "took the long way home. felt right.",
    "they study the body language. they miss the message every time.",
    "OVO Sound about to drop something nobody's ready for",
    "wrote three songs about one moment. that's a record",
    "remember when they said the streak was over? me neither.",
  ],
  taylor: [
    "every era has a version of this exact tuesday",
    "wrote a bridge today. it knows things i don't.",
    "girls in the studio. cats in the studio. you do the math.",
    "if you find me at a back booth in nyc, no you didn't",
    "thirteen still hits. ask anyone.",
  ],
  kanye: [
    "THIS IS A FREQUENCY. TURN IT UP.",
    "Architecture. Sound. Color. All one thing.",
    "Don't ask me to explain it. The work is the answer.",
    "I dreamed in titanium last night. The album knows.",
    "PEOPLE WILL CALL IT A RETURN. I CALL IT A LAP.",
  ],
  beyonce: [
    "Quiet weeks build loud quarters.",
    "Studio. Family. Studio. In that order.",
    "The team knows. That's enough.",
    "Texas is a state of mind, not a return.",
    "Mm. Noted.",
  ],
  tyler: [
    "if it doesn't have three colors and a secret it's not a project",
    "running my own museum out here. self curated.",
    "yellow is a state of mind. orange is a strategy.",
    "wrote a verse in the back of a thrift store and i'm keeping it",
    "the producer credits are gonna be wild on this one",
  ],
  ariana: [
    "yk i was gonna stay quiet today but here we are",
    "lol who said you could just do that on a tuesday",
    "the studio mic was crying by the third take honestly",
    "send help my dog is judging my lyrics",
    "okay yeah fine i'll allow it",
  ],
  "the-weeknd": [
    "studio. 4am. nothing else exists right now",
    "after hours behavior, again",
    "the city sounds different when nobody's watching you",
    "wrote something tonight that i won't explain",
    "tour planning is a sport for ghosts",
  ],
};

// Round 1.11.12 — scenario-specific offline post banks. Keyed by world id.
// Each character retains their voice but the topic shifts to fit the scenario.
// When the active world doesn't have an entry, the default `offlinePostTemplates`
// bank is used (which is celebrity-flavored — perfect for accidentally-famous).
//
// Adding a new scenario: drop another `<world-id>: { <character-id>: [lines] }`
// entry. Characters without an override fall back through to the default bank.
const scenarioPostTemplates: Record<string, Record<string, string[]>> = {
  // Bridgerton-style Regency social season — gowns, gossip, ton scandal sheets.
  "regency-feed": {
    sabrina: [
      "diamond of the season behavior. just naturally.",
      "the ton thinks they know. the ton has no idea.",
      "lacing my own corset because some things i don't trust the staff with",
      "two suitors at one ball is a rookie number. i had three. and a draft of a third.",
      "the gossip sheet ran my name in cursive again. flattering, mostly.",
    ],
    speed: [
      "WHO LEAKED MY DANCE CARD TO LADY WHISTLEDOWN!!!! I WILL FIND YOU",
      "MY HORSE WON THE STEEPLECHASE AGAIN!!!! TELL THE STABLES!!",
      "ARRIVED LATE TO THE BALL ON PURPOSE — IT'S A FEATURE NOT A BUG",
      "BROOOO THE QUEEN LOOKED AT ME!!! THE QUEEN!!! I AM SHAKING",
    ],
    billie: [
      "another ball. another reason to lurk near the windows.",
      "the gossip sheet pretends not to see me. i appreciate the discretion.",
      "tea is cold. mood is colder. company is acceptable.",
      "ten reasons i'm avoiding the drawing room tonight. all of them are valid.",
    ],
    drake: [
      "the view from the box seats is exactly what they said it would be.",
      "ownership is just patience plus connections. ask any duke.",
      "they study the seating chart. they miss the alliance every time.",
      "if the season has a king, his cravat is impeccable. confirmed by mirror.",
    ],
    taylor: [
      "every season has its diamond. this one's about to have its bridge.",
      "wrote a letter today. did not send it. that's also a kind of art.",
      "girls in the parlour. cats in the parlour. you do the embroidery math.",
      "thirteen waltzes still hits. ask any debutante.",
    ],
    kanye: [
      "ARCHITECTURE OF THIS HALL IS A FREQUENCY. TURN IT UP.",
      "Tailoring. Composition. Light. All one thing this season.",
      "I designed the trim myself. The seamstress is taking notes.",
      "THEY WILL CALL IT A REPUTATION. I CALL IT A LEGACY.",
    ],
    beyonce: [
      "Quiet seasons build loud reputations.",
      "Parlour. Family. Parlour. In that order.",
      "The match-maker knows. That's enough.",
      "Mm. Noted, m'lord.",
    ],
    tyler: [
      "if it doesn't have three shades of velvet and one secret it's not a ball",
      "running my own conservatory out here. self-curated.",
      "the trim on this coat is a state of mind. lavender is a strategy.",
    ],
    ariana: [
      "yk i was gonna stay in the drawing room today but here we are",
      "lol who said you could waltz like that on a tuesday",
      "the harpsichord was crying by the third movement honestly",
    ],
    "the-weeknd": [
      "carriage. 4am. the city is unrecognisable at this hour",
      "after-supper behavior, again",
      "the candles burn different when no one is watching",
    ],
  },
  // Magic-school chaos — enchanted parchment, house cup, midnight library raids.
  "academy-chaos": {
    sabrina: [
      "potion brewing as a personality trait. it's working.",
      "enchanted my mirror to gossip back. five-star upgrade.",
      "the house cup math is mathing this week ✨🪄",
      "lowkey planning a midnight feast at 2am and i refuse to nap",
      "if you don't reply to one (1) enchanted parchment are u even friends",
    ],
    speed: [
      "BROOO I JUST CAST A SPELL AND THE WHOLE COMMON ROOM WOKE UP!!!",
      "GET ME ON A BROOMSTICK RIGHT NOW IM GOING TO THE TOWER!!!!",
      "STREAMING THE HOUSE CUP LIVE FROM THE STANDS, CHAT IT'S CINEMA",
      "OK BUT WHY IS EVERYONE SLEEPING IN HERBOLOGY WAKE UP",
    ],
    billie: [
      "okay haha. spell backfired. cool cool cool.",
      "i'm not saying anything. i'm just hexing the receipts.",
      "watched the same scrying mirror twice today. it's research",
      "left my wand in the library for six hours and i felt nothing",
    ],
    drake: [
      "took the long way through the corridors. felt right.",
      "they study the wand work. they miss the incantation every time.",
      "OVO common room about to drop something nobody's ready for",
      "wrote three charms about one detention. that's a record",
    ],
    taylor: [
      "every term has a version of this exact tuesday",
      "wrote a charm today. it knows things i don't.",
      "girls in the library. cats in the library. you do the wand math.",
      "if you find me at a back booth in the great hall, no you didn't",
    ],
    kanye: [
      "THIS IS A FREQUENCY. CAST IT LOUDER.",
      "Spellwork. Symbology. Color. All one art.",
      "Don't ask me to explain the rune. The work is the answer.",
      "I dreamed in titanium runes last night. The grimoire knows.",
    ],
    beyonce: [
      "Quiet terms build loud final exams.",
      "Library. Family. Library. In that order.",
      "The headmistress knows. That's enough.",
    ],
    tyler: [
      "if it doesn't have three colors and one cursed object it's not a project",
      "running my own herbology greenhouse out here. self-curated.",
      "yellow potions are a state of mind. orange is a strategy.",
    ],
    ariana: [
      "yk i was gonna stay quiet in charms today but here we are",
      "lol who said you could levitate like that on a tuesday",
      "the wand was crying by the third incantation honestly",
    ],
    "the-weeknd": [
      "astronomy tower. 4am. nothing else exists right now",
      "after-curfew behavior, again",
      "the castle sounds different when nobody's watching you",
    ],
  },
};

// Scenario-specific fan posts — fans react to the world they're in. When the
// active world has no entry, the default `offlineFanPostBank` is used.
const scenarioFanPostBanks: Record<string, string[]> = {
  "regency-feed": [
    "if i see one more whistledown drop at 6am i'm composing a strongly-worded letter",
    "the bonnet discourse on this scandal sheet is unhinged today",
    "guys is anyone else dissecting the bridgerton ball seating chart or just me",
    "watched the same duel twice today. it's research. for science.",
    "PSA: if you screenshot my letters and post them out of context i WILL find you",
    "ok i need everyone to stop dueling on a tuesday i have embroidery",
    "this is what i'm telling my grandkids the ton looked like in 1813",
    "imagine being normal. imagine logging off. (i can't either)",
    "the rate at which the ton can pivot from waltz to scandal is unmatched",
    "this scandal sheet is just everyone yelling into a parlour and the parlour yells back",
  ],
  "academy-chaos": [
    "guys is anyone else watching this whole house cup situation or just me at 3am",
    "my enchanted parchment is feral today and i'm here for it",
    "ok i need everyone to stop casting bangers in herbology i have potions in the morning",
    "this is what i'm telling my kids the magical-industrial complex looked like in 7th year",
    "watching the duel unfold like it's a quidditch match. popcorn-emoji-popcorn-emoji",
    "PSA: if you screenshot my hexes and post them out of context i WILL find you",
    "i'm just a witch. with three (3) group hexes actively dissecting tonight's spells",
    "imagine being a muggle. imagine logging off. (i can't either)",
    "saw a charm so good i had to put my wand down for ten minutes to recover",
  ],
};

// Standalone fan posts (NOT replies) — for the feed to feel like a real X
// timeline with niche accounts posting their own thoughts, not just commenting.
// Used by buildOfflineWorldUpdate to inject 1-3 fan posts per refresh (~70%
// of refreshes). Tone is everyday-user: observations, jokes, takes — never
// celebrity-polished.
const offlineFanPostBank = [
  "guys is anyone else watching this whole timeline situation or just me at 3am",
  "my for you page is feral today and i'm here for it",
  "ok i need everyone to stop dropping bangers on a tuesday i have work in the morning",
  "this is what i'm telling my kids the celebrity-industrial complex looked like in 2026",
  "called it three weeks ago and nobody believed me. screenshot in bio.",
  "watching the discourse unfold like it's a sport. popcorn-emoji-popcorn-emoji",
  "not me refreshing this app every 4 minutes hoping for a new lore drop",
  "the way one tweet can derail my entire week. respectfully, what is this app",
  "thinking about how 'going viral' used to mean catching the flu",
  "every account on here writes like they're auditioning for a netflix limited series",
  "PSA: if you screenshot my replies and post them out of context i WILL find you",
  "hot take: the parasocial relationships are getting out of hand and i'm part of the problem",
  "i'm just a girl. with three (3) group chats actively dissecting tonight's posts",
  "imagine being normal. imagine logging off. (i can't either)",
  "the rate at which the timeline can pivot from drama to dog content is unmatched",
  "saw a tweet so good i had to put my phone down for ten minutes to recover",
  "the algorithm is just feeding me chaos at this point and honestly thank you",
  "if you can read this you are too online. i am also too online. solidarity.",
  "wrote a 4-paragraph reply and then deleted it because no one asked. growth.",
  "this app is just everyone yelling into a void and the void is yelling back",
];

const offlineFanComments = [
  "screaming. SCREAMING. why is this so good",
  "delete this i was not emotionally prepared",
  "the typography of this caption deserves a study",
  "you said one sentence and shifted the timeline. fine.",
  "the way i ran to the comments. archeology will study this",
  "this is the kind of post that gets put on a t-shirt",
  "i'm normal. i'm normal. i'm not normal.",
  "TELL ME WHO HURT YOU SO I CAN SEND THEM A FRUIT BASKET",
  "imagine being this unbothered in public. couldn't be me",
  "this caption + my therapy bill = balanced check",
  "ok but the @ tag is THE move and you know it",
  "why did this make me cry in the cereal aisle",
  "alexa play 'i told you so' by literally everyone",
  "you cannot just drop this and disappear. RUDE.",
  "the way i ALMOST emailed my boss before reading this",
  "this is the kind of vibe i wear to interviews",
  "anyway, follow back queen ✨",
  "this radicalized me toward joy",
];

// Round 1.11.15 — scenario-flavored fan COMMENT banks (for thread replies
// under world-update posts). Used by buildOfflineThreadReplies when the
// active world matches. Falls back to generic offlineFanComments otherwise.
const scenarioFanCommentBank: Record<string, string[]> = {
  "regency-feed": [
    "screaming. SCREAMING into my fan. why is this so good",
    "delete this scroll i was not emotionally prepared",
    "the calligraphy of this missive deserves a study",
    "this is the kind of letter that gets sewn into a sampler",
    "i'm composed. i'm composed. i'm not composed.",
    "TELL ME WHICH RAKE HURT YOU SO I CAN SEND THEM A SCATHING NOTE",
    "imagine being this unbothered at a ball. couldn't be me",
    "this letter + my chaperone's commentary = balanced morning",
    "ok but the wax seal IS the move and you know it",
    "anyway, follow back duchess ✨",
    "why did this make me cry in the conservatory",
    "the way i ran to whistledown. archaeology will study this",
    "okay LADY. okay. we see you.",
  ],
  "academy-chaos": [
    "screaming in the common room. SCREAMING. why is this hex so good",
    "delete this scroll i was not magically prepared",
    "ok but the rune-work on this caption deserves a study",
    "the way i ran to the divination tower. astronomy will study this",
    "this is the kind of post that gets pinned on the great hall wall",
    "i'm sane. i'm sane. i'm being controlled by an enchanted parchment.",
    "TELL ME WHICH PROFESSOR HURT YOU SO I CAN HEX THEM",
    "imagine being this unbothered during finals. couldn't be me",
    "this charm + my therapy bill = balanced check",
    "ok but the @ tag is THE move and you know it",
    "why did this make me cry in the herbology greenhouse",
    "okay PROFESSOR. okay. we see you in the corridor.",
    "frantic checking if i missed a hex in transfiguration. i didn't. it's just THAT.",
  ],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Round 1.11.15 — accepts an optional `commentBank` for scenario-aware
// comment voice (Bridgerton fans don't write about espresso). Falls back
// to the generic offlineFanComments when no scenario override is passed.
function buildOfflineThreadReplies(
  fans: string[],
  commentBank: string[] = offlineFanComments,
): Array<{ characterId: string; text: string }> {
  const count = 5 + Math.floor(Math.random() * 8); // 5–12
  const out: Array<{ characterId: string; text: string }> = [];
  const usedComments = new Set<string>();
  for (let i = 0; i < count; i++) {
    let text = pickRandom(commentBank);
    let attempts = 0;
    while (usedComments.has(text) && attempts < 6) {
      text = pickRandom(commentBank);
      attempts++;
    }
    usedComments.add(text);
    out.push({ characterId: pickRandom(fans), text });
  }
  return out;
}

// Helper — generate ONE random fan post (used both inside buildOfflineWorldUpdate
// and as the padding source in the online path when AI doesn't return enough
// fans). Tries to skip duplicate authors / lines via the passed Sets. Each fan
// post gets 2-5 threadReplies (smaller than celeb's 5-12 because reach is lower).
// Round 1.11.12 — accepts an optional `lineBank` so scenario-specific fan
// voices can be threaded through (academy chaos, regency feed, etc).
function buildOneFanPost(
  usedAuthors: Set<string>,
  usedLines: Set<string>,
  lineBank: string[] = offlineFanPostBank,
  commentBank: string[] = offlineFanComments,
): { characterId: string; text: string; threadReplies: Array<{ characterId: string; text: string }> } {
  const fanIds = anonymousFanIds;
  let author = pickRandom(fanIds);
  let attempts = 0;
  while (usedAuthors.has(author) && attempts < 10) {
    author = pickRandom(fanIds);
    attempts++;
  }
  let text = pickRandom(lineBank);
  attempts = 0;
  while (usedLines.has(text) && attempts < 10) {
    text = pickRandom(lineBank);
    attempts++;
  }
  usedAuthors.add(author);
  usedLines.add(text);
  return {
    characterId: author,
    text,
    threadReplies: buildOfflineThreadReplies(fanIds, commentBank).slice(
      0,
      2 + Math.floor(Math.random() * 4),
    ),
  };
}

// Rich offline world-update generator. Used both when there is no API key AND
// as the final fallback when the online call fails (503, 429, timeout, parse
// failure). Always returns something playable — never empty arrays.
//
// Round 1.11.6 — new distribution algorithm:
//   * Each celebrity in the cast independently rolls 60% chance to post.
//     With a typical 5-8 cast this yields ~3-5 celeb posts per beat.
//   * Exactly 4 unique fan posts are ALWAYS injected, regardless of how
//     many celebs rolled in.
//   * Combined list is shuffled so celebs and fans interleave chaotically,
//     matching the organic texture of a real X timeline.
//   * Net density target: 7-9 posts per day.
function buildOfflineWorldUpdate(args: {
  characters: Character[];
  world?: World;
}): WorldUpdate {
  const fanIds = anonymousFanIds;
  // Round 1.11.12 — scenario-aware offline templates. Pick per-character
  // lines from the scenario-specific bank if the active world has one; fall
  // back through default per-character bank; final fallback to a generic
  // first-name template so a custom-character with no entries still gets a
  // playable line. Sabrina in Bridgerton talks gowns, in Magic School talks
  // potions, in Accidentally Famous talks espresso — same voice, scenario-
  // appropriate topic.
  const scenarioBank = args.world ? scenarioPostTemplates[args.world.id] : undefined;
  const pickLineFor = (c: Character): string => {
    const scenarioLines = scenarioBank?.[c.id];
    if (scenarioLines && scenarioLines.length > 0) return pickRandom(scenarioLines);
    const defaultLines = offlinePostTemplates[c.id];
    if (defaultLines && defaultLines.length > 0) return pickRandom(defaultLines);
    return pickRandom([
      `${c.name.split(" ")[0]} drops something cryptic and walks away.`,
      `${c.name.split(" ")[0]} types, deletes, then types again. you can feel the energy.`,
    ]);
  };
  // Fan posts and fan comments both pull from scenario-specific banks when
  // one exists, with fallback to the generic everyday-user banks.
  const fanScenarioBank = args.world ? scenarioFanPostBanks[args.world.id] : undefined;
  const fanLineBank = fanScenarioBank ?? offlineFanPostBank;
  const fanCommentScenarioBank = args.world ? scenarioFanCommentBank[args.world.id] : undefined;
  const fanCommentLineBank = fanCommentScenarioBank ?? offlineFanComments;
  // 1. Celebs — each gets a 60% chance to post. NO upper limit (lets the
  //    whole cast appear when the dice favor them).
  const celebPosts = args.characters
    .filter(() => Math.random() < 0.6)
    .map((c) => ({
      characterId: c.id,
      text: pickLineFor(c),
      threadReplies: buildOfflineThreadReplies(fanIds, fanCommentLineBank),
    }));
  // 2. Fans — ALWAYS exactly 4 unique fan posts (per user requirement
  //    "bezwarunkowo i bezwyjątkowo"). Dedup by author and text. Pulls
  //    from scenario-specific fan bank when available; their thread replies
  //    pull from the scenario-specific COMMENT bank.
  const usedFanAuthors = new Set<string>();
  const usedFanLines = new Set<string>();
  const fanPosts: WorldUpdate["posts"] = [];
  for (let i = 0; i < 4; i++) {
    fanPosts.push(buildOneFanPost(usedFanAuthors, usedFanLines, fanLineBank, fanCommentLineBank));
  }
  // 3. Shuffle the combined list — interleaves celeb and fan posts naturally
  //    instead of stacking them in two blocks.
  const posts = [...celebPosts, ...fanPosts].sort(() => Math.random() - 0.5);
  // For the offline relationship shifts we still want SOME celebs to react.
  // Take up to 2 random celebs from the cast (regardless of whether they
  // posted) so the toast has relationship cards to render.
  const relSample = [...args.characters]
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(2, args.characters.length));
  // Pithy slogans for the offline world-update toast caption.
  const offlineWorldSummaries = [
    "Quiet hour. Loud receipts.",
    "Timeline tilted in your direction.",
    "Small move, big reverb.",
    "Tabloid math says: net positive.",
    "Discourse drifted your way today.",
    "The room recalibrated around you.",
  ];
  const summary =
    offlineWorldSummaries[Math.floor(Math.random() * offlineWorldSummaries.length)];
  const reasons = [
    `Mentioned your name and the room shifted.`,
    `Liked one thing you said, ignored two others.`,
    `Reposted you to their inner circle.`,
    `Didn't love the angle of your last move.`,
    `Quietly recalibrated their feelings about you.`,
  ];
  const relationshipShifts = relSample.map((c, i) => ({
    characterId: c.id,
    delta: [1.2, -0.7, 0.4][i % 3],
    reason: pickRandom(reasons),
  }));
  return {
    summary,
    relationshipShifts,
    posts,
    notifications: [],
    // Round 1.11 — decimal scale -2..2 with ONE decimal. Slight positive
    // bias so refresh consistently feels rewarding offline.
    playerStatChanges: {
      humor: Math.round((Math.random() * 1.3 - 0.2) * 10) / 10, // -0.2..1.1
      aura: Math.round((Math.random() * 1.2 - 0.2) * 10) / 10,   // -0.2..1.0
    },
  };
}

export async function generateWorldUpdate(args: {
  player: PlayerProfile;
  world: World;
  day: number;
  characters: Character[];
  contacts: Record<string, { vibe: number; chemistryLabel: string }>;
  recentPlayerActions: string[];
}): Promise<WorldUpdate> {
  // No API key configured — go straight to rich offline content.
  if (!args.player.apiKey.trim()) {
    return buildOfflineWorldUpdate(args);
  }

  const charList = args.characters
    .map((c) => `${c.id}: ${c.name} (${c.handle}) — ${c.bio}`)
    .join("\n");
  const contactList = Object.entries(args.contacts)
    .map(([id, c]) => `${id}: vibe ${Math.round(c.vibe)}%, label "${c.chemistryLabel}"`)
    .join("\n");

  const system = `You are the world-tick narrator for a social media celebrity simulator.
Scenario: ${args.world.title}. ${args.world.setting ?? args.world.description}.
Day ${args.day}.
Player: ${args.player.name} (${args.player.handle}).
Characters available:
${charList}
Current relationships (each row's "label" is the chemistry — adjust tone accordingly: rivals = passive-aggressive, lovers = warm with stakes, enemies = openly cold, co-conspirators = secretive cooperation, etc.):
${contactList}

ANONYMOUS FAN ACCOUNTS that can ALSO POST (not only comment) — use these exact ids:
${anonymousFanIds.join(", ")}

FEED DENSITY ALGORITHM (Round 1.11.6) — STRICT:
1. Each celebrity in the cast above gets ROUGHLY a 60% chance to publish a post this beat. So if there are 8 cast members, return ~5 celebrity posts (range 3-6). Pick which ones organically based on what would realistically react to the player's recent activity / chemistry. NEVER all of them, NEVER fewer than ~half.
2. INCLUDE EXACTLY 4 ANONYMOUS FAN POSTS in the "posts" array — UNCONDITIONALLY. Pick 4 different fan IDs from the pool above. Each fan post is a standalone everyday-user thought (observation, joke, take, quote-tweet-style commentary) — NEVER celebrity-polished. Tone: like normal people refreshing X at 3am. Do not duplicate fan IDs across the 4 posts.
3. RESULTING POSTS ARRAY: total of ~7-9 entries (celebs + 4 fans). Order them ORGANICALLY MIXED — fans interleaved with celebs, NOT stacked at the bottom.

Return STRICT JSON only, no commentary:
{
  "summary": "<6-10 word pithy slogan summarising the day's shift — e.g. 'Quiet hour. Loud receipts.' or 'Mystery verse = instant cult following'>",
  "relationshipShifts": [
    { "characterId": "<id>", "delta": <decimal -3.0..3.0 with ONE decimal e.g. 1.2 or -0.7>, "reason": "<one-sentence reason referencing player's recent activity — also used as the rationale text in the post-event card>" }
  ],
  "posts": [
    {
      "characterId": "<id>",
      "text": "<in-character 1-2 sentence feed post, optionally @mentioning the player>",
      "threadReplies": [
        { "characterId": "<fan or celebrity id>", "text": "<short 1-sentence reaction>" }
      ]
    }
  ],
  "notifications": [
    { "charactersInvolved": ["<id>", "<id>"], "headline": "<X, Y and Z replied to you on...>", "preview": "<short quote from one of them>" }
  ],
  "playerStatChanges": { "humor": <decimal -2.0..2.0 with ONE decimal e.g. 0.9>, "aura": <decimal -2.0..2.0 with ONE decimal e.g. 1.1> }
}
Generate 2-4 relationshipShifts, 2-3 posts, 1-2 notifications, and (for each post) 5-12 threadReplies from a mix of fans and other characters. Be specific about WHY relationships moved. playerStatChanges represents how the day's vibe shifted the player's Humor/Aura standing — small decimal numbers (e.g. 0.8, -0.3), ONE decimal precision.`;

  const userMsg = `Recent player actions:\n${args.recentPlayerActions.slice(-8).join("\n") || "(nothing notable yet)"}`;

  try {
    const text = await runLLM(args.player, {
      system,
      messages: [{ role: "user", content: userMsg }],
      maxTokens: 900,
      temperature: 0.85,
      jsonResponse: true,
    });
    const parsed = safeParseJSON(text);
    if (parsed) {
      // Round 1.11.6 — defense-in-depth on fan distribution. AI may ignore
      // "EXACTLY 4 fan posts" rule (Gemini in particular). Count fan posts
      // in the response; if < 4, top up with offline fan posts so the feed
      // always lands on the contractual ~7-9 density. If > 4, trim back.
      const rawPosts = (parsed.posts as WorldUpdate["posts"]) ?? [];
      const fanIdSet = new Set(anonymousFanIds);
      const celebPosts = rawPosts.filter((p) => !fanIdSet.has(p.characterId));
      const fanPostsFromAI = rawPosts.filter((p) => fanIdSet.has(p.characterId));
      const usedFanAuthors = new Set<string>(
        fanPostsFromAI.map((p) => p.characterId),
      );
      const usedFanLines = new Set<string>(fanPostsFromAI.map((p) => p.text));
      const paddedFans: WorldUpdate["posts"] = [...fanPostsFromAI];
      // Round 1.11.15 — scenario-aware fan-post and fan-comment banks for
      // online padding too. Without this, fan posts force-injected when AI
      // returned <4 would be off-topic (e.g. espresso talk in Bridgerton).
      const padFanLineBank =
        scenarioFanPostBanks[args.world.id] ?? offlineFanPostBank;
      const padFanCommentBank =
        scenarioFanCommentBank[args.world.id] ?? offlineFanComments;
      while (paddedFans.length < 4) {
        paddedFans.push(
          buildOneFanPost(usedFanAuthors, usedFanLines, padFanLineBank, padFanCommentBank),
        );
      }
      if (paddedFans.length > 4) paddedFans.length = 4;
      // Shuffle combined so fans interleave with celebs.
      const finalPosts = [...celebPosts, ...paddedFans].sort(() => Math.random() - 0.5);
      return {
        summary: typeof parsed.summary === "string" ? (parsed.summary as string) : undefined,
        relationshipShifts:
          (parsed.relationshipShifts as WorldUpdate["relationshipShifts"]) ?? [],
        posts: finalPosts,
        notifications:
          (parsed.notifications as WorldUpdate["notifications"]) ?? [],
        playerStatChanges: parsed.playerStatChanges as WorldUpdate["playerStatChanges"],
      };
    }
    console.warn(
      "[ai] generateWorldUpdate: JSON parse returned null. Falling back to offline content. Raw head:",
      text.slice(0, 200),
    );
  } catch (err) {
    // Network 503 / 429 / 401, fetch timeout, etc. All recoverable — the
    // player still gets a populated feed via the offline path.
    console.warn("[ai] generateWorldUpdate failed, falling back to offline content:", err);
  }

  // Outage-proof: any failure above lands here. Same rich content the no-key
  // path uses, so the feed never returns empty arrays.
  return buildOfflineWorldUpdate(args);
}

// ---------------- Post replies ----------------

export type PostRepliesResult = {
  replies: Array<{ characterId: string; text: string }>;
  relationshipShifts: Array<{ characterId: string; delta: number; reason: string }>;
  metrics?: { likeBoost?: number; repostBoost?: string };
  playerStatChanges?: { humor?: number; aura?: number };
};

// Per-character offline reaction bank — varied enough that the same celebrity won't repeat.
const offlineReplyBank: Record<string, string[]> = {
  sabrina: [
    "wait this is actually so unhinged i'm forwarding it to my group chat",
    "the way you said this with your whole chest 😭✨",
    "i would commit a small crime for this caption energy",
    "ok but the meter on this is unmatched",
    "filing this under 'things i wish i'd posted first'",
  ],
  speed: [
    "THIS IS A CULTURAL RESET!!!! WE ARE WAKING UP!!!!",
    "BROOOO HOW DID YOU JUST DROP THIS WITHOUT WARNING",
    "I'M LITERALLY SCREAMING WHY IS NOBODY TALKING ABOUT THIS",
    "OK THE GOAT BEHAVIOR TONIGHT IS INSANE",
    "EVERYONE SHUT UP AND READ THIS POST AGAIN!!!",
  ],
  billie: [
    "i feel like this is going to be in a doc about you one day",
    "oh okay so we're doing this today",
    "this hit at exactly the wrong time and i love it",
    "the silence after this post is doing numbers",
    "weirdly soft. mean it.",
  ],
  drake: [
    "careful with the cadence on that one — they'll quote it back to you",
    "feels like the start of a whole era",
    "this is the kind of energy the city responds to",
    "ovo sound just took notes",
    "you said the quiet part out loud and made it loud",
  ],
  taylor: [
    "this is the kind of line that ends up on someone's wall",
    "very specific. very intentional. i see it.",
    "the bridge would have been brutal here. respect.",
    "you said it without saying it. iconic.",
    "this is one we revisit in the deluxe, isn't it",
  ],
  kanye: [
    "THE FREQUENCY IS SHIFTING. I CAN HEAR IT.",
    "ANNOUNCE THE EXHIBITION NEXT. THIS IS A MOVEMENT.",
    "ARCHITECTURE. SOUND. COLOR. ALL ONE THING.",
    "DON'T DILUTE THIS WITH A FOLLOWUP. LET IT BREATHE.",
    "I'M PRINTING THIS ON A WALL.",
  ],
  beyonce: [
    "mm. understood.",
    "the precision in this. respect.",
    "slow and intentional — always.",
    "the work decides. it just did.",
    "noted, quietly. proud.",
  ],
  tyler: [
    "weird color choice for the energy. i like it.",
    "we're doing this now? okay.",
    "this is a season 2 character development moment",
    "if i don't sample this in a year i quit",
    "you used the wrong font on purpose and i KNOW it",
  ],
  ariana: [
    "lol who said you could just say that on a tuesday",
    "okay yeah this is fine i'll allow it",
    "the studio mic was crying by the third take honestly",
    "yk fine, you have my full attention now",
    "girl. respectfully. WHAT",
  ],
  "the-weeknd": [
    "after hours material.",
    "exactly the kind of move you can't take back.",
    "the city sounds different when you post like this",
    "studio's gonna feel this one",
    "no notes. only respect.",
  ],
};

const offlineFanReplyBank = [
  "screaming. SCREAMING. why is this so good",
  "delete this i was not emotionally prepared",
  "ok but the typography of this caption deserves a study",
  "you said one sentence and shifted the timeline. fine.",
  "the way i ran to the comments. archeology will study this",
  "this is the kind of post that gets put on a t-shirt",
  "i'm normal. i'm normal. i'm not normal.",
  "TELL ME WHO HURT YOU SO I CAN SEND THEM A FRUIT BASKET",
  "imagine being this unbothered in public. couldn't be me",
  "this caption + my therapy bill = balanced check",
  "ok but the @ tag is THE move and you know it",
  "why did this make me cry in the cereal aisle",
  "alexa play 'i told you so' by literally everyone",
  "you cannot just drop this and disappear. RUDE.",
  "the way i ALMOST emailed my boss before reading this",
  "this is the kind of vibe i wear to interviews",
  "anyway, follow back queen ✨",
  "this radicalized me toward joy",
  "okay BRO. okay. we see you.",
  "frantic checking if i missed context. i didn't. it's just THAT.",
];

// Round 1.11.15 — scenario-flavored fan REPLY banks (different from fan POST
// banks). Used inside buildOfflinePostReplies under player posts in offline
// mode so bots don't quote about espresso when we're playing Bridgerton.
// Falls back to the default offlineFanReplyBank when the active world has
// no scenario entry (custom worlds, accidentally-famous).
const scenarioFanReplyBank: Record<string, string[]> = {
  "regency-feed": [
    "screaming into my fan. SCREAMING. why is this so good",
    "delete this scroll i was not emotionally prepared",
    "ok but the calligraphy of this missive deserves a study",
    "you wrote one sentence and shifted the ton. fine.",
    "the way i ran to whistledown. archaeology will study this",
    "this is the kind of letter that gets framed above the mantle",
    "i'm composed. i'm composed. i'm not composed.",
    "TELL ME WHICH LADY HURT YOU SO I CAN SEND THEM A BASKET",
    "imagine being this unbothered at a ball. couldn't be me",
    "this missive radicalized me toward romance",
    "ok but the @ tag in this letter is THE move and you know it",
    "okay LORD. okay. we see you in the box seats.",
    "frantic checking if i missed a whistledown drop. i didn't. it's just THAT.",
  ],
  "academy-chaos": [
    "screaming in the common room. SCREAMING. why is this hex so good",
    "delete this scroll i was not magically prepared",
    "ok but the rune-work on this caption deserves a NEWT-level study",
    "you cast one charm and shifted the house cup. fine.",
    "the way i ran to the divination tower. astronomy will study this",
    "this is the kind of post that gets pinned on the great hall wall",
    "i'm sane. i'm sane. i'm being controlled by an enchanted parchment.",
    "TELL ME WHICH PROFESSOR HURT YOU SO I CAN HEX THEM",
    "imagine being this unbothered during finals. couldn't be me",
    "this radicalized me toward illegal potions",
    "okay PROFESSOR. okay. we see you in the corridor.",
    "frantic checking if i missed a hex in herbology. i didn't. it's just THAT.",
  ],
};

function pickRandomReply<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Rich offline post-replies generator. Same role as buildOfflineWorldUpdate —
// the rescue path that fires both when there's no API key AND when the online
// Gemini/OpenAI/Anthropic call fails (503 outage, timeout, parse failure).
// ALWAYS returns a populated result (celebrity replies + anonymous fan replies)
// — never null. The anonymous fan IDs come from anonymousFanIds and are
// rendered by the UI via resolveCharacter (which knows about the fan pool).
function buildOfflinePostReplies(args: {
  postText: string;
  characters: Character[];
  // Round 1.11.15 — optional world for scenario-aware fan reply voice.
  world?: World;
}): PostRepliesResult {
  // Round 1.11.15 — empty cast is NO LONGER a failure case. Fans always
  // reply even when the player hasn't added any celebrity to their contacts.
  // The feed should never look dead on Day 1.
  const shuffled = [...args.characters].sort(() => Math.random() - 0.5);
  // Match the online prompt: only 2-3 celebrities ever reply, not the whole cast.
  const celebCount = 2 + Math.floor(Math.random() * 2); // 2 or 3
  const celebrities = shuffled.slice(0, Math.min(celebCount, shuffled.length));
  const fanCount = 4 + Math.floor(Math.random() * 6); // 4-9 fans
  const fanIds = anonymousFanIds;
  // Scenario-aware fan reply bank — falls back to generic offlineFanReplyBank
  // when the active world has no scenario entry.
  const fanReplyLineBank =
    (args.world && scenarioFanReplyBank[args.world.id]) ?? offlineFanReplyBank;
  const usedFanLines = new Set<string>();
  const fans: Array<{ characterId: string; text: string }> = [];
  for (let i = 0; i < fanCount; i++) {
    let text = pickRandomReply(fanReplyLineBank);
    let attempts = 0;
    while (usedFanLines.has(text) && attempts < 5) {
      text = pickRandomReply(fanReplyLineBank);
      attempts++;
    }
    usedFanLines.add(text);
    fans.push({ characterId: pickRandomReply(fanIds), text });
  }
  const celebReplies = celebrities.map((c) => ({
    characterId: c.id,
    text: offlineReplyBank[c.id]
      ? pickRandomReply(offlineReplyBank[c.id])
      : c.starterPosts?.[Math.floor(Math.random() * (c.starterPosts.length || 1))] ?? c.bio,
  }));
  return {
    replies: [...celebReplies, ...fans],
    relationshipShifts: celebrities.map((c, i) => ({
      characterId: c.id,
      delta: i % 2 === 0 ? 1.2 + Math.random() : -0.3 - Math.random() * 0.6,
      reason:
        i % 2 === 0
          ? `Liked the angle of "${args.postText.slice(0, 30)}..."`
          : `Wasn't sold on "${args.postText.slice(0, 30)}..."`,
    })),
    metrics: {
      likeBoost: Math.floor(800 + Math.random() * 4000),
      repostBoost: `${(2 + Math.random() * 30).toFixed(1)}K`,
    },
    // Round 1.11 — decimal scale, ONE decimal precision. Slight positive bias
    // so the player feels progress from offline fallback content too.
    playerStatChanges: {
      humor: Math.round((Math.random() * 1.4 - 0.2) * 10) / 10, // -0.2..1.2
      aura: Math.round((Math.random() * 1.2 - 0.2) * 10) / 10,   // -0.2..1.0
    },
  };
}

export async function generatePostReplies(args: {
  player: PlayerProfile;
  world: World;
  postText: string;
  characters: Character[];
  contacts: Record<string, { vibe: number; chemistryLabel: string }>;
  replyMode?: boolean;
  originalAuthor?: string;
  contextReplyText?: string;
}): Promise<PostRepliesResult | null> {
  // Round 1.11.15 — no API key OR empty cast → offline fallback. Empty cast
  // no longer returns null; buildOfflinePostReplies produces fan-only replies
  // so the feed stays alive even on Day 1 before the player has added celebs.
  if (!args.player.apiKey.trim() || args.characters.length === 0) {
    return buildOfflinePostReplies(args);
  }

  const charList = args.characters
    .map((c) => `${c.id}: ${c.name} (${c.handle}) — ${c.bio}`)
    .join("\n");
  const contactList = Object.entries(args.contacts)
    .map(([id, c]) => `${id}: vibe ${Math.round(c.vibe)}%, label "${c.chemistryLabel}"`)
    .join("\n");

  const system = `You are running the comment section of a social-media celebrity simulator that should feel like a real X (Twitter) reply thread.
Scenario: ${args.world.title}. ${args.world.setting ?? ""}.
Player: ${args.player.name} (${args.player.handle}).
${args.replyMode ? `Player is REPLYING to a post${args.originalAuthor ? ` by ${args.originalAuthor}` : ""}${args.contextReplyText ? `. Their reply text: "${args.contextReplyText}"` : ""}.` : "Player just PUBLISHED a new post."}

CELEBRITY CHARACTERS available (use these exact ids):
${charList}

CURRENT RELATIONSHIPS (each row's "label" is chemistry — rivals = passive-aggressive, lovers = warm with stakes, enemies = openly cold, co-conspirators = secretive cooperation, friends = casual warmth, spicy = flirty charged tension):
${contactList}

ANONYMOUS FAN / STAN ACCOUNTS available (use these exact ids):
${anonymousFanIds.join(", ")}

THE POST YOU ARE REACTING TO:
"""
${args.postText}
"""

Generate 5-8 distinct replies total. Mix of:
- ONLY 2 OR 3 of the listed CELEBRITY characters reply (NOT all of them). Pick the 2-3 who would realistically care about THIS specific post — based on their chemistry, beef, current vibe, and whether the post mentions or touches their world. The rest stay silent. NEVER include every celebrity. Silence from the others is more realistic than a wall of cameos.
- 3-5 from the ANONYMOUS FAN ACCOUNTS (use their ids from the pool above — fans drive the bulk of comment volume).
EVERY reply must directly address or react to the content of the post above — quote it, riff on it, complain about it, hype it, mock it. No generic "great post" — make each one obviously about THIS post.
Fan accounts can be hype/critique/jokes; celebrity replies should sound like the named character.

Return STRICT JSON only, no commentary:
{
  "replies": [{ "characterId": "<id>", "text": "<short reply, 1-2 sentences>" }],
  "relationshipShifts": [{ "characterId": "<celebrity id only>", "delta": <-3..3>, "reason": "<one specific sentence referencing the post>" }],
  "metrics": { "likeBoost": <0..50000>, "repostBoost": "<e.g. 12.4K>" },
  "playerStatChanges": { "humor": <decimal -2.0..2.0 with ONE decimal e.g. 0.8>, "aura": <decimal -2.0..2.0 with ONE decimal e.g. 1.1> }
}
playerStatChanges represents how this post lands for the player's Humor / Aura standing — small decimal numbers, mostly 0–1 either direction. ONE decimal precision (e.g. 0.5, 1.2, -0.4).`;

  try {
    const text = await runLLM(args.player, {
      system,
      messages: [{ role: "user", content: args.postText }],
      maxTokens: 900,
      temperature: 0.95,
      jsonResponse: true,
    });
    const parsed = safeParseJSON(text);
    if (parsed) {
      return {
        replies: (parsed.replies as PostRepliesResult["replies"]) ?? [],
        relationshipShifts:
          (parsed.relationshipShifts as PostRepliesResult["relationshipShifts"]) ?? [],
        metrics: parsed.metrics as PostRepliesResult["metrics"],
        playerStatChanges: parsed.playerStatChanges as PostRepliesResult["playerStatChanges"],
      };
    }
    console.warn(
      "[ai] generatePostReplies: JSON parse returned null. Falling back to offline content. Raw head:",
      text.slice(0, 200),
    );
  } catch (err) {
    // Outage-proof: 503 / 429 / timeout / 401 / parse fail all route here.
    // The player STILL gets a chunky reply thread (2-3 celebs + 4-9 fans)
    // from the offline bank, so the post never sits with phantom counts.
    console.warn("[ai] generatePostReplies failed, falling back to offline content:", err);
  }
  // Outage-proof rescue — same rich content path as the no-key branch.
  return buildOfflinePostReplies(args);
}

// ---------------- Compose suggestions ----------------

export async function generateComposeSuggestions(args: {
  player: PlayerProfile;
  world: World;
  kind: "post" | "event";
  context: string;
  characters: Character[];
}): Promise<string[]> {
  if (!args.player.apiKey.trim()) {
    if (args.kind === "event") {
      return [
        "Give a humble few-word acknowledgment and leave.",
        "Prepare a formal, high-concept speech on the topic.",
        "Walk in late, say one cryptic word, and walk back out.",
      ];
    }
    return [
      "i let one label exec talk for forty minutes about ai before i realized he forgot the mic",
      "@kanyewest the font is actually fine and you should probably take a nap",
      "if you make it to the studio before midnight your taste is suspect",
    ];
  }
  const charNames = args.characters
    .slice(0, 6)
    .map((c) => `${c.name} (${c.handle})`)
    .join(", ");
  const system =
    args.kind === "event"
      ? `Suggest 3 short, distinct in-character actions the player could take in response to this event.
Scenario: ${args.world.title}. Player: ${args.player.name} (${args.player.handle}).
Return STRICT JSON: {"suggestions": ["<10-15 word action>", ...]}`
      : `Suggest 3 short, sharp, on-brand posts the player could publish next.
Scenario: ${args.world.title}. Player: ${args.player.name} (${args.player.handle}).
Available characters they could @mention: ${charNames}.
Return STRICT JSON: {"suggestions": ["<one tweet-style post>", ...]}`;

  try {
    const text = await runLLM(args.player, {
      system,
      messages: [{ role: "user", content: args.context || "(empty)" }],
      maxTokens: 400,
      temperature: 0.95,
      jsonResponse: true,
    });
    const parsed = safeParseJSON(text);
    const suggestions = (parsed?.suggestions as string[]) ?? [];
    if (Array.isArray(suggestions) && suggestions.length > 0) {
      return suggestions.slice(0, 4);
    }
  } catch {
    /* fall through */
  }
  return [];
}

// ---------------- Activity outcome ----------------

export type ActivityOutcomeResult = {
  outcomeText: string;
  responses: Array<{ characterId: string; accepted: boolean; message: string }>;
};

export async function generateActivityOutcome(args: {
  player: PlayerProfile;
  world: World;
  activity: { title: string; description: string; scheduledDay: number };
  invitees: Character[];
  contacts: Record<string, { vibe: number; chemistryLabel: string }>;
}): Promise<ActivityOutcomeResult | null> {
  if (!args.player.apiKey.trim()) {
    return {
      outcomeText: `Your "${args.activity.title}" lands as expected — a couple of yeses, one polite no, and a story everyone will retell differently.`,
      responses: args.invitees.map((c, i) => ({
        characterId: c.id,
        accepted: i % 3 !== 1,
        message:
          i % 3 === 1
            ? "have to take a rain check, but next time"
            : "yes please, this sounds perfect",
      })),
    };
  }
  const list = args.invitees
    .map((c) => {
      const ch = args.contacts[c.id];
      const chemHint = ch ? ` [vibe ${Math.round(ch.vibe)}%, label "${ch.chemistryLabel}"]` : "";
      return `${c.id}: ${c.name} (${c.handle}) — ${c.bio}${chemHint}`;
    })
    .join("\n");
  const system = `You are the activity-outcome writer for a celebrity social sim.
Scenario: ${args.world.title}. ${args.world.setting ?? ""}.
Player: ${args.player.name} (${args.player.handle}).
Activity: "${args.activity.title}" scheduled for Day ${args.activity.scheduledDay}.
Description: ${args.activity.description}
Invitees (use their chemistry label to decide acceptance and tone — rivals = passive-aggressive, lovers = warm with stakes, enemies = openly cold, co-conspirators = secretive cooperation):
${list}

Return STRICT JSON only:
{
  "outcomeText": "<2-3 sentence in-world recap of what happened at the activity>",
  "responses": [
    { "characterId": "<id>", "accepted": <true|false>, "message": "<in-character short message>" }
  ]
}`;

  try {
    const text = await runLLM(args.player, {
      system,
      messages: [{ role: "user", content: "Outcome please." }],
      maxTokens: 700,
      temperature: 0.9,
      jsonResponse: true,
    });
    const parsed = safeParseJSON(text);
    if (parsed && typeof parsed.outcomeText === "string") {
      return {
        outcomeText: parsed.outcomeText,
        responses: (parsed.responses as ActivityOutcomeResult["responses"]) ?? [],
      };
    }
  } catch {
    /* fall through */
  }
  return null;
}

// ---------------- Scenario generator ----------------

export type GeneratedScenario = {
  title: string;
  category: string;
  description: string;
  setting: string;
  mainGoalTitle: string;
  mainGoalDescription: string;
  audience: string;
  suggestedCharacterIds: string[];
};

export async function generateScenario(args: {
  player: PlayerProfile;
  prompt: string;
  catalog: Character[];
}): Promise<GeneratedScenario | null> {
  if (!args.player.apiKey.trim()) {
    return null;
  }

  const catalog = args.catalog
    .map((c) => `${c.id}: ${c.name} (${c.bio})`)
    .join("\n");
  const system = `You are designing a scenario for the celebrity social-sim "Status".
Available characters to cast (use their ids):
${catalog}
Return STRICT JSON only:
{
  "title": "<short evocative scenario title>",
  "category": "<one or two word category>",
  "description": "<one-sentence pitch>",
  "setting": "<2-3 sentence world setting>",
  "mainGoalTitle": "<imperative goal title>",
  "mainGoalDescription": "<1-2 sentence main goal description>",
  "audience": "<fake follower count like 195.0K>",
  "suggestedCharacterIds": ["<id>", "<id>", "<id>", "<id>"]
}`;

  try {
    const text = await runLLM(args.player, {
      system,
      messages: [{ role: "user", content: args.prompt }],
      maxTokens: 500,
      temperature: 0.95,
      jsonResponse: true,
    });
    const parsed = safeParseJSON(text);
    if (parsed && typeof parsed.title === "string") {
      return {
        title: parsed.title as string,
        category: (parsed.category as string) ?? "Drama",
        description: (parsed.description as string) ?? "",
        setting: (parsed.setting as string) ?? "",
        mainGoalTitle: (parsed.mainGoalTitle as string) ?? "Win the season",
        mainGoalDescription: (parsed.mainGoalDescription as string) ?? "",
        audience: (parsed.audience as string) ?? "120K",
        suggestedCharacterIds:
          (parsed.suggestedCharacterIds as string[]) ?? [],
      };
    }
  } catch {
    /* fall through */
  }
  return null;
}
