export type Provider = "openai" | "anthropic" | "gemini";

// Round 1.11.32 Faza F — moved from ai.ts so GameState can hold a
// pre-fetched event without creating a circular import (ai.ts imports
// from types.ts; the inverse would break the dependency graph).
// Structurally identical to the old definition; ai.ts now re-imports.
export type EventOutcome = {
  eventTitle: string;
  eventBody: string;
  choices: string[];
};

// Round 1.11.32 Faza C — image source widening. The migration to local
// bundled assets means avatar / banner fields now hold one of TWO shapes:
//   * `number` — the opaque handle returned by Metro's `require()` for
//     a static asset (e.g. require("../../assets/images/characters/sabrina_carpenter.webp"))
//   * `string` — a remote URI used for player-uploaded photos (expo-image-picker
//     returns a file:// URI), AI-generated overrides, and any legacy save
//     entries that haven't migrated yet.
// The `imageSource(s)` helper in primitives.tsx normalises both into the
// shape expo-image's <Image source={...} /> expects.
export type AvatarSource = string | number;

// Round 1.11.32 Faza D — Stan Wars & Cancel Culture
//
// `crisisLevel` (0-100) drives a coupled set of mechanics:
//   * 0   = no crisis, normal game flow
//   * >0  = AI prompts pick up the "current crisis" block
//   * >20 = crisis context starts shipping inside generateSinglePost
//   * >40 = applyPostReplies activates emergent fan defense (high-vibe
//          fans write DEFENSIVE replies with +2.5× likes mult)
//   * 100 = "blackout" — all player posts are essentially invisible
//          (-90% follower gain) until a successful PR action drops level
//
// Crisis origin lets the UI explain why the player is on fire and
// thread the cause into PR Stunt prompts.
export type CrisisOrigin =
  | { kind: "relationship-drop"; characterId: string; vibe: number }
  | { kind: "event-misstep"; eventTitle: string; choice: string }
  | { kind: "ai-toxicity"; reason: string };

// Three player-driven exits from a crisis. PR Stunt drops level for a
// stat cost. Laying Low passively decays the meter faster but throttles
// follower growth. Divert sacrifices another celeb's vibe for a massive
// crisis dump + a priority Pop Craze post on the feed.
export type CrisisAction = "pr-stunt" | "laying-low" | "divert";

// Single PR move on offer in the PRActionsModal. Drawn from AI when the
// network's healthy, falls back to an offline bank when it's not.
export type PRStuntOption = {
  id: string;
  title: string;
  description: string;
  humorCost: number; // 0..3, decimal
  auraCost: number;  // 0..3, decimal
  effect: number;    // crisis-level points removed, 15..50
};

export type GamePhase =
  | "landing"
  | "hub"
  | "details"
  | "setup"
  | "game"
  | "scenarioBuilder";

export type GameTab = "feed" | "goals" | "messages" | "alerts" | "profile";

export type SkillKey = "bravery" | "mystery" | "wit";

export type ChemistryType =
  | "friends"
  | "rivals"
  | "spicy"
  | "lovers"
  | "enemies"
  | "co-conspirators";

export type Character = {
  id: string;
  name: string;
  handle: string;
  avatar: AvatarSource;
  banner: AvatarSource;
  bio: string;
  description?: string;
  followers: number;
  verified?: boolean;
  proactive?: boolean;
  systemPrompt: string;
  starterPosts?: string[];
};

export type Outlet = {
  id: string;
  name: string;
  handle: string;
  avatar: AvatarSource;
  verified?: boolean;
};

export type WorldDifficulty = "easy" | "normal" | "hard";

export type World = {
  id: string;
  title: string;
  category: string;
  categoryColor?: string;
  image: string;
  description: string;
  audience: string;
  characters: string[];
  mainGoal: {
    title: string;
    description: string;
  };
  setting?: string;
  custom?: boolean;
};

export type FeedPost = {
  id: string;
  authorId: string;
  text: string;
  replies: number;
  reposts: string;
  likes: number;
  liked?: boolean;
  reposted?: boolean;
  starred?: boolean;
  playerPost?: boolean;
  dayLabel?: string;
  imageUrl?: string;
  threadReplies: ThreadReply[];
  views?: string;
  createdAt: string;
  day: number;
};

export type ThreadReply = {
  id: string;
  authorId: string; // "player" or characterId
  text: string;
  likes: number;
  liked?: boolean;
  createdAt: string;
  parentReplyId?: string;
};

export type PendingAction =
  | { id: string; kind: "post-replies"; payload: { postId: string; contextReplyId?: string } }
  | { id: string; kind: "event-aftermath"; payload: { eventChoice: string } }
  | { id: string; kind: "activity-aftermath"; payload: { activityId: string } }
  | { id: string; kind: "daily-tick"; payload: Record<string, never> };

export type ChatMessage = {
  id: string;
  sender: "player" | "character";
  text: string;
  createdAt: string;
};

export type Mood = {
  label: string;
  reason: string;
  delta: number;
};

export type ContactState = {
  characterId: string;
  vibe: number;
  vibeReason: string;
  vibeDelta: number;
  chemistry: ChemistryType;
  chemistryLabel: string;
  movesRemaining: number;
  score: number;
  mood: Mood;
  messages: ChatMessage[];
  preview: string;
  unread?: boolean;
  proactive: boolean;
  currentFeeling: { headline: string; detail: string };
};

export type PlayerProfile = {
  name: string;
  handle: string;
  avatar: AvatarSource;
  banner: AvatarSource;
  bio: string;
  description: string;
  provider: Provider;
  apiKey: string;
  model: string;
  socialPresence: { humor: number; aura: number };
  followers: number;
};

export type Milestone = {
  id: string;
  title: string;
  requirements: Record<SkillKey, number>;
  applied: Record<SkillKey, number>;
  completed: boolean;
  xp: number;
  skipped?: boolean;
};

// Round 1.11.32 G-Fix #5 — side-quest conditions are now machine-checkable.
// Tagged-union covers the four kinds the launch milestones need:
//   "publish-posts"   — player has authored >= count posts
//   "trigger-events"  — player has completed >= count events (counted via
//                       activityLog entries of kind "event-created")
//   "max-vibe"        — at least one contact's vibe >= threshold
//   "follower-count"  — player.followers >= threshold
// The completeSideQuest reducer + GoalsScreen rendering both call
// evaluateQuestCondition(quest, state) to decide claimability and to
// surface progress ("2/3 posts"). Quests with no condition (legacy /
// flavor-only entries) stay tap-to-claim.
export type SideQuestCondition =
  | { kind: "publish-posts"; count: number }
  | { kind: "trigger-events"; count: number }
  | { kind: "max-vibe"; threshold: number }
  | { kind: "follower-count"; threshold: number };

export type SideQuest = {
  id: string;
  text: string;
  xp: number;
  completed?: boolean;
  condition?: SideQuestCondition;
};

export type ActivityKind =
  | "milestone-completed"
  | "milestone-skipped"
  | "event-created"
  | "post-published"
  | "post-reply"
  | "chat-sent"
  | "relationship-shift"
  | "side-quest"
  | "character-added"
  | "activity-created";

export type ActivityInvite = {
  id: string;
  title: string;
  description: string;
  inviteeIds: string[];
  scheduledDay: number;
  createdDay: number;
  outcome?: string;
  responses?: Array<{ characterId: string; accepted: boolean; message: string }>;
  resolved?: boolean;
};

export type ScoreChange = {
  label: string;
  delta: number;
  positive: boolean;
};

export type ActivityLogEntry = {
  id: string;
  kind: ActivityKind;
  title: string;
  outcome?: string;
  body?: string;
  createdAt: string;
  day: number;
  scoreChanges?: ScoreChange[];
  rating?: 1 | 2 | 3 | 4 | 5;
};

export type NotificationItem = {
  id: string;
  postId?: string;
  characterId?: string;
  charactersInvolved: string[];
  headline: string;
  preview: string;
  createdAt: string;
  read?: boolean;
  // Round 1.11 D — kind controls the avatar overlay icon in AlertsScreen.
  // "post-reply" → no overlay (default), uses first character's avatar.
  // "activity-invite" / "activity-response" → calendar overlay icon.
  // "event-mention" → party-popper overlay icon.
  kind?: "post-reply" | "activity-invite" | "activity-response" | "event-mention";
};

export type WorldUpdateToast = {
  id: string;
  characterId?: string;
  headline: string;
  body: string;
  // Optional follower delta — when > 0, the toast renders a chunky
  // "Followers +N" pill (matches original Status post-event UI).
  followerDelta?: number;
  // Optional XP delta — when > 0, sparkles pill at the top of the toast.
  xpDelta?: number;
  // Pithy 6-10 word slogan summarising the outcome (e.g. "Mystery verse =
  // instant cult following"). Populated by AI; used as body in the collapsed
  // toast view and as a caption in the expanded panel. Full `body` text is
  // kept for the Activity Log entry.
  summary?: string;
  // Decimal-precision player-stat deltas, -2..2 range, .toFixed(1) at render.
  humorDelta?: number;
  auraDelta?: number;
  // Rich relationship changes for the expanded Score Changes panel:
  // each card shows avatar + handle + Δ% + CenteredBar at vibeAfter + rationale.
  relationshipChanges?: Array<{
    characterId: string;
    delta: number;       // percentage shift this beat (e.g. +3.7 or -0.5)
    rationale: string;   // "Ghostly verse trumps years of petty feuds"
    vibeAfter: number;   // -100..100 current vibe AFTER the shift
  }>;
  // Legacy compact arrays — still used by collapsed view emoji-arrow row when
  // the richer fields aren't populated. Kept for backward compatibility.
  presenceDeltas: Array<{ key: "humor" | "aura"; direction: "up" | "down" }>;
  relationshipDeltas: Array<{ characterId: string; direction: "up" | "down" }>;
};

export type GameState = {
  phase: GamePhase;
  activeTab: GameTab;
  selectedWorldId: string;
  initializedWorldIds: string[];
  player: PlayerProfile;
  day: number;
  level: number;
  xp: number;
  xpRequired: number;
  skillPoints: number;
  stats: Record<SkillKey, number>;
  mainGoalProgress: number;
  milestones: Milestone[];
  sideQuests: SideQuest[];
  posts: FeedPost[];
  contacts: Record<string, ContactState>;
  customCharacters: Character[];
  customWorlds: World[];
  difficulty: WorldDifficulty;
  notifications: NotificationItem[];
  activityLog: ActivityLogEntry[];
  activities: ActivityInvite[];
  pendingActions: PendingAction[];
  energy: number;        // 0..10 (base — refills +5 per new day)
  bonusEnergy: number;   // 0..10 (overflow bucket)
  isGenerating: boolean; // true while any AI call is in flight
  activeChatId: string | null; // deep-link target for the Messages tab
  characterOverrides: Record<
    string,
    { avatar?: AvatarSource; banner?: AvatarSource; name?: string; handle?: string; bio?: string; description?: string }
  >;
  // Persistent identity registry for fan/stan accounts that surface in
  // the feed or reply threads. When the AI hallucinates a new fan handle
  // (e.g. "@kanye_truther_4"), the reducer assigns it a stable avatar +
  // display name from the local pool and stores it here so the same ID
  // always renders consistently across days. Population happens at WRITE
  // time (applyPostReplies / applyWorldUpdate); resolveCharacter only
  // reads — it stays a pure function. Foundation for future Stan Wars
  // toxic-raid mechanics, where persistent fan identities matter.
  fanIdentityCache: Record<
    string,
    { avatar: AvatarSource; name: string; handle: string }
  >;
  editingCharacterId: string | null;
  eventOpen: boolean;
  composeOpen: boolean;
  characterProfileId: string | null;
  openPostId: string | null;
  editProfileOpen: boolean;
  customizeWorldOpen: boolean;
  activityLogOpen: boolean;
  appSettingsOpen: boolean;
  addCharacterOpen: boolean;
  createActivityOpen: boolean;
  hideDMsInLog: boolean;
  lastToast: WorldUpdateToast | null;

  // ===== Round 1.11.32 Faza B — Pre-fetching feed engine =====
  // Replaces the legacy batch generateWorldUpdate model with a streaming
  // one. Each day the engine builds a fixed pool of 11 potential authors
  // (6 celebs/outlets + 5 fan slots) and a background fetcher drains it
  // one post at a time. Pull-to-refresh consumes the local buffer and
  // re-arms the fetcher. See game-context.tsx → buildDailyAuthorPool +
  // background fetch useEffect for the full lifecycle.
  dailyAuthorPool: {
    // Concrete celeb/outlet IDs (consumed 1:1, removed on use).
    celebs: string[];
    // Numeric fan budget — each slot mints a fresh ad-hoc fan via
    // mintFanIdentities, so identities stay infinite while the daily
    // CAP stays finite. Drains to 0 only after celebs are exhausted.
    fanSlots: number;
  };
  // Local accumulating buffer of pre-fetched posts. Empties on every
  // pull-to-refresh (the entire buffer flushes into the feed at once).
  // No hard cap — keeps growing until dailyAuthorPool is fully drained,
  // simulating "phone in pocket" accumulation.
  pendingBackgroundPosts: FeedPost[];
  // Telemetry flag for the silent pre-fetch. Drives the FeedScreen
  // spinner when the player pulls and the buffer is empty (Opcja Y).
  // SEPARATE from `isGenerating`, which gates user-facing actions.
  isFetchingBackgroundPost: boolean;
  // Pithy summary of the most recent event (player choice + outcome).
  // Replaces pushing the whole activityLog into every single-post prompt
  // — saves ~80-150 tokens per call. Cleared on next event rollover.
  currentEventContext: string | null;
  // Exponential backoff state for background fetch failures. After 2
  // consecutive failures the WorldUpdateToast surfaces a "Network
  // hiccup" notice; backoff window grows 5s → 15s → 60s.
  lastBackgroundFetchError: { at: number; tries: number } | null;

  // ===== Round 1.11.32 Faza D — Stan Wars & Cancel Culture =====
  // 0..100. 0 = no crisis. completeEvent and applyPostReplies / the bg
  // fetcher can push it up; PR actions and natural decay push it down.
  crisisLevel: number;
  // Context that started the current crisis — populated when level
  // transitions 0→positive, cleared when it falls back to 0. Drives the
  // PR Stunt prompt and the CrisisBar tooltip.
  crisisOrigin: CrisisOrigin | null;
  // Day the crisis began. Used for narrative ("3 days into the storm").
  crisisStartedDay: number | null;
  // Toggle for "laying low" mode — when true, day-rollover decay
  // accelerates -8/day and post/event followerGain multiplies by 0.3.
  // Independent of crisis duration; player can toggle on/off freely.
  crisisLayingLow: boolean;
  // Rolling log of past PR moves (cap 20 entries via .slice(-20)).
  // Drives Divert cooldown (no spamming the same target every day) and
  // gives the AI prompt history when generating fresh stunt options.
  prHistory: Array<{
    day: number;
    action: CrisisAction;
    targetId?: string;
    effect: string;
  }>;

  // ===== Round 1.11.32 Faza F — Total Pre-fetching =====
  // The bg fetcher useEffect fills these whenever it has spare cycles
  // (post buffer already >= 3). triggerEvent / fetchSuggestions consume
  // them with 0ms latency when present; fall back to live AI when null.
  // completeEvent clears pendingNextEvent (event has fired) AND
  // pendingPostSuggestions (player's context just shifted, old
  // suggestions are stale). Both are intentionally OMITTED from the
  // FileSystem persistence snapshot — they're cheap to regenerate and
  // shouldn't survive cold start.
  pendingNextEvent: EventOutcome | null;
  pendingPostSuggestions: string[] | null;

  // ===== Round 1.11.32 G-Fix #3 — Author exhaustion queue =====
  // Rolling list of fan IDs that just commented or posted. Anyone in
  // this queue is skipped during fan-slot selection in the bg fetcher
  // and during reply generation in applyPostReplies, forcing the engine
  // to pull DIFFERENT fans from the 30-image pool every beat. Capped at
  // 10 entries via slice — older entries drop off the front so a
  // previously-active fan eventually rejoins the rotation. Skips the
  // person who would otherwise comment "all the time" (the user
  // explicitly reported @stannery_vessel doing this).
  recentCommenters: string[];
};
