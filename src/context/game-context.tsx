import * as Haptics from "expo-haptics";
// expo-file-system v19 split into a new Paths API; the legacy entry preserves the documentDirectory + read/write/delete helpers we rely on.
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

import {
  characters as catalogCharacters,
  outletCharacters,
  anonymousFans,
  anonymousFanIds,
  starterPosts,
  worlds as builtinWorlds,
  findAnyCharacter,
} from "@/data/worlds";
import {
  ActivityInvite,
  ActivityLogEntry,
  AvatarSource,
  Character,
  ChatMessage,
  ChemistryType,
  ContactState,
  CrisisAction,
  CrisisOrigin,
  FeedPost,
  GamePhase,
  GameState,
  GameTab,
  Milestone,
  NotificationItem,
  PlayerProfile,
  PRStuntOption,
  Provider,
  ScoreChange,
  SideQuest,
  SideQuestCondition,
  SkillKey,
  ThreadReply,
  World,
  WorldDifficulty,
  WorldUpdateToast,
} from "@/data/types";
import {
  EventOutcome,
  generateActivityOutcome,
  generateComposeSuggestions,
  generateEvent,
  generatePostReplies,
  generatePRStuntOptions,
  generateScenario,
  generateSinglePost,
  buildScenarioThreadReplies,
  requestCelebrityReply,
  resolveEventChoice,
} from "@/services/ai";
// sentiment.ts now only re-exports clampPercent; calculateVibeBump was removed.
import { clampPercent } from "@/services/sentiment";
import { formatRepostCount, parseRepostCount } from "@/utils/formatters";

const GAME_STATE_PATH = (FileSystem.documentDirectory ?? "") + "status_game_state.json";
const API_KEY_SECURE_KEY = "status-api-key";

const avatarChoices = [
  "https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1520813792240-56fc4a3765a7?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1492447166138-50c3889fccb1?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1463453091185-61582044d556?auto=format&fit=crop&w=400&q=80",
];

const bannerChoices = [
  "https://images.unsplash.com/photo-1502139214982-d0ad755818d8?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1500627964684-141351970a7f?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1525026198548-4baa812f1183?auto=format&fit=crop&w=1200&q=80",
];

export function getAvatarChoices() {
  return avatarChoices;
}
export function getBannerChoices() {
  return bannerChoices;
}

// Blank-slate default. Player Setup screen must collect name/handle/bio
// before initializeCharacter() runs — these empty strings exist so the
// PlayerProfile type stays satisfied during the brief window between
// state hydration and the Setup screen.
const defaultPlayer: PlayerProfile = {
  name: "",
  handle: "",
  avatar: avatarChoices[0],
  banner: bannerChoices[0],
  bio: "",
  description: "",
  provider: "openai",
  apiKey: "",
  model: "gpt-4o-mini",
  socialPresence: { humor: 0, aura: 0 },
  followers: 0,
};

const chemistryLabels: Record<ChemistryType, string> = {
  friends: "Friends",
  rivals: "Rivals",
  spicy: "Spicy",
  lovers: "Lovers",
  enemies: "Enemies",
  "co-conspirators": "Chaos Co-Conspirators",
};

const moodTable: Array<{
  min: number;
  label: string;
  headline: string;
  detail: string;
}> = [
  {
    min: -100,
    label: "cold",
    headline: "Currently feeling distant",
    detail: "Watching from a safe distance, screenshots ready",
  },
  {
    min: -25,
    label: "cautious",
    headline: "Currently feeling cautious",
    detail: "Hasn't decided whether you're worth the energy",
  },
  {
    min: 0,
    label: "curious",
    headline: "Currently feeling curious",
    detail: "Waiting to see your angle",
  },
  {
    min: 25,
    label: "playful",
    headline: "Currently feeling playful",
    detail: "Already drafting a response in their head",
  },
  {
    min: 50,
    label: "excited",
    headline: "Currently feeling excited",
    detail: "Playfully accepting the chaotic plan",
  },
];

function moodFor(vibe: number) {
  let cur = moodTable[0];
  for (const row of moodTable) {
    if (vibe >= row.min) cur = row;
  }
  return cur;
}

function createContact(c: Character, chemistry: ChemistryType = "friends"): ContactState {
  const vibe = 0;
  const moodInfo = moodFor(vibe);
  return {
    characterId: c.id,
    vibe,
    vibeReason: "You just met. Nothing has happened yet.",
    vibeDelta: 0,
    chemistry,
    chemistryLabel: chemistryLabels[chemistry],
    movesRemaining: 3,
    score: 0,
    proactive: false,
    mood: { label: moodInfo.label, reason: moodInfo.detail, delta: 0 },
    currentFeeling: { headline: moodInfo.headline, detail: moodInfo.detail },
    messages: [],
    preview: "",
  };
}

function emptyContacts(): Record<string, ContactState> {
  return {};
}

const builtinMilestoneSeeds: Array<Omit<Milestone, "applied" | "completed">> = [
  { id: "afterparty", title: "Get invited to a high-profile afterparty by an industry icon", requirements: { bravery: 0, mystery: 1, wit: 1 }, xp: 70 },
  { id: "single-drop", title: "Tease a surprise single without causing a label meltdown", requirements: { bravery: 1, mystery: 1, wit: 2 }, xp: 96 },
  { id: "award-stage", title: "Survive a live award-show camera cutaway", requirements: { bravery: 2, mystery: 1, wit: 2 }, xp: 125 },
];

const procMilestoneBank: Array<{ title: string; reqs: Record<SkillKey, number>; xp: number }> = [
  { title: "Fuel the rumors of a secret, unreleased collaboration", reqs: { bravery: 1, mystery: 2, wit: 0 }, xp: 140 },
  { title: "Have a major star's fan base demand your response to their beef", reqs: { bravery: 2, mystery: 0, wit: 2 }, xp: 165 },
  { title: "Get a tabloid to print a quote you never actually said", reqs: { bravery: 0, mystery: 3, wit: 1 }, xp: 180 },
  { title: "Crash a live stream and walk out a meme", reqs: { bravery: 3, mystery: 0, wit: 2 }, xp: 210 },
  { title: "Trigger a worldwide stan war by saying one word", reqs: { bravery: 1, mystery: 3, wit: 1 }, xp: 235 },
  { title: "Convince the timeline a leaked DM was fake", reqs: { bravery: 0, mystery: 2, wit: 3 }, xp: 250 },
];

function generateProceduralMilestone(index: number): Milestone {
  const seed = procMilestoneBank[index % procMilestoneBank.length];
  return {
    id: `proc-${index}-${Date.now()}`,
    title: seed.title,
    requirements: seed.reqs,
    applied: { bravery: 0, mystery: 0, wit: 0 },
    completed: false,
    xp: seed.xp,
  };
}

function initialMilestones(): Milestone[] {
  return builtinMilestoneSeeds.map((s) => ({
    ...s,
    applied: { bravery: 0, mystery: 0, wit: 0 },
    completed: false,
  }));
}

// Round 1.11.32 G-Fix #5 — quests now have machine-verifiable conditions.
// Old subjective entries ("suggest a Grammy winner is a puppet") let
// the player tap-claim XP without doing anything in-game. Each launch
// quest pairs flavor text with a concrete state predicate so the
// completion button gates behind real progress.
const initialSideQuests: SideQuest[] = [
  {
    id: "publish-3-posts",
    text: "Find your voice — publish 3 posts to the feed.",
    xp: 30,
    condition: { kind: "publish-posts", count: 3 },
  },
  {
    // Audit-fix B4 — dropped "of the day". The condition checks the
    // CUMULATIVE activityLog count of event-created entries, which never
    // resets, so "of the day" was misleading — the quest completes once,
    // permanently, after the player's first-ever event.
    id: "first-event",
    text: "Stir the pot — trigger your first event.",
    xp: 40,
    condition: { kind: "trigger-events", count: 1 },
  },
  {
    id: "warm-contact",
    text: "Win someone over — push any contact's vibe past +20.",
    xp: 50,
    condition: { kind: "max-vibe", threshold: 20 },
  },
];

function createInitialState(): GameState {
  return {
    phase: "landing",
    activeTab: "feed",
    selectedWorldId: builtinWorlds[0].id,
    initializedWorldIds: [],
    player: defaultPlayer,
    day: 1,
    level: 1,
    xp: 0,
    xpRequired: 50,
    skillPoints: 0,
    stats: { bravery: 0, mystery: 0, wit: 0 },
    mainGoalProgress: 0,
    milestones: initialMilestones(),
    sideQuests: initialSideQuests,
    posts: starterPosts.map((p) => ({ ...p, threadReplies: [...p.threadReplies] })),
    contacts: emptyContacts(),
    customCharacters: [],
    customWorlds: [],
    difficulty: "normal",
    notifications: [],
    activityLog: [],
    activities: [],
    pendingActions: [],
    characterOverrides: {},
    editingCharacterId: null,
    eventOpen: false,
    composeOpen: false,
    characterProfileId: null,
    openPostId: null,
    editProfileOpen: false,
    customizeWorldOpen: false,
    activityLogOpen: false,
    appSettingsOpen: false,
    addCharacterOpen: false,
    createActivityOpen: false,
    hideDMsInLog: false,
    lastToast: null,
    energy: 10,
    bonusEnergy: 0,
    isGenerating: false,
    activeChatId: null,
    fanIdentityCache: {},
    // Round 1.11.32 Faza B — pre-fetch engine fields.
    // The pool stays empty here on the landing/hub phase; it's freshly
    // built inside initializeCharacter (scenario start) and rebuilt on
    // every completeEvent (day rollover).
    dailyAuthorPool: { celebs: [], fanSlots: 0 },
    pendingBackgroundPosts: [],
    isFetchingBackgroundPost: false,
    currentEventContext: null,
    lastBackgroundFetchError: null,
    // Round 1.11.32 Faza F — pre-fetch buckets start empty; the bg
    // fetcher useEffect fills them during idle time.
    pendingNextEvent: null,
    pendingPostSuggestions: null,
    // F1 — onboarding shown once per save.
    onboardingSeen: false,
    // Round 1.11.32 G-Fix #3 — start with empty exhaustion queue so
    // Day 1 fan-slot picks have full 30-pool variety.
    recentCommenters: [],
    // Faza J #3 — assume online until the first call says otherwise.
    aiOnline: true,
    // Fala 1 #5 — empty mute list on fresh save. Toggle via
    // toggleMuteCharacter from CharacterProfileModal's bell button.
    mutedCharacterIds: [],
    // Fala 2 — favorites tracked separately for posts vs replies so
    // the Favorites tab can render two clean lists.
    favoritedPostIds: [],
    favoritedReplyIds: [],
    // Fala 3 — reports / win cycle / auto-DM defaults.
    reports: [],
    mainGoalCompletedDay: null,
    goalsCompleted: 0,
    lastWinReveal: null,
    autoContactConfig: {},
    // Round 1.11.32 Faza E — crisis defaults via resetCrisisState helper.
    // Same shape consumed by initializeCharacter on scenario rollover.
    ...resetCrisisState(),
  };
}

// Round 1.11.32 G-Fix #5 — evaluate a side-quest condition against the
// current state. Returns whether the player has earned the right to
// claim XP AND a human-readable progress string for the GoalsScreen UI
// ("2 / 3 posts"). Pure function — game-context's reducer calls it
// during completeSideQuest, the UI calls it every render.
export function evaluateQuestCondition(
  condition: SideQuestCondition | undefined,
  state: GameState,
): { satisfied: boolean; progress: string } {
  if (!condition) return { satisfied: true, progress: "" };
  switch (condition.kind) {
    case "publish-posts": {
      const playerPosts = state.posts.filter((p) => p.authorId === "player").length;
      return {
        satisfied: playerPosts >= condition.count,
        progress: `${Math.min(playerPosts, condition.count)} / ${condition.count} posts`,
      };
    }
    case "trigger-events": {
      const events = state.activityLog.filter((l) => l.kind === "event-created").length;
      return {
        satisfied: events >= condition.count,
        progress: `${Math.min(events, condition.count)} / ${condition.count} events`,
      };
    }
    case "max-vibe": {
      // Audit-fix B5 — empty cast no longer renders "Best vibe -100".
      // Without any contacts the reduce seed (-100) leaked into the UI;
      // now we show an actionable hint instead.
      const ids = Object.keys(state.contacts);
      if (ids.length === 0) {
        return {
          satisfied: false,
          progress: "Add a celebrity to your cast first",
        };
      }
      const best = Object.values(state.contacts).reduce(
        (acc, c) => Math.max(acc, c.vibe),
        -100,
      );
      return {
        satisfied: best >= condition.threshold,
        progress: `Best vibe ${Math.round(best)} / +${condition.threshold}`,
      };
    }
    case "follower-count": {
      return {
        satisfied: state.player.followers >= condition.threshold,
        progress: `${state.player.followers} / ${condition.threshold} followers`,
      };
    }
  }
}

function eventXpRange(level: number) {
  const lo = 15 + level * 6;
  const hi = 25 + level * 10;
  return { lo, hi };
}

function rollEventXp(level: number) {
  const { lo, hi } = eventXpRange(level);
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

type GameContextValue = {
  state: GameState;
  ready: boolean;
  activeWorld: World;
  allCharacters: Character[]; // catalog + custom
  cast: Character[]; // only those added by the player
  avatarChoices: string[];
  bannerChoices: string[];
  chemistryLabels: typeof chemistryLabels;
  eventXpRange: (level: number) => { lo: number; hi: number };

  // navigation
  setPhase: (phase: GamePhase) => void;
  setActiveTab: (tab: GameTab) => void;
  selectWorld: (worldId: string) => void;
  startScenarioSetup: () => void;
  initializeCharacter: (profile: Pick<PlayerProfile, "name" | "handle" | "avatar" | "bio">) => void;
  playActiveWorld: () => void;
  leaveScenario: () => void;

  // feed
  likePost: (postId: string) => void;
  starPost: (postId: string) => void;
  repostPost: (postId: string) => void;
  publishPost: (text: string) => Promise<void>;
  refreshFeed: () => Promise<void>;
  openPost: (postId: string | null) => void;
  replyToPost: (postId: string, text: string) => Promise<void>;
  replyToThreadReply: (postId: string, parentReplyId: string, text: string) => Promise<void>;
  likeThreadReply: (postId: string, replyId: string) => void;

  // suggestions
  fetchSuggestions: (kind: "post" | "event", context: string) => Promise<string[]>;

  // modals & screens
  setComposeOpen: (open: boolean) => void;
  setEventOpen: (open: boolean) => void;
  openCharacterProfile: (id: string | null) => void;
  setEditProfileOpen: (open: boolean) => void;
  setCustomizeWorldOpen: (open: boolean) => void;
  setActivityLogOpen: (open: boolean) => void;
  setAppSettingsOpen: (open: boolean) => void;
  setAddCharacterOpen: (open: boolean) => void;
  setCreateActivityOpen: (open: boolean) => void;
  setEditingCharacterId: (id: string | null) => void;
  setActiveChatId: (id: string | null) => void;
  // Fala 1 #5 — bell-toggle on CharacterProfileModal. Filters out
  // notifications for the muted character in NotificationsScreen.
  toggleMuteCharacter: (id: string) => void;
  // Fala 2 — star toggle on posts + thread replies. Surfaced in
  // ProfileScreen "Favorites" section.
  toggleFavoritePost: (postId: string) => void;
  toggleFavoriteReply: (replyId: string) => void;
  // Fala 3 — report a post. justified flag is computed from the
  // post's tone (attacker → justified) at call-time, mutated state
  // dispatches reputation effects via the reducer.
  reportPost: (postId: string) => void;
  // Fala 3 — auto-DM scheduler config update.
  setAutoContactConfig: (
    id: string,
    cfg: { dmIntensity: number; inviteIntensity: number },
  ) => void;
  // Fala 3 — dismiss win screen + advance to next goal tier.
  dismissWinScreen: () => void;
  applySkillStaging: (deltas: { bravery: number; mystery: number; wit: number }) => void;
  toggleHideDMsInLog: () => void;
  dismissToast: () => void;
  dismissOnboarding: () => void;
  resolveCharacter: (id: string) => (Character & { isOutlet?: boolean }) | undefined;
  updateCharacterOverride: (id: string, patch: Partial<{ avatar: AvatarSource; banner: AvatarSource; name: string; handle: string; bio: string; description: string }>) => void;

  // Round 1.11.32 Faza D — Stan Wars / Cancel Culture controls.
  // Fetch 3 PR Stunt options for the current crisis (AI when online,
  // offline bank when not). Calling `prActionsOpen` true after the
  // fetch surfaces the modal with the freshly-loaded list.
  fetchPRStuntOptions: () => Promise<PRStuntOption[]>;
  // Apply a chosen PR Stunt — burns the stat cost, knocks the crisis
  // level down by `effect`, logs into prHistory + activityLog.
  triggerPRStunt: (option: PRStuntOption) => void;
  // Toggle "laying low" mode. Flips the boolean and surfaces a toast
  // explaining the consequence (faster decay, 70% follower throttle).
  toggleLayingLow: () => void;
  // Divert attention — costs 2 energy + sacrifices a chosen target's
  // vibe (-20..-30) for a 30-50 crisis drop. Fires a priority Pop Craze
  // post into the FRONT of the buffer so the player sees the leak first.
  triggerDivertAttention: (targetCharacterId: string) => Promise<void>;
  // Crisis modal open/close.
  prActionsOpen: boolean;
  setPRActionsOpen: (open: boolean) => void;

  // game logic
  triggerEvent: () => Promise<void>;
  pendingEvent: EventOutcome | null;
  completeEvent: (action: string) => Promise<void>;
  completingEvent: boolean;
  completeSideQuest: (id: string) => void;
  applyMilestonePoints: () => void;
  skipMilestone: () => void;
  improveSkill: (skill: SkillKey) => void;
  updateProfile: (profile: Partial<PlayerProfile>) => void;
  customizeWorld: (data: { mainGoalTitle: string; setting: string; difficulty: WorldDifficulty }) => void;
  changeChemistry: (characterId: string, chemistry: ChemistryType) => void;
  addCharacterFromCatalog: (characterId: string, chemistry: ChemistryType, proactive?: boolean) => void;
  createCustomCharacter: (input: { name: string; handle: string; bio: string; description: string; avatar: string; banner: string; systemPrompt: string }) => string;
  removeCharacter: (id: string) => void;
  sendChatMessage: (characterId: string, text: string) => Promise<void>;
  createActivity: (input: {
    title: string;
    description: string;
    inviteeIds: string[];
    scheduledDay: number;
    scheduledHour?: number;
  }) => Promise<void>;
  rateOutcome: (id: string, rating: 1 | 2 | 3 | 4 | 5) => void;
  undoLastAction: () => void;
  generateCustomScenario: (prompt: string) => Promise<World | null>;
  resetSave: () => void;
};

const GameContext = createContext<GameContextValue | null>(null);

function withXP(state: GameState, amount: number): GameState {
  let xp = state.xp + amount;
  let level = state.level;
  let xpRequired = state.xpRequired;
  let skillPoints = state.skillPoints;
  while (xp >= xpRequired) {
    xp -= xpRequired;
    level += 1;
    // Fala 1 #12 — 3 skill points per level (was 2). Faster build-out
    // through bravery/mystery/wit so the skill tree feels meaningful
    // by level 5 instead of level 10.
    skillPoints += 3;
    // Exponential curve: each level needs more than the previous.
    xpRequired = Math.floor(100 * Math.pow(1.2, level));
  }
  return { ...state, xp, level, xpRequired, skillPoints };
}

const ENERGY_MAX = 10;
const BONUS_ENERGY_MAX = 10;
const DAILY_ENERGY_REGEN = 5;

// Try to deduct 1 energy point. Returns the next state and an `ok` flag.
// Order: base energy first, then bonus.
function consumeEnergy(state: GameState): { ok: boolean; next: GameState } {
  if (state.energy > 0) {
    return { ok: true, next: { ...state, energy: state.energy - 1 } };
  }
  if (state.bonusEnergy > 0) {
    return { ok: true, next: { ...state, bonusEnergy: state.bonusEnergy - 1 } };
  }
  return { ok: false, next: state };
}

function outOfEnergyToast(): WorldUpdateToast {
  return {
    id: `t-energy-${Date.now()}`,
    headline: "Out of energy",
    body: "You're out of energy for today! End the day (trigger an Event) to recharge.",
    presenceDeltas: [],
    relationshipDeltas: [],
  };
}

// Add +5 energy on day rollover, spilling overflow into bonusEnergy (max 10 each).
function bumpDayEnergy(state: GameState): GameState {
  const sum = state.energy + DAILY_ENERGY_REGEN;
  const energy = Math.min(ENERGY_MAX, sum);
  const overflow = Math.max(0, sum - ENERGY_MAX);
  const bonusEnergy = Math.min(BONUS_ENERGY_MAX, state.bonusEnergy + overflow);
  return { ...state, energy, bonusEnergy };
}

function nowLabel() {
  const date = new Date();
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Round 1.11.32 Faza G — three-tier haptic palette.
// Light  → ambient selection, navigation, suggestion taps (high frequency,
//          shouldn't feel intrusive).
// Medium → committed actions: publishing a post, triggering an event.
//          Player just made a real choice — they should feel the click.
// Heavy  → narrative shock moments: crisisLevel crossing 50 upwards.
//          The "oh no" thump as the drama hits a milestone.
// All three are best-effort: silent failure (.catch) so the app doesn't
// crash on devices without haptic hardware.
function softHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}
function mediumHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
}
function heavyHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
}

function logEntry(args: Omit<ActivityLogEntry, "id" | "createdAt">): ActivityLogEntry {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: `${nowLabel()} - ${new Date().toLocaleDateString()}`,
    ...args,
  };
}

export function GameProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<GameState>(createInitialState);
  const [ready, setReady] = useState(false);
  const [pendingEvent, setPendingEvent] = useState<EventOutcome | null>(null);
  const [completingEvent, setCompletingEvent] = useState(false);
  // Round 1.11.32 Faza D — PR Actions modal visibility lives in the
  // provider so any screen can open it (CrisisBar tap, toast CTA, etc).
  const [prActionsOpen, setPRActionsOpen] = useState(false);
  const stateRef = useRef(state);
  // Round 1.11.9 — synchronous fetch lock. React's `isGenerating` setState is
  // async and batched, so two rapid taps on a refresh / send button could
  // both pass the `if (state.isGenerating) return` guard before either
  // setState commits. This ref flips IMMEDIATELY (synchronously) inside
  // refreshFeed / sendChatMessage / fetchSuggestions, eliminating that race.
  // The global `state.isGenerating` is still set/cleared in parallel — that
  // one drives the UI "disabled" affordance; this ref is the contract.
  const isFetchingRef = useRef(false);
  // Refactor #3 — debounce apiKey writes to SecureStore. UI fires
  // updateProfile({ apiKey: nextChar }) on every keystroke when the
  // player types/pastes; each call previously spawned a native
  // SecureStore.setItemAsync (real IO syscall). Debouncing to 600ms
  // means the player can paste a 100-char key and we make ONE write.
  const apiKeySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Faza I #5A — companion ref for the value that's queued to write.
  // Lets a background-flush handler push the latest typed key to
  // SecureStore even if the 600ms debounce window hasn't elapsed yet.
  const apiKeyPendingRef = useRef<string | null>(null);
  const flushApiKey = useCallback(() => {
    if (apiKeySaveTimerRef.current) {
      clearTimeout(apiKeySaveTimerRef.current);
      apiKeySaveTimerRef.current = null;
    }
    const pending = apiKeyPendingRef.current;
    if (pending !== null) {
      apiKeyPendingRef.current = null;
      void SecureStore.setItemAsync(API_KEY_SECURE_KEY, pending).catch(
        () => undefined,
      );
    }
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Faza I #5A — lifecycle hardening for the debounced apiKey write.
  // Two guarantees:
  //   1. AppState transition to "background" / "inactive" flushes any
  //      pending write IMMEDIATELY. iOS gives apps ~5 seconds after
  //      backgrounding before suspending; the OS may also kill us
  //      outright (e.g. memory pressure). Flushing on the transition
  //      means a player who pastes their key and immediately swipes
  //      home doesn't lose the in-flight characters waiting for the
  //      600ms debounce to elapse.
  //   2. Provider unmount (rare — GameProvider is the root, so really
  //      this only fires on full app close / hot reload) also flushes,
  //      AND clears the timer to keep React's StrictMode happy.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background" || next === "inactive") {
        flushApiKey();
      }
    });
    return () => {
      sub.remove();
      flushApiKey();
    };
  }, [flushApiKey]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // Game state lives on disk in documentDirectory; API key stays in SecureStore.
      let loadedState: Partial<GameState> | null = null;
      let rawRead: string | null = null;
      try {
        rawRead = await FileSystem.readAsStringAsync(GAME_STATE_PATH);
      } catch {
        /* file missing — first run; fall through to initial state */
      }
      if (rawRead !== null) {
        try {
          loadedState = JSON.parse(rawRead) as Partial<GameState>;
        } catch (parseErr) {
          // Refactor #6 — preserve corrupted save for diagnostics
          // instead of silently throwing the player's progress away. We
          // rename it to `.corrupted` (with a timestamp suffix so
          // multiple corruptions don't overwrite each other) BEFORE
          // falling through to createInitialState. The player can
          // surface it to the team for post-mortem; meanwhile they
          // restart fresh instead of looping on a parse error every
          // cold start.
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          const corruptedPath = `${GAME_STATE_PATH}.corrupted.${stamp}`;
          try {
            await FileSystem.moveAsync({ from: GAME_STATE_PATH, to: corruptedPath });
            console.warn(
              `[persist] save corrupted, preserved as ${corruptedPath}:`,
              parseErr,
            );
          } catch (moveErr) {
            console.warn(
              "[persist] save corrupted AND could not be renamed:",
              parseErr,
              moveErr,
            );
          }
        }
      }
      let storedApiKey: string | null = null;
      try {
        storedApiKey = await SecureStore.getItemAsync(API_KEY_SECURE_KEY);
      } catch {
        /* ignore */
      }
      if (!mounted) return;
      if (loadedState || storedApiKey) {
        setState((prev) => {
          const base = loadedState ? { ...createInitialState(), ...loadedState } : prev;
          return {
            ...base,
            player: {
              ...base.player,
              apiKey: storedApiKey ?? base.player.apiKey ?? "",
            },
          };
        });
      }
      setReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Round 1.11.9 — persistence uses GRANULAR deps instead of `state` so the
  // effect doesn't re-fire (and the heavy JSON.stringify doesn't run) every
  // time a modal flag flips or `isGenerating` toggles. We list only the
  // fields that are actually persisted; ephemeral UI fields (composeOpen,
  // eventOpen, lastToast, openPostId, characterProfileId, activeChatId,
  // editingCharacterId, isGenerating, all modal-open flags) are deliberately
  // OMITTED so they never trigger a write cycle on the main thread.
  // lastSavedHashRef remains as a final defense for the rare case the deps
  // change but the serialized snapshot is byte-identical.
  const lastSavedHashRef = useRef<string>("");
  useEffect(() => {
    if (!ready) return;
    const timeout = setTimeout(() => {
      const { player } = state;
      const { apiKey: _omit, ...playerWithoutKey } = player;
      const snapshot = {
        phase: state.phase,
        activeTab: state.activeTab,
        selectedWorldId: state.selectedWorldId,
        initializedWorldIds: state.initializedWorldIds,
        player: { ...playerWithoutKey, apiKey: "" },
        day: state.day,
        level: state.level,
        xp: state.xp,
        xpRequired: state.xpRequired,
        skillPoints: state.skillPoints,
        stats: state.stats,
        mainGoalProgress: state.mainGoalProgress,
        milestones: state.milestones,
        sideQuests: state.sideQuests,
        posts: state.posts,
        contacts: state.contacts,
        customCharacters: state.customCharacters,
        customWorlds: state.customWorlds,
        difficulty: state.difficulty,
        notifications: state.notifications,
        activityLog: state.activityLog,
        activities: state.activities,
        pendingActions: state.pendingActions,
        energy: state.energy,
        bonusEnergy: state.bonusEnergy,
        characterOverrides: state.characterOverrides,
        hideDMsInLog: state.hideDMsInLog,
        // Round 1.11.32 Faza B — pre-fetch engine continuity. Buffer +
        // pool persisted so close/reopen mid-day keeps the same daily
        // arc. fanIdentityCache also persisted so AI-minted handles
        // keep their avatar mappings forever. Transient flags
        // (isFetchingBackgroundPost, lastBackgroundFetchError) are
        // intentionally omitted — they should always reset on cold start.
        fanIdentityCache: state.fanIdentityCache,
        dailyAuthorPool: state.dailyAuthorPool,
        pendingBackgroundPosts: state.pendingBackgroundPosts,
        currentEventContext: state.currentEventContext,
        // Round 1.11.32 Faza D — crisis state persisted (close/reopen
        // mid-storm keeps the meter where you left it).
        crisisLevel: state.crisisLevel,
        crisisOrigin: state.crisisOrigin,
        crisisStartedDay: state.crisisStartedDay,
        crisisLayingLow: state.crisisLayingLow,
        prHistory: state.prHistory,
        // Audit-fix B2 — persist the author-exhaustion queue so the
        // "don't repeat the same fan 10 picks in a row" rotation survives
        // close/reopen. Without this, cold start reset the queue to [] and
        // the first ~10 fetches could re-spam a recently-seen fan.
        recentCommenters: state.recentCommenters,
        // F1 — onboarding flag persisted so the tutorial shows exactly once.
        onboardingSeen: state.onboardingSeen,
      };
      const serialized = JSON.stringify(snapshot);
      if (serialized === lastSavedHashRef.current) return;
      lastSavedHashRef.current = serialized;
      // Refactor #7 — atomic save. Writing directly to GAME_STATE_PATH
      // leaves the file half-written if the process is killed mid-flush
      // (OS crash, OOM kill, user force-quit). Writing to .tmp first +
      // moveAsync to final means the previous valid save stays intact
      // until the new one is fully on disk; the move is a single fs
      // syscall on Expo's underlying FS so it's either fully applied or
      // not applied at all. We also defensively delete a stale .tmp
      // from a previous crash before writing this one.
      const tmpPath = `${GAME_STATE_PATH}.tmp`;
      (async () => {
        try {
          // Delete a leftover .tmp from a prior crash (idempotent: OK if missing).
          await FileSystem.deleteAsync(tmpPath, { idempotent: true });
          await FileSystem.writeAsStringAsync(tmpPath, serialized);
          await FileSystem.moveAsync({ from: tmpPath, to: GAME_STATE_PATH });
        } catch (err) {
          console.warn("[persist] atomic save failed:", err);
        }
      })();
    }, 800);
    return () => clearTimeout(timeout);
    // Granular deps — only persisted fields. UI flags intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ready,
    state.phase,
    state.activeTab,
    state.selectedWorldId,
    state.initializedWorldIds,
    state.player,
    state.day,
    state.level,
    state.xp,
    state.xpRequired,
    state.skillPoints,
    state.stats,
    state.mainGoalProgress,
    state.milestones,
    state.sideQuests,
    state.posts,
    state.contacts,
    state.customCharacters,
    state.customWorlds,
    state.difficulty,
    state.notifications,
    state.activityLog,
    state.activities,
    state.pendingActions,
    state.energy,
    state.bonusEnergy,
    state.characterOverrides,
    state.hideDMsInLog,
    state.fanIdentityCache,
    state.dailyAuthorPool,
    state.pendingBackgroundPosts,
    state.currentEventContext,
    state.crisisLevel,
    state.crisisOrigin,
    state.crisisStartedDay,
    state.crisisLayingLow,
    state.prHistory,
    state.recentCommenters,
    state.onboardingSeen,
  ]);

  // Refactor #1 — Heavy haptic at the 50-crisis threshold lives here,
  // OUTSIDE the pure reducer. Tracks previous level via ref so we fire
  // exactly once on the upward crossing (prev < 50 && new >= 50);
  // PR-stunt downward movement and laying-low decay never re-fire it.
  const prevCrisisRef = useRef(state.crisisLevel);
  useEffect(() => {
    const prev = prevCrisisRef.current;
    if (prev < 50 && state.crisisLevel >= 50) {
      heavyHaptic();
    }
    prevCrisisRef.current = state.crisisLevel;
  }, [state.crisisLevel]);

  // ===========================================================
  // Round 1.11.32 Faza B — BACKGROUND PRE-FETCH ENGINE
  // ===========================================================
  // Watches the daily pool + buffer state and drains the pool one post
  // at a time, accumulating into pendingBackgroundPosts. Stops cleanly
  // when the pool is exhausted; resumes whenever completeEvent rebuilds
  // it for a new day. Each fetch is gated by a SYNC ref lock so React
  // StrictMode's double-render and rapid state churn cannot spawn
  // parallel calls.
  //
  // The reducer (setState) stays 100% pure — every side effect lives in
  // the async closure below. Reads from `stateRef.current` to dodge the
  // closure-stale-state trap; writes go through setState only.
  const bgFetchLockRef = useRef(false);
  useEffect(() => {
    // Quick exits — keep the hot path cheap so re-renders are free.
    if (state.phase !== "game") return;
    if (!ready) return;
    if (bgFetchLockRef.current) return;
    if (state.isFetchingBackgroundPost) return;
    // Backoff window honored — bg failures don't hammer the API.
    if (state.lastBackgroundFetchError) {
      const elapsed = Date.now() - state.lastBackgroundFetchError.at;
      const tries = state.lastBackgroundFetchError.tries;
      const backoff = tries >= 3 ? 60_000 : tries === 2 ? 15_000 : 5_000;
      if (elapsed < backoff) return;
    }

    // Round 1.11.32 Faza F — task dispatch. The bg fetcher now does
    // three jobs in priority order:
    //   1. "post"        → drain dailyAuthorPool into the buffer
    //   2. "event"       → pre-fetch the next scenario event
    //   3. "suggestions" → pre-fetch compose suggestions for the player
    // Posts dominate until the buffer hits 3. Once the buffer is full,
    // the fetcher uses spare cycles for event/suggestions. When all
    // three buckets are satisfied the fetcher idles silently.
    const bufferFull = state.pendingBackgroundPosts.length >= 3;
    const poolHasWork =
      state.dailyAuthorPool.celebs.length > 0 || state.dailyAuthorPool.fanSlots > 0;
    type BgTask = "post" | "event" | "suggestions";
    let task: BgTask | null = null;
    if (!bufferFull && poolHasWork) {
      task = "post";
    } else if (state.pendingNextEvent === null) {
      task = "event";
    } else if (state.pendingPostSuggestions === null) {
      task = "suggestions";
    }
    if (task === null) return; // nothing to do — fetcher idle

    bgFetchLockRef.current = true;
    setState((cur) => ({ ...cur, isFetchingBackgroundPost: true }));

    (async () => {
      // Read everything off the ref to dodge stale closures.
      const cur = stateRef.current;
      // Resolve activeWorld locally — same lookup the useMemo uses.
      const activeWorld =
        [...builtinWorlds, ...cur.customWorlds].find((w) => w.id === cur.selectedWorldId) ??
        builtinWorlds[0];

      try {
        // -------------------- TASK: event prefetch --------------------
        if (task === "event") {
          const event = await generateEvent({
            player: cur.player,
            world: activeWorld,
            day: cur.day,
            // Round 1.11.32 Faza F — pre-fetched events must read as a
            // natural CONTINUATION of the player's recent arc. We blend
            // the recentLog (always present) with the currentEventContext
            // (set after the last event completion) so Gemini knows the
            // "where we are right now" beat before pitching the next
            // event title/body. Without this the prefetched event feels
            // disconnected from whatever the player just did.
            recentLog: [
              ...(cur.currentEventContext
                ? [`Latest event recap: ${cur.currentEventContext}`]
                : []),
              ...cur.activityLog.slice(0, 8).map((l) => `Day ${l.day}: ${l.title}`),
            ],
          });
          setState((s2) => ({
            ...s2,
            pendingNextEvent: event,
            isFetchingBackgroundPost: false,
            lastBackgroundFetchError: null,
          }));
          return;
        }

        // ---------------- TASK: suggestions prefetch ------------------
        if (task === "suggestions") {
          const cast: Character[] = Object.keys(cur.contacts)
            .map((id) => [...catalogCharacters, ...cur.customCharacters].find((c) => c.id === id))
            .filter((c): c is Character => !!c);
          // Round 1.11.32 Faza G — Deep pre-fetch. Suggestions need to
          // land 0ms relevant to whatever the player is ABOUT to
          // experience. Priority for the context string:
          //   1. pendingNextEvent — if the bg fetcher already prepped
          //      the upcoming event, draft compose suggestions that
          //      anticipate it (player ends event → opens Compose →
          //      sees sharp follow-ups in the prompt list).
          //   2. currentEventContext — fall back to the last event's
          //      recap when no future event is queued yet.
          //   3. Empty string — Day 1 with no event history.
          const suggestionContext =
            cur.pendingNextEvent
              ? `UPCOMING event "${cur.pendingNextEvent.eventTitle}": ${cur.pendingNextEvent.eventBody}`
              : (cur.currentEventContext ?? "");
          const suggestions = await generateComposeSuggestions({
            player: cur.player,
            world: activeWorld,
            kind: "post",
            context: suggestionContext,
            characters: cast,
          });
          setState((s2) => ({
            ...s2,
            pendingPostSuggestions: suggestions,
            isFetchingBackgroundPost: false,
            lastBackgroundFetchError: null,
          }));
          return;
        }

        // ----------------------- TASK: post fetch ---------------------
        // Deterministic drain: prefer celebs first; switch to fan slots
        // only once celebs are empty. Matches the user-locked "drain logic
        // = quiet down by end of day" pacing.
        const pool = cur.dailyAuthorPool;
        let authorId: string;
        let isFan: boolean;
        if (pool.celebs.length > 0) {
          const idx = Math.floor(Math.random() * pool.celebs.length);
          authorId = pool.celebs[idx];
          isFan = false;
        } else {
          authorId = mintAdHocFanId(cur.day);
          isFan = true;
        }

        const character = isFan
          ? undefined
          : ([...catalogCharacters, ...cur.customCharacters].find((c) => c.id === authorId) as
              | Character
              | undefined);
        const contactChemistry = cur.contacts[authorId]?.chemistryLabel;
        // 50/50 relateToEvent when context exists — matches the user-locked
        // 50% on-topic / 50% off-topic content split for the day's feed.
        const relateToEvent = !!cur.currentEventContext && Math.random() < 0.5;

        const result = await generateSinglePost({
          player: cur.player,
          world: activeWorld,
          characterId: authorId,
          isFan,
          relateToEvent,
          currentEventContext: cur.currentEventContext,
          character,
          contactChemistry,
          recentPlayerActions: cur.activityLog.slice(0, 3).map((l) => l.title),
          // Round 1.11.32 Alpha Fix #4 — feed the full active cast into
          // the prompt so AI can weave celeb cross-comments into the
          // post's threadReplies. We use `contacts` keys (full cast)
          // rather than `dailyAuthorPool.celebs` (today's drain queue)
          // because cross-comments shouldn't be gated by who's already
          // posted today — anyone in the cast can react.
          castCelebIds: Object.keys(cur.contacts),
          // Round 1.11.32 Faza D — crisis context for the bg fetcher
          // matches the post-replies path. Gated > 20 server-side too.
          crisisContext:
            cur.crisisLevel > 20
              ? {
                  level: cur.crisisLevel,
                  layingLow: cur.crisisLayingLow,
                  originCharacterId:
                    cur.crisisOrigin?.kind === "relationship-drop"
                      ? cur.crisisOrigin.characterId
                      : undefined,
                }
              : undefined,
        });

        // Synthesize FeedPost shape from AI result. Reuses the same
        // tiered like-roll helpers as applyWorldUpdate so cinematic
        // numbers stay consistent across paths.
        const baseId = Date.now();
        const postAuthorSrc = findAnyCharacter(result.characterId);
        const postAuthorFollowers =
          postAuthorSrc && "followers" in postAuthorSrc && typeof postAuthorSrc.followers === "number"
            ? postAuthorSrc.followers
            : 0;
        const threadReplies: ThreadReply[] = result.threadReplies.map((r, i) => {
          const rSrc = findAnyCharacter(r.characterId);
          const rFollowers =
            rSrc && "followers" in rSrc && typeof rSrc.followers === "number"
              ? rSrc.followers
              : 0;
          return {
            id: `tr-${baseId}-${i}`,
            authorId: r.characterId,
            text: r.text,
            likes: rollReplyLikes(r.characterId, rFollowers),
            createdAt: nowLabel(),
          };
        });
        const newPost: FeedPost = {
          id: `bg-${baseId}-${Math.random().toString(36).slice(2, 6)}`,
          authorId: result.characterId,
          text: result.text,
          replies: threadReplies.length,
          reposts: `${(Math.random() * 50 + 1).toFixed(1)}K`,
          likes: rollPostLikes(result.characterId, postAuthorFollowers),
          threadReplies,
          createdAt: nowLabel(),
          day: cur.day,
        };

        // Round 1.11.32 G-Fix #3 — rewrite any thread reply authors who
        // are in the exhaustion queue to fresh fan IDs. Celebs (cast
        // members) pass through unchanged; only known fan IDs are
        // candidates for the swap. Indices are deterministic per beat
        // so a single batch can't all collapse onto the same "fresh"
        // pick.
        for (let i = 0; i < threadReplies.length; i++) {
          const tr = threadReplies[i];
          const isFanReply = anonymousFanIds.includes(tr.authorId);
          if (isFanReply && cur.recentCommenters.includes(tr.authorId)) {
            const replacement = pickFreshFan(cur.recentCommenters, i);
            threadReplies[i] = { ...tr, authorId: replacement };
          }
        }

        setState((s2) => {
          // Consume the slot we used. Celeb removal targets the EXACT id;
          // fan removal decrements the slot counter. Atomic with the
          // buffer push to keep the pool/buffer pair consistent.
          const nextPool = isFan
            ? { ...s2.dailyAuthorPool, fanSlots: Math.max(0, s2.dailyAuthorPool.fanSlots - 1) }
            : {
                ...s2.dailyAuthorPool,
                celebs: s2.dailyAuthorPool.celebs.filter((id) => id !== authorId),
              };
          // Round 1.11.32 G-Fix #3 — push this beat's fan authors into
          // the exhaustion queue so the next beat picks DIFFERENT fans.
          const usedFanIds = [
            ...(isFan ? [] : []), // post author handled separately below
            ...threadReplies.map((tr) => tr.authorId),
          ];
          const nextExhausted = pushExhausted(s2.recentCommenters, usedFanIds);
          // Collect every fresh fan-ID surfaced by this post (author +
          // thread reply authors). mintFanIdentities pure-merges them
          // into the cache so resolveCharacter renders stable avatars.
          const fanCandidates: string[] = [];
          if (isFan) fanCandidates.push(authorId);
          for (const tr of threadReplies) fanCandidates.push(tr.authorId);
          const nextFanCache = mintFanIdentities(s2.fanIdentityCache, fanCandidates);

          // Round 1.11.32 (Poprawka 2) — apply optional per-post
          // relationshipShift to the matching contact. The AI may attach
          // a tiny ±delta when the post is relevant to one cast member
          // (e.g. Sabrina posting in support of the player's event
          // choice). Without this block the shift would be parsed by
          // generateSinglePost and then silently dropped on the floor.
          // Pattern mirrors applyPostReplies: clamp vibe, refresh
          // moodInfo, write vibeReason for the next refresh's UI.
          let nextContacts = s2.contacts;
          const shift = result.relationshipShift;
          if (shift) {
            const c = s2.contacts[shift.characterId];
            if (c) {
              const newVibe = Math.max(-100, Math.min(100, c.vibe + shift.delta));
              const moodInfo = moodFor(newVibe);
              nextContacts = {
                ...s2.contacts,
                [shift.characterId]: {
                  ...c,
                  vibe: newVibe,
                  vibeDelta: shift.delta,
                  vibeReason: shift.reason,
                  currentFeeling: { headline: moodInfo.headline, detail: moodInfo.detail },
                  mood: { label: moodInfo.label, reason: moodInfo.detail, delta: shift.delta },
                },
              };
            }
          }

          return {
            ...s2,
            dailyAuthorPool: nextPool,
            pendingBackgroundPosts: [...s2.pendingBackgroundPosts, newPost],
            fanIdentityCache: nextFanCache,
            contacts: nextContacts,
            recentCommenters: nextExhausted,
            isFetchingBackgroundPost: false,
            lastBackgroundFetchError: null,
            // Faza J #3 — broadcast network status. result._fromOffline
            // === true means we fell through to the offline bank; false
            // / undefined means the AI provider actually responded.
            aiOnline: !result._fromOffline,
          };
        });
      } catch (err) {
        // generateSinglePost already catches AI network/parse errors and
        // returns offline-synthesized content. Reaching this catch means
        // a true JS-level exception slipped through — rare but possible.
        console.warn("[bg-fetch] unexpected failure:", err);
        setState((s2) => {
          const tries = (s2.lastBackgroundFetchError?.tries ?? 0) + 1;
          return {
            ...s2,
            isFetchingBackgroundPost: false,
            lastBackgroundFetchError: { at: Date.now(), tries },
            // Faza J #3 — catastrophic catch path means the AI service
            // didn't even fall through to offline cleanly; force the
            // chip to OFFLINE since we're definitely not on AI right now.
            aiOnline: false,
            // After two consecutive failures surface the Faza A top toast.
            // The toast is non-blocking — pull-to-refresh still works.
            lastToast:
              tries >= 2 && !s2.lastToast
                ? {
                    id: `t-net-${Date.now()}`,
                    headline: "Network hiccup",
                    body: "Pull again in a moment.",
                    presenceDeltas: [],
                    relationshipDeltas: [],
                  }
                : s2.lastToast,
          };
        });
      } finally {
        bgFetchLockRef.current = false;
      }
    })();
  }, [
    ready,
    state.phase,
    state.dailyAuthorPool,
    state.pendingBackgroundPosts.length,
    state.isFetchingBackgroundPost,
    state.lastBackgroundFetchError,
    state.currentEventContext,
    // Round 1.11.32 Faza F — re-evaluate the task dispatcher when either
    // pre-fetch bucket flips between null and filled. Without these deps
    // a freshly-cleared pendingNextEvent (e.g. after completeEvent) would
    // not trigger a new event prefetch until some other state ticked.
    state.pendingNextEvent,
    state.pendingPostSuggestions,
  ]);

  const value = useMemo<GameContextValue>(() => {
    const allCustomAndBuiltinWorlds = [...builtinWorlds, ...state.customWorlds];
    const activeWorld =
      allCustomAndBuiltinWorlds.find((w) => w.id === state.selectedWorldId) ?? builtinWorlds[0];
    const allCharacters = [...catalogCharacters, ...state.customCharacters];
    // The cast = characters the player has actually added (i.e. has a contact for).
    const cast = Object.keys(state.contacts)
      .map((id) => allCharacters.find((c) => c.id === id))
      .filter(Boolean) as Character[];

    return {
      state,
      ready,
      activeWorld,
      allCharacters,
      cast,
      avatarChoices,
      bannerChoices,
      chemistryLabels,
      pendingEvent,
      completingEvent,
      eventXpRange,

      // ----- nav
      setPhase: (phase) => setState((s) => ({ ...s, phase })),
      setActiveTab: (tab) => {
        softHaptic();
        setState((s) => ({ ...s, activeTab: tab }));
      },
      selectWorld: (worldId) => {
        softHaptic();
        setState((s) => ({ ...s, selectedWorldId: worldId, phase: "details" }));
      },
      startScenarioSetup: () => {
        softHaptic();
        setState((s) => ({ ...s, phase: "setup" }));
      },
      initializeCharacter: (profile) => {
        softHaptic();
        setState((s) => {
          // Scenario-aware Day-1 viral spike (Round 1.10). All scenarios
          // start the player at 0 followers — they build their base from
          // nothing. EXCEPTION: "accidentally-famous" — its inciting
          // incident IS the player going viral overnight. We simulate that
          // with a 50-300 follower starter bump + a welcome toast that
          // frames it narratively.
          const isAccidentallyFamous = s.selectedWorldId === "accidentally-famous";
          const starterFollowers = isAccidentallyFamous
            ? Math.floor(50 + Math.random() * 250)
            : 0;
          // Refactor #2 — name the fresh contacts record ONCE, then feed
          // both the state field AND buildDailyAuthorPool from it. The
          // previous code used `Object.keys(s.contacts)` which read the
          // STALE contacts from the PREVIOUS scenario, leaking cast IDs
          // into the new scenario's daily pool. nextContacts is the
          // single source of truth.
          const nextContacts: GameState["contacts"] = emptyContacts();
          return {
            ...s,
            player: {
              ...s.player,
              ...profile,
              socialPresence: { humor: 0, aura: 0 },
              followers: starterFollowers,
            },
            initializedWorldIds: Array.from(new Set([...s.initializedWorldIds, s.selectedWorldId])),
            day: 1,
            level: 1,
            xp: 0,
            xpRequired: 50,
            skillPoints: 0,
            stats: { bravery: 0, mystery: 0, wit: 0 },
            mainGoalProgress: 0,
            milestones: initialMilestones(),
            sideQuests: initialSideQuests,
            posts: starterPosts.map((p) => ({ ...p, threadReplies: [...p.threadReplies] })),
            contacts: nextContacts,
            notifications: [],
            activityLog: [],
            activities: [],
            pendingActions: [],
            lastToast: isAccidentallyFamous
              ? {
                  id: `t-viral-${Date.now()}`,
                  headline: "Your video blew up overnight",
                  body: "Your phone won't stop buzzing. You went viral.",
                  followerDelta: starterFollowers,
                  presenceDeltas: [],
                  relationshipDeltas: [],
                }
              : null,
            energy: 10,
            bonusEnergy: 0,
            isGenerating: false,
            activeChatId: null,
            // Clear cache on fresh character init — old fan identities
            // from a previous scenario should not leak in.
            fanIdentityCache: {},
            // Round 1.11.32 Faza B — first daily pool is built immediately
            // so the bg fetcher has work the moment the player lands on
            // the feed. Cast IDs come from contacts after addCharacter
            // calls; on Day 1 the player may have 0 cast → the pool falls
            // back to outlet fillers + full 5+6=11 fan slots.
            // Refactor #2 — pool built from FRESH nextContacts (not stale s.contacts).
            dailyAuthorPool: buildDailyAuthorPool(
              Object.keys(nextContacts),
              outletCharacters.map((o) => o.id),
            ),
            pendingBackgroundPosts: [],
            isFetchingBackgroundPost: false,
            // Day 1 has no event yet — pool fetches will all be off-topic.
            currentEventContext: null,
            lastBackgroundFetchError: null,
            // Round 1.11.32 Faza F — pre-fetch buckets cleared on new
            // scenario. Stale event suggestions from a previous run would
            // be jarring.
            pendingNextEvent: null,
            pendingPostSuggestions: null,
            recentCommenters: [],
    // Faza J #3 — assume online until the first call says otherwise.
    aiOnline: true,
            // Round 1.11.32 Faza E — fresh slate via DRY helper. Crisis
            // state never carries across scenarios; resetCrisisState() is
            // the single source of truth for the wipe shape.
            ...resetCrisisState(),
            activeTab: "feed",
            phase: "game",
          };
        });
      },
      playActiveWorld: () => {
        softHaptic();
        setState((s) => {
          if (!s.initializedWorldIds.includes(s.selectedWorldId)) {
            return { ...s, phase: "setup" };
          }
          return { ...s, activeTab: "feed", phase: "game" };
        });
      },
      leaveScenario: () => {
        softHaptic();
        setState((s) => ({ ...s, phase: "hub", appSettingsOpen: false }));
      },

      // ----- feed
      likePost: (postId) => {
        softHaptic();
        setState((s) => {
          const post = s.posts.find((p) => p.id === postId);
          const liked = !post?.liked;
          const next = {
            ...s,
            posts: s.posts.map((p) =>
              p.id === postId
                ? { ...p, liked, likes: Math.max(0, p.likes + (liked ? 1 : -1)) }
                : p,
            ),
          };
          return liked ? withXP(next, 2) : next;
        });
      },
      starPost: (postId) => {
        softHaptic();
        setState((s) => ({
          ...s,
          posts: s.posts.map((p) => (p.id === postId ? { ...p, starred: !p.starred } : p)),
        }));
      },
      // Repost toggle. `reposts` is a human-readable string like "4.7K" / "12" —
      // we parse the leading number, bump it by ±1, and re-format so the player
      // sees the count actually move.
      repostPost: (postId) => {
        softHaptic();
        setState((s) => ({
          ...s,
          posts: s.posts.map((p) => {
            if (p.id !== postId) return p;
            // Refactor #9 — hardened parse via utils/formatters. Old
            // inline regex was vulnerable to "12..4K" (LLM hallucinated
            // double dot) returning 12 instead of failing safe.
            const wasReposted = !!p.reposted;
            const total = parseRepostCount(p.reposts);
            const next = Math.max(0, total + (wasReposted ? -1 : 1));
            const reposts = formatRepostCount(next);
            return { ...p, reposted: !wasReposted, reposts };
          }),
        }));
      },
      publishPost: async (text) => {
        if (stateRef.current.isGenerating) return;
        const probe = consumeEnergy(stateRef.current);
        if (!probe.ok) {
          softHaptic();
          setState((s) => ({ ...s, lastToast: outOfEnergyToast(), composeOpen: false }));
          return;
        }
        // Round 1.11.32 Faza G — Medium tier: publishing a post is a
        // committed action, deserves a meatier physical click than the
        // ambient Light selection feedback.
        mediumHaptic();
        const postId = `player-${Date.now()}`;
        const newPost: FeedPost = {
          id: postId,
          authorId: "player",
          text,
          replies: 0,
          reposts: "0",
          likes: 0,
          playerPost: true,
          threadReplies: [],
          createdAt: nowLabel(),
          day: stateRef.current.day,
          views: "1",
        };
        setState((s) => {
          const energyApplied = consumeEnergy(s).next;
          return withXP(
            {
              ...energyApplied,
              posts: [newPost, ...energyApplied.posts],
              composeOpen: false,
              pendingActions: [
                { id: `pa-${Date.now()}`, kind: "post-replies", payload: { postId } },
                ...energyApplied.pendingActions,
              ],
              activityLog: [
                logEntry({
                  kind: "post-published",
                  title: "You published a post",
                  body: text,
                  day: energyApplied.day,
                  scoreChanges: [{ label: "Engagement", delta: 5, positive: true }],
                }),
                ...energyApplied.activityLog,
              ],
            },
            5,
          );
        });
      },

      refreshFeed: async () => {
        // Round 1.11.32 Faza B — pull-to-refresh now serves the LOCAL
        // pre-fetch buffer first; ambient AI calls are owned exclusively
        // by the background fetcher useEffect. Two paths:
        //   1. A post-replies action is queued (player just posted) →
        //      run the AI call normally — this is a player-driven,
        //      synchronous-feeling beat.
        //   2. Otherwise → flush pendingBackgroundPosts into the feed.
        //      If the buffer is empty, exit silently and let the FeedScreen
        //      spinner reflect isFetchingBackgroundPost; the bg fetcher
        //      will populate the buffer on its own cadence.
        //
        // Legacy daily-tick / event-aftermath / activity-aftermath actions
        // that may live in saved games are silently drained — the bg
        // fetcher handles their semantic now.
        if (isFetchingRef.current) return;
        if (stateRef.current.isGenerating) return;

        const queue = stateRef.current.pendingActions;
        const postRepliesIdx = queue.findIndex((a) => a.kind === "post-replies");

        // Path 1 — player-driven post-replies action.
        if (postRepliesIdx >= 0) {
          const action = queue[postRepliesIdx];
          if (action.kind !== "post-replies") return; // narrow for TS
          isFetchingRef.current = true;
          setState((s) => ({
            ...s,
            pendingActions: s.pendingActions.filter((a) => a.id !== action.id),
            isGenerating: true,
          }));
          try {
            const post = stateRef.current.posts.find((p) => p.id === action.payload.postId);
            if (!post) return;
            const contextReplyId = action.payload.contextReplyId;
            const contextReply = contextReplyId
              ? post.threadReplies.find((r) => r.id === contextReplyId)
              : undefined;
            const author =
              post.authorId === "player"
                ? undefined
                : (allCharacters.find((c) => c.id === post.authorId) ?? undefined);
            const result = await generatePostReplies({
              player: stateRef.current.player,
              world: activeWorld,
              postText: contextReply
                ? `Original post by ${author?.name ?? "you"}: "${post.text}"\nA reply you want reactions to: "${contextReply.text}"`
                : post.text,
              characters: cast,
              contacts: Object.fromEntries(
                Object.entries(stateRef.current.contacts).map(([id, c]) => [
                  id,
                  { vibe: c.vibe, chemistryLabel: c.chemistryLabel },
                ]),
              ),
              replyMode: !!contextReply,
              originalAuthor: author?.name,
              contextReplyText: contextReply?.text,
              // Round 1.11.32 Faza D — crisis context lets the AI
              // activate defensive fan voicing. Only attached when
              // level > 20 (token-saving guard).
              crisisContext:
                stateRef.current.crisisLevel > 20
                  ? {
                      level: stateRef.current.crisisLevel,
                      layingLow: stateRef.current.crisisLayingLow,
                      originCharacterId:
                        stateRef.current.crisisOrigin?.kind === "relationship-drop"
                          ? stateRef.current.crisisOrigin.characterId
                          : undefined,
                    }
                  : undefined,
            });
            if (result)
              setState((s) => {
                const afterReplies = applyPostReplies(s, post.id, result, contextReplyId);
                // Round 1.11.32 Faza G — bump player replies on ALL posts
                // (not just the targeted one). applyPostReplies handles
                // the focused post's growth; this layer covers older
                // player replies sitting on other posts so the feed
                // doesn't have visibly "frozen" engagement anywhere.
                return {
                  ...afterReplies,
                  posts: bumpAllPlayerReplyLikes(afterReplies.posts, afterReplies.player),
                };
              });
          } finally {
            isFetchingRef.current = false;
            setState((s) => ({ ...s, isGenerating: false }));
          }
          return;
        }

        // Path 2 — flush pre-fetched buffer into the visible feed. The
        // cumulative drain matches the "phone in pocket" UX: if the player
        // left the app idle long enough, every accumulated post lands in
        // one pull. Legacy ambient pending actions (daily-tick /
        // event-aftermath / activity-aftermath from saved games) are
        // dropped here — the bg fetcher owns ambient content now.
        const buffered = stateRef.current.pendingBackgroundPosts;
        const staleActions = stateRef.current.pendingActions.filter(
          (a) => a.kind !== "post-replies",
        );
        if (buffered.length > 0 || staleActions.length > 0) {
          setState((s) => {
            // Round 1.11.32 Faza G — every buffer-drain refresh bumps
            // player reply likes across the whole feed too. The buffered
            // posts have NO player replies (they're fresh AI content),
            // so the bump only effectively touches OLD posts where the
            // player previously commented. Free engagement growth on
            // every pull, no extra AI round-trip.
            const merged = [...s.pendingBackgroundPosts, ...s.posts];
            return {
              ...s,
              posts: bumpAllPlayerReplyLikes(merged, s.player),
              pendingBackgroundPosts: [],
              pendingActions: s.pendingActions.filter((a) => a.kind === "post-replies"),
            };
          });
          return;
        }

        // Path 3 — buffer empty and pool exhausted. Surface a soft toast
        // so the player understands why the pull did nothing. Only fires
        // when there's no in-flight fetch (otherwise the spinner UX is
        // enough signal).
        const pool = stateRef.current.dailyAuthorPool;
        const poolEmpty = pool.celebs.length === 0 && pool.fanSlots <= 0;
        if (
          poolEmpty &&
          !stateRef.current.isFetchingBackgroundPost &&
          !stateRef.current.lastToast
        ) {
          setState((s) => ({
            ...s,
            lastToast: {
              id: `t-quiet-${Date.now()}`,
              headline: "Nothing new today",
              body: "Trigger an event to push the day forward.",
              presenceDeltas: [],
              relationshipDeltas: [],
            },
          }));
        }
        // If isFetchingBackgroundPost is true, we just wait — FeedScreen
        // keeps the spinner spinning until the bg fetcher resolves.
      },

      openPost: (postId) => {
        softHaptic();
        setState((s) => ({ ...s, openPostId: postId }));
      },

      replyToPost: async (postId, text) => {
        if (stateRef.current.isGenerating) return; // hard debounce
        const trimmed = text.trim();
        if (!trimmed) return;
        if (!consumeEnergy(stateRef.current).ok) {
          softHaptic();
          setState((s) => ({ ...s, lastToast: outOfEnergyToast() }));
          return;
        }
        softHaptic();
        // Round 1.11.32 Alpha Fix #5 — initial organic likes roll. The
        // previous `likes: 0` left player replies looking dead even after
        // multiple refreshes (the late-arriving bump from applyPostReplies
        // moved by ~1-2 likes early-game). rollPlayerReplyLikes seeds
        // 5-40 immediately on Day 1, scaling with followers + presence
        // through late game.
        const reply: ThreadReply = {
          id: `r-${Date.now()}`,
          authorId: "player",
          text: trimmed,
          likes: rollPlayerReplyLikes(stateRef.current.player),
          createdAt: nowLabel(),
        };
        setState((s) => {
          const energyApplied = consumeEnergy(s).next;
          return withXP(
            {
              ...energyApplied,
              posts: energyApplied.posts.map((p) =>
                p.id === postId
                  ? { ...p, replies: p.replies + 1, threadReplies: [...p.threadReplies, reply] }
                  : p,
              ),
              pendingActions: [
                { id: `pa-${Date.now()}`, kind: "post-replies", payload: { postId } },
                ...energyApplied.pendingActions,
              ],
              activityLog: [
                logEntry({
                  kind: "post-reply",
                  title: "You replied to a post",
                  body: trimmed,
                  day: energyApplied.day,
                  scoreChanges: [{ label: "Engagement", delta: 4, positive: true }],
                }),
                ...energyApplied.activityLog,
              ],
            },
            4,
          );
        });
      },

      replyToThreadReply: async (postId: string, parentReplyId: string, text: string) => {
        if (stateRef.current.isGenerating) return; // hard debounce
        const trimmed = text.trim();
        if (!trimmed) return;
        if (!consumeEnergy(stateRef.current).ok) {
          softHaptic();
          setState((s) => ({ ...s, lastToast: outOfEnergyToast() }));
          return;
        }
        softHaptic();
        const reply: ThreadReply = {
          id: `r-${Date.now()}`,
          authorId: "player",
          text: trimmed,
          // Same initial roll — sub-replies under celeb threads also need
          // organic engagement, not a flat zero.
          likes: rollPlayerReplyLikes(stateRef.current.player),
          createdAt: nowLabel(),
          parentReplyId,
        };
        setState((s) => {
          const energyApplied = consumeEnergy(s).next;
          return withXP(
            {
              ...energyApplied,
              posts: energyApplied.posts.map((p) =>
                p.id === postId
                  ? { ...p, replies: p.replies + 1, threadReplies: [...p.threadReplies, reply] }
                  : p,
              ),
              pendingActions: [
                {
                  id: `pa-${Date.now()}`,
                  kind: "post-replies",
                  payload: { postId, contextReplyId: parentReplyId },
                },
                ...energyApplied.pendingActions,
              ],
              activityLog: [
                logEntry({
                  kind: "post-reply",
                  title: "You replied to a comment",
                  body: trimmed,
                  day: energyApplied.day,
                  scoreChanges: [{ label: "Engagement", delta: 3, positive: true }],
                }),
                ...energyApplied.activityLog,
              ],
            },
            3,
          );
        });
      },

      likeThreadReply: (postId, replyId) => {
        softHaptic();
        setState((s) => ({
          ...s,
          posts: s.posts.map((p) =>
            p.id !== postId
              ? p
              : {
                  ...p,
                  threadReplies: p.threadReplies.map((r) =>
                    r.id !== replyId
                      ? r
                      : { ...r, liked: !r.liked, likes: Math.max(0, r.likes + (r.liked ? -1 : 1)) },
                  ),
                },
          ),
        }));
      },

      fetchSuggestions: async (kind, context) => {
        // Round 1.11.32 Faza F — pre-fetch consumption for kind="post".
        // We serve pendingPostSuggestions immediately (0ms) and drop the
        // slot. The bg fetcher's next idle tick refills it. We DO NOT
        // pre-fetch kind="event" — those depend on a live context
        // string that's only known at compose time.
        if (kind === "post") {
          const ref0 = stateRef.current;
          if (ref0.pendingPostSuggestions && ref0.pendingPostSuggestions.length > 0) {
            const list = ref0.pendingPostSuggestions;
            setState((s) => ({ ...s, pendingPostSuggestions: null }));
            return list;
          }
        }
        // Round 1.11.9 — guard against double-firing while another AI
        // request is already in flight. Suggestions are non-essential UX
        // so we just bail with empty list rather than queue up.
        if (isFetchingRef.current) return [];
        isFetchingRef.current = true;
        const ref = stateRef.current;
        try {
          return await generateComposeSuggestions({
            player: ref.player,
            world: activeWorld,
            kind,
            context,
            characters: cast,
          });
        } finally {
          isFetchingRef.current = false;
        }
      },

      // ----- modal flags
      setComposeOpen: (composeOpen) => setState((s) => ({ ...s, composeOpen })),
      setEventOpen: (eventOpen) => {
        softHaptic();
        setState((s) => ({ ...s, eventOpen }));
      },
      openCharacterProfile: (characterProfileId) => {
        softHaptic();
        setState((s) => ({ ...s, characterProfileId }));
      },
      setEditProfileOpen: (editProfileOpen) =>
        setState((s) => ({ ...s, editProfileOpen })),
      setCustomizeWorldOpen: (customizeWorldOpen) =>
        setState((s) => ({ ...s, customizeWorldOpen })),
      setActivityLogOpen: (activityLogOpen) =>
        setState((s) => ({ ...s, activityLogOpen })),
      setAppSettingsOpen: (appSettingsOpen) =>
        setState((s) => ({ ...s, appSettingsOpen })),
      setAddCharacterOpen: (addCharacterOpen) =>
        setState((s) => ({ ...s, addCharacterOpen })),
      setCreateActivityOpen: (createActivityOpen) =>
        setState((s) => ({ ...s, createActivityOpen })),
      setEditingCharacterId: (editingCharacterId) =>
        setState((s) => ({ ...s, editingCharacterId })),
      setActiveChatId: (activeChatId) =>
        setState((s) => ({
          ...s,
          activeChatId,
          // When opening a chat from elsewhere, jump to the messages tab and close the profile sheet.
          ...(activeChatId
            ? { activeTab: "messages" as const, characterProfileId: null, phase: "game" as const }
            : {}),
        })),
      toggleMuteCharacter: (id) =>
        setState((s) => {
          const isMuted = s.mutedCharacterIds.includes(id);
          return {
            ...s,
            mutedCharacterIds: isMuted
              ? s.mutedCharacterIds.filter((x) => x !== id)
              : [...s.mutedCharacterIds, id],
          };
        }),
      toggleFavoritePost: (postId) =>
        setState((s) => ({
          ...s,
          favoritedPostIds: s.favoritedPostIds.includes(postId)
            ? s.favoritedPostIds.filter((x) => x !== postId)
            : [...s.favoritedPostIds, postId],
        })),
      toggleFavoriteReply: (replyId) =>
        setState((s) => ({
          ...s,
          favoritedReplyIds: s.favoritedReplyIds.includes(replyId)
            ? s.favoritedReplyIds.filter((x) => x !== replyId)
            : [...s.favoritedReplyIds, replyId],
        })),
      reportPost: (postId) =>
        setState((s) => {
          // Fala 3 — deterministic harm scoring. A post is "justified to
          // report" when it's attacker-toned (the author was already
          // hostile to the player on this post). We probe the post's
          // own threadReplies — if the AUTHOR has any reply tagged
          // attack, OR the post text @mentions the player AND the
          // author has a rivals/enemies chemistry, it's fair game.
          const post = s.posts.find((p) => p.id === postId);
          if (!post) return s;
          if (s.reports.some((r) => r.postId === postId)) return s;
          const contact = s.contacts[post.authorId];
          const hostileChem =
            contact?.chemistry === "rivals" || contact?.chemistry === "enemies";
          const mentionsPlayer =
            post.text.toLowerCase().includes("@player") ||
            post.text
              .toLowerCase()
              .includes(s.player.handle.toLowerCase());
          const justified = hostileChem && mentionsPlayer;
          // Hostile + mentions → reputation reward (society backs you).
          // Otherwise → reputation cost (false flag damages trust).
          const followerDelta = justified ? 50 : -75;
          const auraDelta = justified ? 0.5 : -0.4;
          const newContacts: typeof s.contacts = { ...s.contacts };
          if (contact) {
            const vibeShift = justified ? -3 : -1;
            newContacts[post.authorId] = {
              ...contact,
              vibe: clampPercent(contact.vibe + vibeShift),
            };
          }
          return {
            ...s,
            posts: s.posts.filter((p) => p.id !== postId),
            reports: [
              ...s.reports,
              {
                postId,
                authorId: post.authorId,
                reportedDay: s.day,
                justified,
              },
            ],
            player: {
              ...s.player,
              followers: Math.max(0, s.player.followers + followerDelta),
              socialPresence: {
                ...s.player.socialPresence,
                aura: clampPercent(
                  s.player.socialPresence.aura + auraDelta * 10,
                ),
              },
            },
            contacts: newContacts,
            lastToast: {
              id: `t-report-${Date.now()}`,
              headline: justified ? "Report upheld" : "Report flagged",
              body: justified
                ? "Community backed you. Post removed, author lost vibe."
                : "Community thought this was uncalled for. Small reputation hit.",
              followerDelta,
              presenceDeltas: justified
                ? [{ key: "aura", direction: "up" }]
                : [{ key: "aura", direction: "down" }],
              relationshipDeltas: contact
                ? [
                    {
                      characterId: post.authorId,
                      direction: "down",
                    },
                  ]
                : [],
            },
          };
        }),
      setAutoContactConfig: (id, cfg) =>
        setState((s) => ({
          ...s,
          autoContactConfig: {
            ...s.autoContactConfig,
            [id]: cfg,
          },
        })),
      dismissWinScreen: () =>
        setState((s) => ({
          ...s,
          mainGoalCompletedDay: null,
          // Fala 3 — arming next tier. mainGoalProgress goes back to 0
          // so the progress bar refills against the next threshold.
          // The actual threshold (followers count) is determined by
          // world definition + goalsCompleted multiplier downstream.
          mainGoalProgress: 0,
          goalsCompleted: s.goalsCompleted + 1,
        })),
      applySkillStaging: (deltas) =>
        setState((s) => {
          const total = deltas.bravery + deltas.mystery + deltas.wit;
          if (total <= 0 || total > s.skillPoints) return s;
          return {
            ...s,
            skillPoints: s.skillPoints - total,
            stats: {
              bravery: Math.min(100, s.stats.bravery + deltas.bravery),
              mystery: Math.min(100, s.stats.mystery + deltas.mystery),
              wit: Math.min(100, s.stats.wit + deltas.wit),
            },
          };
        }),
      toggleHideDMsInLog: () =>
        setState((s) => ({ ...s, hideDMsInLog: !s.hideDMsInLog })),
      dismissToast: () => setState((s) => ({ ...s, lastToast: null })),
      dismissOnboarding: () => setState((s) => ({ ...s, onboardingSeen: true })),

      resolveCharacter: (id) => {
        const base = allCharacters.find((c) => c.id === id);
        const outlet = !base ? outletCharacters.find((c) => c.id === id) : undefined;
        // Anonymous fan accounts must render too (avatar + name in reply threads).
        // Without this lookup their IDs would resolve to undefined and the UI
        // would silently drop their comments.
        const fan = !base && !outlet ? anonymousFans.find((c) => c.id === id) : undefined;
        const source = base ?? outlet ?? fan;
        // PURE READ from fanIdentityCache for AI-hallucinated fan IDs that
        // weren't in any of the static catalogs. The cache is populated at
        // WRITE time inside applyPostReplies / applyWorldUpdate, so by the
        // time the UI calls resolveCharacter for one of these IDs the entry
        // already exists in state.fanIdentityCache and we return a stable
        // identity instead of dropping the row.
        if (!source) {
          const cached = state.fanIdentityCache[id];
          if (!cached) return undefined;
          return {
            id,
            name: cached.name,
            handle: cached.handle,
            avatar: cached.avatar,
            banner: "",
            bio: "",
            description: undefined,
            followers: 0,
            verified: false,
            proactive: false,
            systemPrompt: "",
            isOutlet: true, // render as outlet/fan — no profile sheet
          } as Character & { isOutlet?: boolean };
        }
        const override = state.characterOverrides[id] ?? {};
        // Coerce all three shapes (Character / Outlet / Fan) to Character-like.
        const merged = {
          id: source.id,
          name: override.name ?? source.name,
          handle: override.handle ?? source.handle,
          avatar: override.avatar ?? source.avatar,
          banner: override.banner ?? (("banner" in source ? source.banner : "") as string),
          bio: override.bio ?? (("bio" in source ? source.bio : "") as string),
          description:
            override.description ?? (("description" in source ? source.description : undefined) as string | undefined),
          followers: (("followers" in source && typeof source.followers === "number" ? source.followers : 0) as number),
          verified: source.verified,
          proactive: "proactive" in source ? source.proactive : false,
          systemPrompt: "systemPrompt" in source ? source.systemPrompt : "",
          // Outlets and fans both render with the "isOutlet" flag — they aren't
          // members of the player's cast and don't have profile sheets.
          isOutlet: !!outlet || !!fan,
        } as Character & { isOutlet?: boolean };
        return merged;
      },

      updateCharacterOverride: (id, patch) => {
        setState((s) => ({
          ...s,
          characterOverrides: {
            ...s.characterOverrides,
            [id]: { ...(s.characterOverrides[id] ?? {}), ...patch },
          },
        }));
      },

      // ----- Round 1.11.32 Faza D — Stan Wars actions
      prActionsOpen,
      setPRActionsOpen: (open) => setPRActionsOpen(open),

      fetchPRStuntOptions: async () => {
        return generatePRStuntOptions({
          player: stateRef.current.player,
          world: activeWorld,
          crisisOrigin: stateRef.current.crisisOrigin,
          crisisLevel: stateRef.current.crisisLevel,
          recentActions: stateRef.current.activityLog
            .slice(0, 3)
            .map((l) => `${l.title} — ${l.body ?? ""}`),
        });
      },

      triggerPRStunt: (option) => {
        if (stateRef.current.crisisLevel <= 0) return;
        softHaptic();
        setState((s) => {
          // Burn stat costs (clamped to 0 floor) and drop crisisLevel.
          const newHumor = Math.max(0, s.player.socialPresence.humor - option.humorCost);
          const newAura = Math.max(0, s.player.socialPresence.aura - option.auraCost);
          const reduced = applyCrisisDelta(s, -option.effect);
          return {
            ...reduced,
            player: {
              ...reduced.player,
              socialPresence: { humor: newHumor, aura: newAura },
            },
            // Cap prHistory at the last 20 entries — protects save size
            // and matches the user-locked limit.
            prHistory: [
              ...reduced.prHistory,
              {
                day: s.day,
                action: "pr-stunt" as CrisisAction,
                effect: `${option.title} (-${option.effect} crisis)`,
              },
            ].slice(-20),
            activityLog: [
              logEntry({
                kind: "milestone-completed",
                title: `PR move: ${option.title}`,
                body: option.description,
                day: s.day,
                scoreChanges: [
                  { label: "Crisis", delta: -option.effect, positive: true },
                  ...(option.humorCost > 0
                    ? [{ label: "Humor", delta: -option.humorCost, positive: false }]
                    : []),
                  ...(option.auraCost > 0
                    ? [{ label: "Aura", delta: -option.auraCost, positive: false }]
                    : []),
                ],
              }),
              ...reduced.activityLog,
            ],
            lastToast: {
              id: `t-pr-${Date.now()}`,
              headline: `PR move: ${option.title}`,
              body: `Crisis ↓${option.effect}. The cycle moves on.`,
              presenceDeltas: [],
              relationshipDeltas: [],
            },
          };
        });
        setPRActionsOpen(false);
      },

      toggleLayingLow: () => {
        if (stateRef.current.crisisLevel <= 0) return;
        softHaptic();
        setState((s) => ({
          ...s,
          crisisLayingLow: !s.crisisLayingLow,
          prHistory: [
            ...s.prHistory,
            {
              day: s.day,
              action: "laying-low" as CrisisAction,
              effect: !s.crisisLayingLow
                ? "Toggled ON — decay -8/day, followers 0.3x"
                : "Toggled OFF — normal posting resumed",
            },
          ].slice(-20),
          lastToast: {
            id: `t-lay-${Date.now()}`,
            headline: !s.crisisLayingLow ? "Laying low" : "Back online",
            body: !s.crisisLayingLow
              ? "Crisis decays faster but followers trickle."
              : "Normal posting resumed. Crisis still active.",
            presenceDeltas: [],
            relationshipDeltas: [],
          },
        }));
      },

      triggerDivertAttention: async (targetCharacterId) => {
        if (stateRef.current.crisisLevel <= 0) return;
        if (stateRef.current.isGenerating) return;
        // Energy cost = 2 (heavier than a normal PR stunt — divert spends
        // a relationship AND publishes a story).
        const energyAfterFirst = consumeEnergy(stateRef.current);
        if (!energyAfterFirst.ok) {
          softHaptic();
          setState((s) => ({ ...s, lastToast: outOfEnergyToast() }));
          return;
        }
        const energyAfterSecond = consumeEnergy(energyAfterFirst.next);
        if (!energyAfterSecond.ok) {
          softHaptic();
          setState((s) => ({ ...s, lastToast: outOfEnergyToast() }));
          return;
        }
        softHaptic();
        const targetContact = stateRef.current.contacts[targetCharacterId];
        if (!targetContact) return;
        const target = allCharacters.find((c) => c.id === targetCharacterId);
        const targetName = target?.name ?? "your friend";

        // Roll: -20..-30 vibe to target, -30..-50 crisis off the meter.
        const vibeHit = -(20 + Math.floor(Math.random() * 11));
        const crisisDrop = -(30 + Math.floor(Math.random() * 21));
        const newVibe = Math.max(-100, Math.min(100, targetContact.vibe + vibeHit));
        const moodInfo = moodFor(newVibe);
        setState((s) => {
          // Apply energy + vibe hit + crisis drop atomically.
          const afterEnergy = { ...s, energy: energyAfterSecond.next.energy, bonusEnergy: energyAfterSecond.next.bonusEnergy };
          const withDrop = applyCrisisDelta(afterEnergy, crisisDrop);
          return {
            ...withDrop,
            contacts: {
              ...withDrop.contacts,
              [targetCharacterId]: {
                ...targetContact,
                vibe: newVibe,
                vibeDelta: vibeHit,
                vibeReason: `Your team leaked dirt to flip the cycle off you.`,
                currentFeeling: { headline: moodInfo.headline, detail: moodInfo.detail },
                mood: { label: moodInfo.label, reason: moodInfo.detail, delta: vibeHit },
              },
            },
            prHistory: [
              ...withDrop.prHistory,
              {
                day: s.day,
                action: "divert" as CrisisAction,
                targetId: targetCharacterId,
                effect: `Diverted onto @${targetCharacterId} (-${Math.abs(crisisDrop)} crisis, ${vibeHit} vibe)`,
              },
            ].slice(-20),
            activityLog: [
              logEntry({
                kind: "milestone-completed",
                title: `Diverted attention onto ${targetName}`,
                body: `Your PR team flipped the cycle off you.`,
                day: s.day,
                scoreChanges: [
                  { label: "Crisis", delta: crisisDrop, positive: true },
                  { label: `Vibe (${targetName})`, delta: vibeHit, positive: false },
                ],
              }),
              ...withDrop.activityLog,
            ],
            lastToast: {
              id: `t-divert-${Date.now()}`,
              headline: `Heat redirected to ${targetName}`,
              body: `Crisis ↓${Math.abs(crisisDrop)}. ${targetName}'s vibe took the hit.`,
              presenceDeltas: [],
              relationshipDeltas: [{ characterId: targetCharacterId, direction: "down" }],
            },
          };
        });
        setPRActionsOpen(false);

        // Priority leak post: try AI Pop Craze, fall back gracefully if
        // it fails — the crisis drop already landed via setState above,
        // so a network hiccup just means no leak post (acceptable).
        try {
          const cur = stateRef.current;
          const result = await generateSinglePost({
            player: cur.player,
            world: activeWorld,
            characterId: "pop-craze",
            isFan: false,
            relateToEvent: false,
            currentEventContext: `Pop Craze is leaking fresh dirt on @${targetCharacterId} (${targetName}) to flip the cycle off the player.`,
            character: undefined,
            recentPlayerActions: [],
            castCelebIds: Object.keys(cur.contacts),
          });
          const baseId = Date.now();
          const postAuthorSrc = findAnyCharacter("pop-craze");
          const postAuthorFollowers =
            postAuthorSrc && "followers" in postAuthorSrc && typeof postAuthorSrc.followers === "number"
              ? postAuthorSrc.followers
              : 0;
          const threadReplies: ThreadReply[] = result.threadReplies.map((r, i) => {
            const rSrc = findAnyCharacter(r.characterId);
            const rFollowers =
              rSrc && "followers" in rSrc && typeof rSrc.followers === "number"
                ? rSrc.followers
                : 0;
            return {
              id: `tr-${baseId}-${i}`,
              authorId: r.characterId,
              text: r.text,
              likes: rollReplyLikes(r.characterId, rFollowers),
              createdAt: nowLabel(),
            };
          });
          const leakPost: FeedPost = {
            id: `divert-${baseId}-${Math.random().toString(36).slice(2, 6)}`,
            authorId: "pop-craze",
            text: result.text,
            replies: threadReplies.length,
            reposts: `${(Math.random() * 80 + 20).toFixed(1)}K`,
            likes: rollPostLikes("pop-craze", postAuthorFollowers),
            threadReplies,
            createdAt: nowLabel(),
            day: cur.day,
          };
          setState((s2) => {
            const candidates: string[] = [];
            for (const tr of threadReplies) candidates.push(tr.authorId);
            const fic = mintFanIdentities(s2.fanIdentityCache, candidates);
            return {
              ...s2,
              // Inject at FRONT of buffer (priority): next pull surfaces
              // the leak post before any earlier-buffered ambient post.
              pendingBackgroundPosts: [leakPost, ...s2.pendingBackgroundPosts],
              fanIdentityCache: fic,
            };
          });
        } catch (err) {
          console.warn("[divert] leak-post generation failed:", err);
        }
      },

      // ----- event flow
      triggerEvent: async () => {
        // Refactor #4 — synchronous double-tap guard. Mirrors the
        // refreshFeed/sendChatMessage pattern: isFetchingRef flips
        // SYNCHRONOUSLY before any setState commits, so two taps in the
        // same animation frame cannot both pass the gate. The async
        // `state.isGenerating` flag fires later (batched setState),
        // which used to leave a ~30ms window where double-taps both
        // launched generateEvent network calls in parallel.
        if (isFetchingRef.current) return;
        if (stateRef.current.isGenerating) return;
        // Round 1.11.32 Faza G — Medium tier: triggering an event opens a
        // new beat of the day. Player is committing to the next chapter.
        mediumHaptic();
        // Round 1.11.32 Faza F — pre-fetch consumption. If the bg fetcher
        // has already filled pendingNextEvent, surface it instantly (0ms)
        // and drop the slot so the next fetcher tick can prefetch the
        // FOLLOWING event. Loader skipped entirely on the hot path.
        const ref = stateRef.current;
        if (ref.pendingNextEvent) {
          setPendingEvent(ref.pendingNextEvent);
          setState((s) => ({
            ...s,
            eventOpen: true,
            pendingNextEvent: null,
          }));
          return;
        }
        // Fallback path — no prefetch available (network failed, cold
        // start, or player triggered an event before the bg fetcher had
        // cycles). Show the live-fetch loader as before. Lock held for
        // the whole AI round-trip so a second tap during the wait is a
        // no-op.
        isFetchingRef.current = true;
        setState((s) => ({ ...s, eventOpen: true, isGenerating: true }));
        try {
          const event = await generateEvent({
            player: ref.player,
            world: activeWorld,
            day: ref.day,
            recentLog: ref.activityLog.slice(0, 8).map((l) => `Day ${l.day}: ${l.title}`),
          });
          setPendingEvent(event);
        } finally {
          isFetchingRef.current = false;
          setState((s) => ({ ...s, isGenerating: false }));
        }
      },
      completeEvent: async (action) => {
        if (stateRef.current.isGenerating) return;
        // Event itself costs energy — but ALSO refills via bumpDayEnergy on rollover.
        if (!consumeEnergy(stateRef.current).ok) {
          softHaptic();
          setState((s) => ({ ...s, lastToast: outOfEnergyToast(), eventOpen: false }));
          return;
        }
        softHaptic();
        setCompletingEvent(true);
        setState((s) => ({ ...s, isGenerating: true }));
        const ref = stateRef.current;
        const event = pendingEvent ?? {
          eventTitle: "Spotlight Event",
          eventBody: "...",
          choices: [],
        };
        const xpReward = rollEventXp(ref.level);
        try {
          const result = await resolveEventChoice({
            player: ref.player,
            world: activeWorld,
            day: ref.day,
            event,
            choice: action,
            outlets: outletCharacters.map((o) => o.id),
            // Round 1.11.12 — pass cast + contacts so AI can attribute
            // immediate relationship shifts and offline fallback can
            // synthesise them for the toast.
            cast,
            contacts: Object.fromEntries(
              Object.entries(ref.contacts).map(([id, c]) => [
                id,
                { vibe: c.vibe, chemistryLabel: c.chemistryLabel },
              ]),
            ),
          });
          setState((s) => {
            const afterEnergyConsume = consumeEnergy(s).next;
            // Day rollover refills energy with spillover into bonusEnergy.
            const afterDayBump = bumpDayEnergy({ ...afterEnergyConsume, day: afterEnergyConsume.day + 1 });
            let next = afterDayBump;
            const outcomePost: FeedPost | null = result.postText
              ? {
                  id: `event-${Date.now()}`,
                  authorId: result.postAuthorId ?? "pop-craze",
                  text: result.postText,
                  replies: Math.floor(20 + Math.random() * 60),
                  reposts: `${(Math.random() * 50 + 5).toFixed(1)}K`,
                  likes: Math.floor(80000 + Math.random() * 250000),
                  dayLabel: `Day ${next.day}`,
                  threadReplies: [],
                  createdAt: nowLabel(),
                  day: next.day,
                }
              : null;

            // Round 1.11.32 Faza B — daily-tick queueing REMOVED. The
            // bg fetcher useEffect owns world tick now; the old 30%
            // chance to enqueue an extra ambient pull is supplanted by
            // the engine's continuous drain of dailyAuthorPool.

            // Event follower bump (Round 1.10). Events are bigger story
            // beats than regular posts — synthesize a chunkier likeBoost
            // (2k-5k) before rolling so the follower yield is meaningfully
            // larger than applyPostReplies. Late-game (humor=80, aura=80)
            // an event can yield ~500-1500 followers in a single beat —
            // matches "+415" in the original Status post-event screenshot.
            const eventLikeBoost = Math.floor(2000 + Math.random() * 3000);
            // Round 1.11.32 Faza D — apply crisisFollowerMult to event
            // gain too. A major event during a 100/100 blackout still
            // earns some followers (0.1x of 2000-3000 base ~ 200-300)
            // because the event itself is a big news moment, but the
            // mult conveys "the world is half-ignoring you right now".
            const eventFollowerGain = Math.floor(
              rollFollowerGain(eventLikeBoost, next.player) * crisisFollowerMult(next),
            );

            // Round 1.11.12 — apply per-character relationship shifts from the
            // event result. This mirrors what applyPostReplies does for
            // post-reply beats: each shift bumps the contact's vibe, updates
            // their mood/feeling, and produces a relationshipChange entry for
            // the toast (avatar + Δ% + CenteredBar at vibeAfter + rationale).
            const eventShifts = result.relationshipShifts ?? [];
            const contactsAfterEvent = { ...next.contacts };
            const eventRelChanges: NonNullable<
              GameState["lastToast"]
            >["relationshipChanges"] = [];
            for (const sh of eventShifts) {
              const c = contactsAfterEvent[sh.characterId];
              if (!c) continue;
              const newVibe = Math.max(-100, Math.min(100, c.vibe + sh.delta));
              const moodInfo = moodFor(newVibe);
              contactsAfterEvent[sh.characterId] = {
                ...c,
                vibe: newVibe,
                vibeDelta: sh.delta,
                vibeReason: sh.reason,
                currentFeeling: { headline: moodInfo.headline, detail: moodInfo.detail },
                mood: { label: moodInfo.label, reason: moodInfo.detail, delta: sh.delta },
              };
              eventRelChanges.push({
                characterId: sh.characterId,
                delta: sh.delta,
                rationale: sh.reason,
                vibeAfter: newVibe,
              });
            }

            // Round 1.11.32 Faza B — day rollover wipes the pre-fetch
            // bufor + rebuilds the daily pool from scratch. Stale posts
            // generated BEFORE the event are dropped (they referenced an
            // old worldview); the bg fetcher will start filling the new
            // day's queue immediately, with the first 1-2 posts likely
            // hitting relateToEvent=true thanks to currentEventContext.
            const refreshedPool = buildDailyAuthorPool(
              Object.keys(contactsAfterEvent),
              outletCharacters.map((o) => o.id),
            );
            const eventSummary = buildEventSummary({
              eventTitle: event.eventTitle,
              choice: action,
              outcome: result.outcomeText,
            });

            next = {
              ...next,
              player: {
                ...next.player,
                followers: next.player.followers + eventFollowerGain,
              },
              contacts: contactsAfterEvent,
              mainGoalProgress: Math.min(100, next.mainGoalProgress + 16),
              posts: outcomePost ? [outcomePost, ...next.posts] : next.posts,
              eventOpen: false,
              // Drop legacy event-aftermath / daily-tick queueing. The bg
              // fetcher consumes the new pool autonomously; pendingActions
              // is now reserved purely for post-replies beats.
              pendingActions: next.pendingActions.filter((a) => a.kind === "post-replies"),
              // Pre-fetch engine reset.
              dailyAuthorPool: refreshedPool,
              pendingBackgroundPosts: [],
              isFetchingBackgroundPost: false,
              currentEventContext: eventSummary,
              lastBackgroundFetchError: null,
              // Round 1.11.32 Faza F — pre-fetch buckets cleared on
              // event completion. pendingNextEvent has just been consumed
              // (or was stale relative to the new currentEventContext);
              // pendingPostSuggestions reference the OLD context so they
              // would feel off-topic the moment the next compose opens.
              // bg fetcher will refill both within seconds.
              pendingNextEvent: null,
              pendingPostSuggestions: null,
              activityLog: [
                logEntry({
                  kind: "event-created",
                  title: "You created an event",
                  body: event.eventBody,
                  outcome: result.outcomeText,
                  day: ref.day,
                  scoreChanges: result.scoreChanges,
                }),
                ...next.activityLog,
              ],
              lastToast: {
                id: `t-${Date.now()}`,
                headline: result.outcomeText.split(".")[0],
                body: result.outcomeText,
                // Round 1.11 — pithy slogan for collapsed body, falls back to
                // first sentence of outcomeText so legacy AI responses still
                // render gracefully.
                summary: result.summary,
                xpDelta: xpReward,
                followerDelta: eventFollowerGain,
                // Decimal stat deltas (-2..2). AI populates these directly;
                // when undefined we leave them undefined so the toast emoji
                // row stays clean rather than showing 0.0%.
                humorDelta: result.humorDelta,
                auraDelta: result.auraDelta,
                // Round 1.11.12 — relationshipChanges populated from
                // result.relationshipShifts (online AI or offline fallback).
                // Same shape as applyPostReplies → consistent toast UI.
                relationshipChanges: eventRelChanges.length > 0 ? eventRelChanges : undefined,
                presenceDeltas: result.scoreChanges
                  .filter((c) => /humor|aura/i.test(c.label))
                  .slice(0, 2)
                  .map((c) => ({
                    key: /humor/i.test(c.label) ? ("humor" as const) : ("aura" as const),
                    direction: c.positive ? ("up" as const) : ("down" as const),
                  })),
                // Legacy compact array for any code path that still reads it.
                relationshipDeltas: eventShifts.map((sh) => ({
                  characterId: sh.characterId,
                  direction: sh.delta >= 0 ? ("up" as const) : ("down" as const),
                })),
              },
            };
            // Round 1.11.32 Faza D — natural crisis decay on day rollover.
            // Laying low accelerates the meter's cooldown (-8/day) vs the
            // normal passive drift (-3/day). applyCrisisDelta handles the
            // 0-floor transition so the meter cleanly resets to "no crisis"
            // (clearing origin + laying-low flag) when it lands at 0.
            const decay = next.crisisLayingLow ? 8 : 3;
            next = applyCrisisDelta(next, -decay);
            // Crisis trigger from this event's relationship shifts too —
            // an event-misstep that drops a contact below -50 still spikes
            // the meter, even though completeEvent doesn't go through
            // applyPostReplies' detectCrisisTrigger path.
            const eventCrisisOrigin = detectCrisisTrigger(s.contacts, contactsAfterEvent);
            if (eventCrisisOrigin) {
              next = applyCrisisDelta(next, 25, eventCrisisOrigin);
            }
            return withXP(next, xpReward);
          });
        } finally {
          setCompletingEvent(false);
          setPendingEvent(null);
          setState((s) => ({ ...s, isGenerating: false }));
        }
      },
      completeSideQuest: (id) => {
        softHaptic();
        setState((s) => {
          const quest = s.sideQuests.find((q) => q.id === id);
          if (!quest || quest.completed) return s;
          // Round 1.11.32 G-Fix #5 — gate completion behind the quest's
          // condition. Previously the player could tap any quest's
          // checkmark and pocket XP without progress; now the reducer
          // refuses to mutate when the condition is unsatisfied. The UI
          // also disables the button (mirror evaluation in GoalsScreen)
          // — this server-side guard is the defense in depth.
          const { satisfied } = evaluateQuestCondition(quest.condition, s);
          if (!satisfied) return s;
          const updated = s.sideQuests.map((q) =>
            q.id === id ? { ...q, completed: true } : q,
          );
          return withXP(
            {
              ...s,
              sideQuests: updated,
              mainGoalProgress: Math.min(100, s.mainGoalProgress + 4),
              activityLog: [
                logEntry({
                  kind: "side-quest",
                  title: "Side quest completed",
                  body: quest.text,
                  day: s.day,
                  scoreChanges: [{ label: "XP", delta: quest.xp, positive: true }],
                }),
                ...s.activityLog,
              ],
            },
            quest.xp,
          );
        });
      },
      applyMilestonePoints: () => {
        softHaptic();
        setState((s) => {
          if (s.skillPoints <= 0) return s;
          const index = s.milestones.findIndex((m) => !m.completed && !m.skipped);
          if (index < 0) return s;
          const m = s.milestones[index];
          const need = (Object.keys(m.requirements) as SkillKey[]).find(
            (k) => m.applied[k] < m.requirements[k],
          );
          if (!need) return s;
          const nextMilestone: Milestone = {
            ...m,
            applied: { ...m.applied, [need]: m.applied[need] + 1 },
          };
          const completed = (Object.keys(nextMilestone.requirements) as SkillKey[]).every(
            (k) => nextMilestone.applied[k] >= nextMilestone.requirements[k],
          );
          let milestones = s.milestones.map((entry, i) =>
            i === index ? { ...nextMilestone, completed } : entry,
          );
          if (completed) {
            milestones = [...milestones, generateProceduralMilestone(milestones.length - 2)];
          }
          // Fala 3 — milestone event: when a milestone completes, drop
          // a Pop Craze leak post + small follower bump. This is the
          // "event you don't control" — fires automatically. Every
          // 5th milestone additionally seeds an unlock-suggestion
          // notification so the player feels the system reward them
          // with a new contact to add.
          let milestoneAftermathPost: typeof s.posts[number] | null = null;
          let milestoneFollowerBump = 0;
          let milestoneNotif: typeof s.notifications[number] | null = null;
          if (completed) {
            const milestoneTitleSlug = m.title;
            const playerHandle = s.player.handle;
            const headlines = [
              `${playerHandle} just unlocked: ${milestoneTitleSlug}. The timeline is recalibrating.`,
              `Sources confirm ${playerHandle} hit ${milestoneTitleSlug}. Industry takes notice.`,
              `${milestoneTitleSlug} is OFFICIAL for ${playerHandle}. Stans are flooding the algorithm.`,
            ];
            milestoneAftermathPost = {
              id: `p-milestone-${Date.now()}`,
              authorId: "pop-craze",
              text: headlines[Math.floor(Math.random() * headlines.length)],
              createdAt: nowLabel(),
              day: s.day,
              likes: Math.floor(80_000 + Math.random() * 300_000),
              replies: 0,
              reposts: `${(5 + Math.random() * 40).toFixed(1)}K`,
              views: `${(100 + Math.random() * 600).toFixed(0)}K`,
              threadReplies: [],
            };
            milestoneFollowerBump = Math.floor(
              200 + Math.random() * 600 + s.mainGoalProgress * 5,
            );
            // Every 5th milestone — recommend new cast member.
            const totalCleared = milestones.filter((x) => x.completed).length;
            if (totalCleared > 0 && totalCleared % 5 === 0) {
              milestoneNotif = {
                id: `n-unlock-${Date.now()}`,
                charactersInvolved: [],
                headline: "New connections unlocked",
                preview: `Industry's noticing. Tap "+ Add character" in Goals to expand your cast — you've earned the next tier.`,
                postId: undefined,
                createdAt: nowLabel(),
              };
            }
          }
          let next: GameState = {
            ...s,
            milestones,
            skillPoints: s.skillPoints - 1,
            stats: { ...s.stats, [need]: s.stats[need] + 1 },
            mainGoalProgress: completed
              ? Math.min(100, s.mainGoalProgress + 14)
              : s.mainGoalProgress,
            player: completed
              ? {
                  ...s.player,
                  followers: s.player.followers + milestoneFollowerBump,
                }
              : s.player,
            pendingBackgroundPosts: milestoneAftermathPost
              ? [milestoneAftermathPost, ...s.pendingBackgroundPosts]
              : s.pendingBackgroundPosts,
            notifications: milestoneNotif
              ? [milestoneNotif, ...s.notifications]
              : s.notifications,
            activityLog: completed
              ? [
                  logEntry({
                    kind: "milestone-completed",
                    title: "Milestone completed:",
                    body: m.title,
                    outcome: `Your milestone is a masterclass in unintended consequences — fans, still reeling from your last move, now demand answers like a movement.`,
                    day: s.day,
                    scoreChanges: [{ label: "XP", delta: m.xp, positive: true }],
                  }),
                  ...s.activityLog,
                ]
              : s.activityLog,
          };
          if (completed) {
            next = withXP(next, m.xp);
            next = maybeFireWinScreen(next, s.selectedWorldId);
          }
          return next;
        });
      },
      skipMilestone: () => {
        softHaptic();
        setState((s) => {
          const index = s.milestones.findIndex((m) => !m.completed && !m.skipped);
          if (index < 0) return s;
          const milestones = s.milestones.map((entry, i) =>
            i === index ? { ...entry, skipped: true } : entry,
          );
          milestones.push(generateProceduralMilestone(milestones.length - 2));
          return {
            ...s,
            milestones,
            activityLog: [
              logEntry({
                kind: "milestone-skipped",
                title: "Milestone skipped",
                body: s.milestones[index].title,
                day: s.day,
              }),
              ...s.activityLog,
            ],
          };
        });
      },
      improveSkill: (skill) => {
        softHaptic();
        setState((s) => {
          if (s.skillPoints <= 0) return s;
          return {
            ...s,
            skillPoints: s.skillPoints - 1,
            stats: { ...s.stats, [skill]: Math.min(100, s.stats[skill] + 5) },
          };
        });
      },
      updateProfile: (profile) => {
        // Refactor #3 — state mutates synchronously (player sees field
        // update immediately), but SecureStore write is debounced.
        // Faza I #5A — pendingRef shadows the timer so a background
        // AppState transition can flush the latest value even before
        // the 600ms window elapses.
        if (typeof profile.apiKey === "string") {
          apiKeyPendingRef.current = profile.apiKey;
          if (apiKeySaveTimerRef.current) {
            clearTimeout(apiKeySaveTimerRef.current);
          }
          apiKeySaveTimerRef.current = setTimeout(() => {
            flushApiKey();
          }, 600);
        }
        setState((s) => ({ ...s, player: { ...s.player, ...profile } }));
      },
      customizeWorld: ({ mainGoalTitle, setting, difficulty }) => {
        setState((s) => {
          const updateWorld = (w: World): World =>
            w.id === s.selectedWorldId
              ? {
                  ...w,
                  mainGoal: { ...w.mainGoal, title: mainGoalTitle },
                  setting,
                }
              : w;
          return {
            ...s,
            customWorlds: s.customWorlds.map(updateWorld),
            difficulty,
            customizeWorldOpen: false,
          };
        });
      },
      changeChemistry: (characterId, chemistry) => {
        softHaptic();
        setState((s) => {
          const c = s.contacts[characterId];
          if (!c) return s;
          return {
            ...s,
            contacts: {
              ...s.contacts,
              [characterId]: {
                ...c,
                chemistry,
                chemistryLabel: chemistryLabels[chemistry],
              },
            },
          };
        });
      },
      addCharacterFromCatalog: (characterId, chemistry, proactive = false) => {
        softHaptic();
        setState((s) => {
          if (s.contacts[characterId]) return s;
          const character = catalogCharacters.find((c) => c.id === characterId);
          if (!character) return s;
          return {
            ...s,
            contacts: {
              ...s.contacts,
              [characterId]: { ...createContact(character, chemistry), proactive },
            },
            addCharacterOpen: false,
            activityLog: [
              logEntry({
                kind: "character-added",
                title: "Character added",
                body: `${character.name} joined your world as ${chemistryLabels[chemistry]}.`,
                day: s.day,
              }),
              ...s.activityLog,
            ],
          };
        });
      },
      createCustomCharacter: ({
        name,
        handle,
        bio,
        description,
        avatar,
        banner,
        systemPrompt,
      }) => {
        const id = `custom-${Date.now()}`;
        const ch: Character = {
          id,
          name,
          handle,
          bio,
          description,
          avatar,
          banner,
          followers: 0,
          verified: false,
          proactive: false,
          systemPrompt,
        };
        setState((s) => ({
          ...s,
          customCharacters: [...s.customCharacters, ch],
          contacts: { ...s.contacts, [id]: createContact(ch, "friends") },
          addCharacterOpen: false,
        }));
        return id;
      },
      removeCharacter: (id) => {
        setState((s) => {
          const { [id]: _removed, ...rest } = s.contacts;
          return { ...s, contacts: rest };
        });
      },
      sendChatMessage: async (characterId, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        // Round 1.11.9 — sync fetch lock: two rapid sends can't both pass.
        if (isFetchingRef.current) return;
        if (stateRef.current.isGenerating) return;
        if (!consumeEnergy(stateRef.current).ok) {
          softHaptic();
          setState((s) => ({ ...s, lastToast: outOfEnergyToast() }));
          return;
        }
        isFetchingRef.current = true;
        softHaptic();
        const sent: ChatMessage = {
          id: `m-${Date.now()}`,
          sender: "player",
          text: trimmed,
          createdAt: nowLabel(),
        };
        setState((s) => {
          const energyApplied = consumeEnergy(s).next;
          const contact = energyApplied.contacts[characterId];
          if (!contact) return { ...energyApplied, isGenerating: true };
          return withXP(
            {
              ...energyApplied,
              isGenerating: true,
              contacts: {
                ...energyApplied.contacts,
                [characterId]: {
                  ...contact,
                  preview: trimmed,
                  // Keep stored history bounded to last 50 messages per contact.
                  messages: [...contact.messages, sent].slice(-50),
                },
              },
            },
            4,
          );
        });

        const ref = stateRef.current;
        const character = allCharacters.find((c) => c.id === characterId);
        if (!character) {
          isFetchingRef.current = false;
          setState((s) => ({ ...s, isGenerating: false }));
          return;
        }
        const history = [...(ref.contacts[characterId]?.messages ?? []), sent];
        let result;
        try {
          result = await requestCelebrityReply({
            character,
            player: ref.player,
            world: activeWorld,
            messages: history,
            contact: ref.contacts[characterId],
          });
        } finally {
          isFetchingRef.current = false;
          setState((s) => ({ ...s, isGenerating: false }));
        }
        const { reply, relationshipDelta, playerStatChanges } = result;
        const replyMessage: ChatMessage = {
          id: `reply-${Date.now()}`,
          sender: "character",
          text: reply,
          createdAt: nowLabel(),
        };
        setState((s) => {
          const contact = s.contacts[characterId];
          if (!contact) return s;
          const newVibe = Math.max(-100, Math.min(100, contact.vibe + relationshipDelta));
          const mood = moodFor(newVibe);
          const player = playerStatChanges
            ? {
                ...s.player,
                socialPresence: {
                  humor: Math.max(0, Math.min(100, s.player.socialPresence.humor + (playerStatChanges.humor ?? 0))),
                  aura: Math.max(0, Math.min(100, s.player.socialPresence.aura + (playerStatChanges.aura ?? 0))),
                },
              }
            : s.player;
          return {
            ...s,
            player,
            contacts: {
              ...s.contacts,
              [characterId]: {
                ...contact,
                vibe: newVibe,
                vibeDelta: relationshipDelta,
                vibeReason:
                  relationshipDelta > 0.5
                    ? "Your read on them is sharp lately."
                    : relationshipDelta < -0.5
                      ? "You misread the room and they clocked it."
                      : "Holding steady.",
                preview: reply,
                messages: [...contact.messages, replyMessage].slice(-50),
                currentFeeling: { headline: mood.headline, detail: mood.detail },
                mood: { label: mood.label, reason: mood.detail, delta: relationshipDelta },
              },
            },
          };
        });
      },
      createActivity: async ({ title, description, inviteeIds, scheduledDay, scheduledHour }) => {
        softHaptic();
        const activityId = `act-${Date.now()}`;
        const activity: ActivityInvite = {
          id: activityId,
          title,
          description,
          inviteeIds,
          scheduledDay,
          scheduledHour,
          createdDay: stateRef.current.day,
        };
        // Audit-fix B3 — no longer enqueue an "activity-aftermath" pending
        // action. createActivity resolves the AI outcome inline below
        // (generateActivityOutcome → setState), so the queued action was
        // dead weight: refreshFeed Path 2 filters out everything except
        // "post-replies", meaning the activity-aftermath entry sat in the
        // queue forever, occupying a slot and never firing.
        setState((s) => ({
          ...s,
          activities: [activity, ...s.activities],
          createActivityOpen: false,
          activityLog: [
            logEntry({
              kind: "activity-created",
              title: "You created an activity",
              body: `${title} (Day ${scheduledDay}) — invited ${inviteeIds.length} characters.`,
              day: s.day,
            }),
            ...s.activityLog,
          ],
        }));

        const ref = stateRef.current;
        const invitees = inviteeIds
          .map((id) => allCharacters.find((c) => c.id === id))
          .filter(Boolean) as Character[];
        if (invitees.length === 0) return;
        const outcome = await generateActivityOutcome({
          player: ref.player,
          world: activeWorld,
          activity: { title, description, scheduledDay },
          invitees,
          contacts: Object.fromEntries(
            Object.entries(ref.contacts).map(([id, c]) => [
              id,
              { vibe: c.vibe, chemistryLabel: c.chemistryLabel },
            ]),
          ),
        });
        if (!outcome) return;
        setState((s) => {
          const next: ActivityInvite = {
            ...activity,
            outcome: outcome.outcomeText,
            responses: outcome.responses,
            resolved: true,
          };
          let contacts = { ...s.contacts };
          for (const r of outcome.responses ?? []) {
            const c = contacts[r.characterId];
            if (!c) continue;
            const direction = r.accepted ? 1 : -1;
            const delta = direction * (1 + Math.random() * 2);
            const newVibe = Math.max(-100, Math.min(100, c.vibe + delta));
            const moodInfo = moodFor(newVibe);
            contacts[r.characterId] = {
              ...c,
              vibe: newVibe,
              vibeDelta: delta,
              vibeReason: r.message,
              currentFeeling: { headline: moodInfo.headline, detail: moodInfo.detail },
              mood: { label: moodInfo.label, reason: moodInfo.detail, delta },
            };
          }
          // Fala 3 — activity aftermath. 70% chance a Pop Craze leak
          // post drops referencing the player + invitees. Cheap fixed
          // template — no extra AI call. Goes to pendingBackgroundPosts
          // so it lands on the next pull-to-refresh, not magically in
          // the visible feed.
          const aftermathRoll = Math.random();
          let aftermathPost: typeof s.posts[number] | null = null;
          if (aftermathRoll < 0.7 && inviteeIds.length > 0) {
            const partnerNames = inviteeIds
              .slice(0, 2)
              .map((id) => {
                const c = allCharacters.find((x) => x.id === id);
                return c?.handle ?? `@${id}`;
              })
              .join(" + ");
            const player = ref.player;
            const headlines = [
              `${player.handle} spotted at ${title.toLowerCase()} with ${partnerNames} — the timeline is FED.`,
              `Receipts: ${player.handle} and ${partnerNames} pulled up together. Why isn't anyone talking about this?`,
              `${partnerNames} + ${player.handle} = the collab we didn't ask for and now can't unsee.`,
              `Day ${s.day}: ${player.handle} and ${partnerNames} were seen at the same ${title.toLowerCase()}. Coincidence? You decide.`,
            ];
            aftermathPost = {
              id: `p-aftermath-${Date.now()}`,
              authorId: "pop-craze",
              text: headlines[Math.floor(Math.random() * headlines.length)],
              createdAt: nowLabel(),
              day: s.day,
              likes: Math.floor(40_000 + Math.random() * 200_000),
              replies: 0,
              reposts: `${(2 + Math.random() * 30).toFixed(1)}K`,
              views: `${(50 + Math.random() * 400).toFixed(0)}K`,
              threadReplies: [],
            };
          }
          return {
            ...s,
            contacts,
            activities: s.activities.map((a) => (a.id === activityId ? next : a)),
            pendingBackgroundPosts: aftermathPost
              ? [aftermathPost, ...s.pendingBackgroundPosts]
              : s.pendingBackgroundPosts,
            activityLog: [
              logEntry({
                kind: "activity-created",
                title: `Activity outcome: ${title}`,
                body: description,
                outcome: outcome.outcomeText,
                day: s.day,
              }),
              ...s.activityLog,
            ],
            notifications: [
              ...((outcome.responses ?? []).slice(0, 2).map((r) => {
                const ch = allCharacters.find((c) => c.id === r.characterId);
                return {
                  id: `n-act-${Date.now()}-${r.characterId}`,
                  characterId: r.characterId,
                  charactersInvolved: [r.characterId],
                  headline: r.accepted
                    ? `${ch?.name ?? r.characterId} accepted your invitation`
                    : `${ch?.name ?? r.characterId} declined your invitation`,
                  preview: `"${r.message}"`,
                  kind: "activity-response",
                  createdAt: nowLabel(),
                } as NotificationItem;
              })),
              ...s.notifications,
            ],
          };
        });
      },

      rateOutcome: (id, rating) => {
        setState((s) => ({
          ...s,
          activityLog: s.activityLog.map((l) => (l.id === id ? { ...l, rating } : l)),
        }));
      },
      undoLastAction: () => {
        softHaptic();
        setState((s) => ({
          ...s,
          activityLog: s.activityLog.slice(1),
        }));
      },
      generateCustomScenario: async (prompt) => {
        const ref = stateRef.current;
        const generated = await generateScenario({
          player: ref.player,
          prompt,
          catalog: catalogCharacters,
        });
        if (!generated) return null;
        const world: World = {
          id: `custom-${Date.now()}`,
          title: generated.title,
          category: generated.category,
          image: builtinWorlds[0].image,
          description: generated.description,
          audience: generated.audience,
          characters:
            generated.suggestedCharacterIds.length > 0
              ? generated.suggestedCharacterIds
              : ["sabrina", "drake", "billie"],
          mainGoal: {
            title: generated.mainGoalTitle,
            description: generated.mainGoalDescription,
          },
          setting: generated.setting,
          custom: true,
        };
        setState((s) => ({
          ...s,
          customWorlds: [...s.customWorlds, world],
          selectedWorldId: world.id,
          phase: "details",
        }));
        return world;
      },
      resetSave: () => {
        softHaptic();
        const fresh = createInitialState();
        setState(fresh);
        void FileSystem.deleteAsync(GAME_STATE_PATH, { idempotent: true }).catch(() => undefined);
        void SecureStore.deleteItemAsync(API_KEY_SECURE_KEY).catch(() => undefined);
      },
    };
  }, [ready, state, pendingEvent, completingEvent]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

// Tiered like-count for thread replies. CINEMATIC tier (Round 1.10) —
// follower-scaled engagement that matches the original Status game's
// "wow" numbers, not real X analytics.
// - Fans (anonymousFanIds): 0-150 with 5% viral chance (150-700).
// - Celebs: 0.02-0.2% normal, 0.1-0.5% on viral (5% chance). Kanye reply
//   normal 6.5k-65k, viral 32k-164k. Taylor reply normal 59k-588k, viral
//   294k-1.47M. Matches scale ratio between post and reply counts.
// - Outlets / 0-follower: fallback 1k-15k.
function rollReplyLikes(authorId: string, followers?: number): number {
  if (anonymousFanIds.includes(authorId)) {
    const viral = Math.random() < 0.05;
    return viral
      ? Math.floor(150 + Math.random() * 550) // 150–700 (viral fan)
      : Math.floor(Math.random() * 150);       // 0–150 (zwykly fan)
  }
  if (followers && followers > 0) {
    const viral = Math.random() < 0.05;
    const min = viral ? 0.001 : 0.0002;
    const range = viral ? 0.004 : 0.0018;
    return Math.floor(followers * (min + Math.random() * range));
  }
  return Math.floor(1000 + Math.random() * 14000);
}

// Like-count for a standalone POST on the feed. CINEMATIC tier (Round 1.10).
// 1. Fan account (anonymousFanIds) → identical restriction to a fan REPLY:
//    0-150 likes, with a 5% chance to go viral (150-700).
// 2. Outlet / 0-follower account that is NOT a fan → 10k-50k media fallback.
// 3. Celebrity → 3-15% normal, 12-40% on viral (10% chance). Kanye normal
//    1-5M, viral 4-13M. Billie normal 4-18M, viral 15-49M. Taylor normal
//    9-44M, viral 35-117M. Matches the "popcorn energy" of original Status.
function rollPostLikes(authorId: string, followers: number): number {
  if (anonymousFanIds.includes(authorId)) {
    const viral = Math.random() < 0.05;
    return viral
      ? Math.floor(150 + Math.random() * 550) // 150–700 (viral fan post)
      : Math.floor(Math.random() * 150);       // 0–150 (typical fan post)
  }
  if (followers <= 0) {
    return Math.floor(10_000 + Math.random() * 50_000);
  }
  const viral = Math.random() < 0.1;
  const min = viral ? 0.12 : 0.03;
  const range = viral ? 0.28 : 0.12;
  return Math.floor(followers * (min + Math.random() * range));
}

// Player follower growth from a single post-replies refresh or event resolution.
// Formula: floor((likeBoost * 5% + base 50-200) * presenceBonus)
// where presenceBonus = 1 + (humor + aura) / 100. Day 1 (humor=0/aura=0)
// gives 50-200 base. Late game (humor=80/aura=80) multiplies by 2.6x —
// matches the "+415" follower bump from the original Status screenshot.
// Floor of 50 means even an actionless refresh still moves the needle.
// Round 1.11.32 Alpha Fix #5 — organic like growth for the player's own
// replies under any post. Day 1 floor (5-40) keeps comments from sitting
// at zero forever; follower contribution (0.05-0.15% of follower count)
// scales late-game numbers; presence bonus adds extra reach for players
// who've grown Humor/Aura. Late-game player with 500k followers + 40
// humor/aura lands a comment at ~150-1300 likes immediately, then keeps
// climbing on each refresh.
function rollPlayerReplyLikes(player: PlayerProfile): number {
  const base = 5 + Math.floor(Math.random() * 36);
  const fromFollowers = Math.floor(
    player.followers * (0.0005 + Math.random() * 0.001),
  );
  const presence = Math.floor(
    (player.socialPresence.humor + player.socialPresence.aura) * 0.4,
  );
  return base + fromFollowers + presence;
}

// Per-refresh bump under the player's existing replies. Called from
// applyPostReplies whenever a post-replies action processes — so each
// pull-to-refresh that hits a post the player commented on visibly
// adds engagement. Scales with followers + presence so growth keeps
// pace with the player's celebrity-tier journey.
function bumpPlayerReplyLikes(player: PlayerProfile): number {
  const presenceBump = Math.floor(
    Math.max(2, player.socialPresence.humor + player.socialPresence.aura) *
      (0.4 + Math.random() * 0.6),
  );
  const followerBump = Math.floor(
    player.followers * (0.0001 + Math.random() * 0.0004),
  );
  return presenceBump + followerBump;
}

// Round 1.11.32 Faza G — Bump the player's reply likes across EVERY
// post on the feed, not just the one a post-replies action is targeting.
// The original Faza D version (inside applyPostReplies) only touched
// the post being replied to, so older player replies under other posts
// stayed frozen at their initial roll forever. This helper runs on
// every refreshFeed pull (Path 1 + Path 2) so the entire feed's player
// engagement visibly grows together — your replies live their own life.
//
// Each player reply gets its OWN random bump (separate rollPlayerReplyLikes
// dice per reply) rather than one shared value, so the feed feels organic
// rather than uniform. Returns a fresh posts array — caller swaps it in.
function bumpAllPlayerReplyLikes(
  posts: FeedPost[],
  player: PlayerProfile,
): FeedPost[] {
  let touched = false;
  const next = posts.map((p) => {
    let postTouched = false;
    const replies = p.threadReplies.map((tr) => {
      if (tr.authorId !== "player") return tr;
      postTouched = true;
      return { ...tr, likes: tr.likes + bumpPlayerReplyLikes(player) };
    });
    if (!postTouched) return p;
    touched = true;
    return { ...p, threadReplies: replies };
  });
  // Skip the array allocation when no player replies existed.
  return touched ? next : posts;
}

// =============================================================
// Round 1.11.32 Faza D — Crisis engine helpers (pure functions)
// =============================================================

// Inspect a contacts transition: did anyone JUST cross the -50 vibe
// threshold (transitioning from >=-50 to <-50)? Returns the matching
// origin descriptor or null. Skips IDs the player doesn't actually
// have in their cast — the AI hallucinating a feud with someone the
// player never added shouldn't trigger a crisis.
function detectCrisisTrigger(
  prevContacts: GameState["contacts"],
  nextContacts: GameState["contacts"],
): CrisisOrigin | null {
  for (const [id, c] of Object.entries(nextContacts)) {
    const prev = prevContacts[id]?.vibe;
    if (prev === undefined) continue; // contact wasn't in cast before — skip
    if (c.vibe < -50 && prev >= -50) {
      return { kind: "relationship-drop", characterId: id, vibe: c.vibe };
    }
  }
  return null;
}

// Move crisisLevel by `delta` with edge-case handling for the 0 → >0
// onset and >0 → 0 dismissal transitions. Onset stamps the day and
// origin; dismissal clears everything including the laying-low flag.
function applyCrisisDelta(
  s: GameState,
  delta: number,
  origin?: CrisisOrigin,
): GameState {
  // Refactor #1 — applyCrisisDelta is now a 100% pure reducer. The
  // previous version invoked heavyHaptic() inline when crisisLevel
  // crossed 50 upward, which violated reducer purity (this function is
  // called inside setState callbacks; React may invoke them multiple
  // times during concurrent rendering, which would multi-fire the
  // haptic). The threshold-cross side effect now lives in a useEffect
  // inside GameProvider that watches state.crisisLevel.
  const newLevel = Math.max(0, Math.min(100, s.crisisLevel + delta));
  if (s.crisisLevel === 0 && newLevel > 0) {
    return {
      ...s,
      crisisLevel: newLevel,
      crisisOrigin: origin ?? s.crisisOrigin,
      crisisStartedDay: s.day,
    };
  }
  if (newLevel === 0 && s.crisisLevel > 0) {
    return {
      ...s,
      crisisLevel: 0,
      crisisOrigin: null,
      crisisStartedDay: null,
      crisisLayingLow: false,
    };
  }
  return { ...s, crisisLevel: newLevel };
}

// Round 1.11.32 Faza E — DRY helper for crisis reset. Returns the five
// crisis-related fields at their default values. Used at scenario init
// (initializeCharacter), in createInitialState, and any future "wipe
// crisis" code path (e.g. cheats, debug tools). Centralising the shape
// here means adding a new crisis field in the future only requires one
// edit — every call site stays in sync.
function resetCrisisState(): Pick<
  GameState,
  | "crisisLevel"
  | "crisisOrigin"
  | "crisisStartedDay"
  | "crisisLayingLow"
  | "prHistory"
> {
  return {
    crisisLevel: 0,
    crisisOrigin: null,
    crisisStartedDay: null,
    crisisLayingLow: false,
    prHistory: [],
  };
}

// Aggregate follower-gain multiplier based on current crisis state.
//   * crisisLevel === 100  → 0.1x (Absolute Blackout — posts ignored)
//   * crisisLayingLow      → 0.3x (player is silent, growth muted)
//   * otherwise            → 1.0x (normal)
// Blackout takes precedence over laying-low so 100 is always 0.1.
function crisisFollowerMult(s: GameState): number {
  if (s.crisisLevel >= 100) return 0.1;
  if (s.crisisLayingLow) return 0.3;
  return 1;
}

function rollFollowerGain(likeBoost: number, player: PlayerProfile): number {
  const presenceBonus =
    1 + (player.socialPresence.humor + player.socialPresence.aura) / 100;
  const fromLikes = likeBoost * 0.05;
  const base = 50 + Math.random() * 150;
  return Math.floor((fromLikes + base) * presenceBonus);
}

// Deterministic identity assignment for unknown fan/stan author IDs.
// AI sometimes hallucinates handles ("@kanye_truther_4") that aren't in
// the static `anonymousFans` pool. When we see one for the first time
// we hash its ID into the pool to pick a stable avatar + display name
// and write the assignment to fanIdentityCache. Subsequent appearances
// of the same ID reuse the cached identity, so the same handle always
// renders consistently across days. resolveCharacter reads from the
// cache and stays pure — population happens only at WRITE time inside
// the apply* reducers below. Returns either the mutated cache (new
// entries minted) or the original reference (no-op fast path).
function mintFanIdentities(
  cache: GameState["fanIdentityCache"],
  candidateIds: string[],
): GameState["fanIdentityCache"] {
  let next: GameState["fanIdentityCache"] | null = null;
  for (const id of candidateIds) {
    if (!id || id === "player") continue;
    if (findAnyCharacter(id)) continue; // catalog member — nothing to mint
    if (cache[id]) continue;            // already cached
    // djb2-ish hash → stable bucket inside anonymousFans pool.
    let h = 0;
    for (let i = 0; i < id.length; i++) {
      h = ((h << 5) - h + id.charCodeAt(i)) | 0;
    }
    const pick = anonymousFans[Math.abs(h) % anonymousFans.length];
    if (!next) next = { ...cache };
    // Round 1.11.32 Alpha Fix #1 — pretty display.
    // The technical ID stays unique for cache identity (e.g. "fan-12-mppgh6md-xzwl"
    // — distinct from a sibling ad-hoc fan), but the RENDERED name and handle
    // are pulled verbatim from the chosen anonymousFans pool entry. A small
    // 2-digit suffix on the handle disambiguates between multiple ad-hoc IDs
    // that happen to hash to the same pool slot — so the feed shows
    // "@alex_vibe47" and "@alex_vibe82" rather than two identical-looking
    // accounts. Suffix is deterministic (derived from the hash), so the same
    // ad-hoc ID always renders with the same handle across sessions.
    const suffix = (Math.abs(h) % 99).toString().padStart(2, "0");
    next[id] = {
      avatar: pick.avatar,
      name: pick.name,
      handle: `${pick.handle}${suffix}`,
    };
  }
  return next ?? cache;
}

// Round 1.11.32 Faza B — daily pool builder. Picks 6 celeb/outlet IDs from
// the player's cast + a deterministic outlet floor, and allocates 5 fan
// slots. Total cap = 11 posts/day, matching the user-locked design. If the
// cast is too thin to fill 6 celeb slots (e.g. Day 1 with 2 cast members),
// the leftover celeb slots roll over into the fan budget so the day still
// has 11 potential posts.
//
// Outlets (`pop-craze`, `gmz`, etc.) are folded into the celeb side because
// they read as institutional posters in the feed — fans they are not.
function buildDailyAuthorPool(
  castIds: string[],
  outletIds: string[],
): { celebs: string[]; fanSlots: number } {
  const CELEB_TARGET = 6;
  const FAN_TARGET = 5;
  const candidates = [...castIds];
  // Shuffle (Fisher-Yates) so we don't always favor the first half of the cast.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  // Take up to CELEB_TARGET cast members. If cast is short, fill the rest
  // with outlet IDs so the celeb side never stays at 0 for the whole day.
  const celebs: string[] = candidates.slice(0, CELEB_TARGET);
  let needed = CELEB_TARGET - celebs.length;
  if (needed > 0) {
    const shuffledOutlets = [...outletIds];
    for (let i = shuffledOutlets.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledOutlets[i], shuffledOutlets[j]] = [shuffledOutlets[j], shuffledOutlets[i]];
    }
    celebs.push(...shuffledOutlets.slice(0, needed));
    needed = CELEB_TARGET - celebs.length;
  }
  // Roll any STILL-unfilled celeb shortfall into the fan budget — keeps
  // total day cap at ~11 even when both pools are thin.
  const fanSlots = FAN_TARGET + Math.max(0, needed);
  return { celebs, fanSlots };
}

// Round 1.11.32 Faza B — ad-hoc fan handle. Each fan slot mints a fresh
// pseudo-handle that the bg fetcher hands to generateSinglePost. The handle
// is later threaded through mintFanIdentities so it gets a stable avatar +
// display name in fanIdentityCache. Format: "fan-{day}-{epochMs}-{rand}"
// — gives a unique deterministic-looking ID without colliding across days.
function mintAdHocFanId(day: number): string {
  return `fan-${day}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// Round 1.11.32 G-Fix #3 — pick a fan ID that's NOT in the exhaustion
// queue. Falls back to a random pool member if every fan is somehow
// exhausted (e.g. queue size hit pool size after a stress test). Salt
// is used to keep multiple replies inside the same beat from all
// landing on the same "fresh" pick.
function pickFreshFan(exhausted: string[], salt: number): string {
  const fresh = anonymousFanIds.filter((id) => !exhausted.includes(id));
  if (fresh.length === 0) {
    return anonymousFanIds[(salt + Math.floor(Math.random() * anonymousFanIds.length)) % anonymousFanIds.length];
  }
  return fresh[(salt + Math.floor(Math.random() * fresh.length)) % fresh.length];
}

// Round 1.11.32 G-Fix #3 — push fan author IDs into the exhaustion
// queue, dedupe, and clip to 10 entries. Celeb IDs pass through
// unchanged: they have their own follower-scaled posting cadence and
// the user only complained about fan/stan accounts dominating.
function pushExhausted(queue: string[], freshlyUsed: string[]): string[] {
  const fans = freshlyUsed.filter((id) => anonymousFanIds.includes(id));
  if (fans.length === 0) return queue;
  const merged = [...queue];
  for (const id of fans) {
    const existingIdx = merged.indexOf(id);
    if (existingIdx >= 0) merged.splice(existingIdx, 1);
    merged.push(id);
  }
  // Cap at 10 — the older end falls off so a previously-active fan
  // eventually rotates back into eligibility.
  return merged.slice(-10);
}

// Pithy summary of the most recent event — pushed into currentEventContext
// at completeEvent time. Replaces dumping the whole activityLog into the
// single-post prompt (saves ~80-150 tokens per call). Falls back to choice
// text when outcome is empty.
function buildEventSummary(args: {
  eventTitle: string;
  choice: string;
  outcome?: string;
}): string {
  const cleanOutcome = (args.outcome ?? "").split(".")[0].trim();
  return `${args.eventTitle}: player chose "${args.choice}". ${cleanOutcome}`.slice(0, 220);
}

// Fala 3 — main-goal completion helper. Called after any state mutation
// that bumps mainGoalProgress (applyPostReplies, milestone completion,
// completeEvent). When progress crosses 100, flips mainGoalCompletedDay
// + populates lastWinReveal with a scenario-specific reveal (Grammy
// winner in accidentally-famous). UI watches mainGoalCompletedDay !==
// null to render the WinScreen modal.
function maybeFireWinScreen(
  state: GameState,
  worldId: string,
): GameState {
  if (state.mainGoalProgress < 100) return state;
  if (state.mainGoalCompletedDay !== null) return state; // already fired
  // Scenario-aware winner reveal. accidentally-famous → Grammy.
  // bridgerton → Queen's Diamond honour. magic-school → Headmaster choice.
  // Other scenarios get a generic crowning headline.
  const acquaintances = Object.keys(state.contacts);
  const winner = state.player.followers > 50_000_000 || acquaintances.length === 0
    ? "player"
    : acquaintances[Math.floor(Math.random() * acquaintances.length)];
  const reveal =
    worldId === "accidentally-famous"
      ? {
          winnerCharacterId: winner,
          headline:
            winner === "player"
              ? "GRAMMY: YOU WON BEST NEW ARTIST"
              : "GRAMMY: BEST NEW ARTIST GOES TO…",
          body:
            winner === "player"
              ? "Forty million people just watched your name on the world's biggest stage. You're not 'accidentally' anything anymore."
              : "Your name was on the shortlist. The room held its breath. Then the envelope opened on someone else. You're still in this — there's always next year.",
        }
      : {
          winnerCharacterId: winner,
          headline: "Main goal cleared",
          body: "You closed out the chapter you set out to write. The next one starts now.",
        };
  return {
    ...state,
    mainGoalCompletedDay: state.day,
    lastWinReveal: reveal,
  };
}


function applyPostReplies(
  s: GameState,
  postId: string,
  result: Awaited<ReturnType<typeof generatePostReplies>>,
  parentReplyId?: string,
): GameState {
  if (!result) return s;
  let contacts = { ...s.contacts };
  for (const shift of result.relationshipShifts ?? []) {
    const c = contacts[shift.characterId];
    if (!c) continue;
    const newVibe = Math.max(-100, Math.min(100, c.vibe + shift.delta));
    const moodInfo = moodFor(newVibe);
    contacts[shift.characterId] = {
      ...c,
      vibe: newVibe,
      vibeDelta: shift.delta,
      vibeReason: shift.reason,
      currentFeeling: { headline: moodInfo.headline, detail: moodInfo.detail },
      mood: { label: moodInfo.label, reason: moodInfo.detail, delta: shift.delta },
    };
  }
  const baseTime = Date.now();
  // Round 1.11.32 Faza E — PRECISE Stan Wars defender multiplier.
  // Earlier Faza D implementation rewarded ALL fan replies during crisis
  // — including hostile pile-on accounts — turning what should be a
  // "viral defense lifts the player" mechanic into "viral chaos".
  // The new rule fires +2.5x likes ONLY when ALL three conditions hold:
  //   1. crisisLevel > 40
  //   2. reply author is a fan (anonymousFanIds OR ad-hoc fan in cache)
  //   3. AI tagged the reply with tone === "defense"
  // Missing tone / "attack" / "neutral" all degrade to the base 1x —
  // safe fallback if the model hallucinates the tone field.
  const crisisActive = s.crisisLevel > 40;
  // Round 1.11.32 G-Fix #3 — rewrite exhausted fan IDs to fresh ones BEFORE
  // building newReplies. Celeb authors pass through untouched (the user
  // only reported fan-account spam dominance, and celebs have their own
  // follower-scaled posting cadence).
  const sanitizedReplies = (result.replies ?? []).map((r, i) => {
    const isFanAuthor =
      anonymousFanIds.includes(r.characterId) || !!s.fanIdentityCache[r.characterId];
    if (!isFanAuthor) return r;
    if (!s.recentCommenters.includes(r.characterId)) return r;
    return { ...r, characterId: pickFreshFan(s.recentCommenters, i) };
  });
  // Round 1.11.32 G-Fix #4 — two-pass build so AI's parentReplyIndex
  // can be translated into ThreadReply.parentReplyId. Pass 1: assign
  // each new reply a stable ID. Pass 2: build the ThreadReply with the
  // parent linked by index → ID translation. Defense rules + likes
  // calculation stay unchanged.
  const newReplyIds = sanitizedReplies.map((_, i) => `tr-${baseTime}-${i}`);
  const newReplies: ThreadReply[] = sanitizedReplies.map((r, i) => {
    const rSrc = findAnyCharacter(r.characterId);
    const rFollowers =
      rSrc && "followers" in rSrc && typeof rSrc.followers === "number"
        ? rSrc.followers
        : 0;
    const baseLikes = rollReplyLikes(r.characterId, rFollowers);
    const isFanAuthor =
      anonymousFanIds.includes(r.characterId) || !!s.fanIdentityCache[r.characterId];
    const isDefender = crisisActive && isFanAuthor && r.tone === "defense";
    const likes = isDefender ? Math.floor(baseLikes * 2.5) : baseLikes;
    // Resolve parent: explicit AI threading (parentReplyIndex pointing at
    // an earlier reply) wins over the outer `parentReplyId` arg (sub-
    // reply to a specific existing thread). Validate the index is in
    // range and strictly less than current — never forward-reference,
    // never self-reference.
    let resolvedParent: string | undefined = parentReplyId;
    if (
      typeof r.parentReplyIndex === "number" &&
      Number.isInteger(r.parentReplyIndex) &&
      r.parentReplyIndex >= 0 &&
      r.parentReplyIndex < i
    ) {
      resolvedParent = newReplyIds[r.parentReplyIndex];
    }
    return {
      id: newReplyIds[i],
      authorId: r.characterId,
      text: r.text,
      likes,
      createdAt: nowLabel(),
      parentReplyId: resolvedParent,
    };
  });
  // Player-engagement bump: every refresh that processes a post-replies action
  // ALSO dosypuje lajki pod istniejącymi komentarzami gracza w tym poscie.
  // Skala = humor + aura (z socialPresence). Day-1 floor of 5 keeps the first
  // refresh from feeling completely dead. Without this, player's own replies
  // sit at 0 likes forever — applyPostReplies used to pass them through
  // untouched via `...p.threadReplies`.
  // Round 1.11.32 Alpha Fix #5 — bumpPlayerReplyLikes replaces the older
  // playerEngagement formula. The old version capped early-game growth at
  // 0-2 likes/refresh because it depended only on humor+aura (which Day 1
  // sit at 0/0). The new helper folds in followers + presence so player
  // replies visibly grow on every refresh, even from a 0-follower start.
  const posts = s.posts.map((p) => {
    if (p.id !== postId) return p;
    // Refactor #9 — hardened parse + format via utils/formatters.
    const currentReposts = parseRepostCount(p.reposts);
    const bumpedReposts = currentReposts + Math.random() * 50_000;
    const newReposts = result.metrics?.repostBoost ?? formatRepostCount(bumpedReposts);
    const bumpedExisting = p.threadReplies.map((tr) =>
      tr.authorId === "player"
        ? {
            ...tr,
            likes: tr.likes + bumpPlayerReplyLikes(s.player),
          }
        : tr,
    );
    return {
      ...p,
      replies: bumpedExisting.length + newReplies.length,
      threadReplies: [...bumpedExisting, ...newReplies],
      likes: p.likes + (result.metrics?.likeBoost ?? Math.floor(100 + Math.random() * 4000)),
      reposts: newReposts,
    };
  });

  // Notification headline names. Toast uses FIRST names (compact chips);
  // notification panel uses FULL names ("Sabrina Carpenter" not "Sabrina")
  // to match the original Status formatting on screen 3.
  const fullNameFor = (id: string) =>
    catalogCharacters.find((c) => c.id === id)?.name ?? null;
  const firstNameFor = (id: string) =>
    catalogCharacters.find((c) => c.id === id)?.name?.split(" ")[0] ?? null;
  const namedReplies = (result.replies ?? [])
    .map((r) => ({
      id: r.characterId,
      name: firstNameFor(r.characterId),     // for toast chips
      fullName: fullNameFor(r.characterId),  // for notification headline
    }))
    .filter((r): r is { id: string; name: string; fullName: string } =>
      !!r.name && !!r.fullName,
    );
  const headlineNames = namedReplies.slice(0, 3).map((r) => r.name);
  const moreCount = Math.max(0, (result.replies?.length ?? 0) - headlineNames.length);
  const replyHeadline =
    headlineNames.length === 0
      ? "Replies rolling in"
      : headlineNames.length === 1
        ? `${headlineNames[0]} replied`
        : moreCount > 0
          ? `${headlineNames.join(", ")} +${moreCount} replied`
          : `${headlineNames.slice(0, -1).join(", ")} and ${headlineNames[headlineNames.length - 1]} replied`;

  // Notification headline uses FULL names + "and N other(s)" suffix to mirror
  // the original Status format: "Ariana Grande, Beyonce, Speed and one other
  // replied to you" / "Tyler, The Creator, Sabrina Carpenter and 3 others...".
  const notifFullNames = namedReplies.slice(0, 3).map((r) => r.fullName);
  const notifMoreCount = Math.max(0, namedReplies.length - notifFullNames.length);
  const otherSuffix =
    notifMoreCount === 0
      ? ""
      : notifMoreCount === 1
        ? " and one other"
        : ` and ${notifMoreCount} others`;
  const notifHeadline =
    notifFullNames.length === 0
      ? "Replies rolling in to your post"
      : notifFullNames.length === 1
        ? `${notifFullNames[0]}${otherSuffix} replied to you`
        : notifMoreCount > 0
          ? `${notifFullNames.join(", ")}${otherSuffix} replied to you`
          : `${notifFullNames.slice(0, -1).join(", ")} and ${notifFullNames[notifFullNames.length - 1]} replied to you`;

  // Preview line — prepend the replier's name + colon + their reply text,
  // matching the original ("Ariana Grande: @ishowspeed please let him breathe").
  // @mentions inside the text are highlighted blue at render time by AlertsScreen.
  const firstReply = result.replies?.[0];
  const firstReplyName = firstReply ? fullNameFor(firstReply.characterId) : null;
  const previewLine = firstReply
    ? firstReplyName
      ? `${firstReplyName}: ${firstReply.text}`
      : firstReply.text
    : "";
  const notification: NotificationItem | null = namedReplies.length > 0
    ? {
        id: `n-reply-${baseTime}`,
        postId,
        charactersInvolved: namedReplies.slice(0, 4).map((r) => r.id),
        headline: notifHeadline,
        preview: previewLine,
        kind: "post-reply",
        createdAt: nowLabel(),
      }
    : null;

  // Player follower growth (Round 1.10). Every applyPostReplies refresh
  // gives the player some followers — scaled by likeBoost from the AI/fallback
  // and modulated by their Humor+Aura presence. Minimum 50 per refresh so the
  // counter always visibly moves.
  // Round 1.11.32 Faza D — crisisFollowerMult throttles growth when the
  // player is laying low (0.3x) or in absolute blackout (0.1x). Applied
  // BEFORE the floor so a 50-follower base under blackout becomes 5,
  // matching the "you're invisible right now" UX.
  const followerGain = Math.floor(
    rollFollowerGain(result.metrics?.likeBoost ?? 0, s.player) * crisisFollowerMult(s),
  );
  // Sync Social Media Presence + followers bump.
  const player = result.playerStatChanges
    ? {
        ...s.player,
        followers: s.player.followers + followerGain,
        socialPresence: {
          humor: Math.max(
            0,
            Math.min(100, s.player.socialPresence.humor + (result.playerStatChanges.humor ?? 0)),
          ),
          aura: Math.max(
            0,
            Math.min(100, s.player.socialPresence.aura + (result.playerStatChanges.aura ?? 0)),
          ),
        },
      }
    : { ...s.player, followers: s.player.followers + followerGain };
  // Round 1.11 — rich relationship cards for the expanded toast panel.
  // Each card needs: characterId, decimal Δ%, rationale text (we already
  // have shift.reason from the AI), and vibeAfter so the CenteredBar can
  // be positioned. vibeAfter = (the contact's NEW vibe after we applied
  // shift.delta above). We computed `contacts` already so re-read it.
  const relationshipChanges = (result.relationshipShifts ?? [])
    .map((sh) => {
      const cAfter = contacts[sh.characterId];
      if (!cAfter) return null;
      return {
        characterId: sh.characterId,
        delta: sh.delta,
        rationale: sh.reason,
        vibeAfter: cAfter.vibe,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 5);
  // Mint identities for any AI-hallucinated fan IDs in this batch of
  // replies. Same WRITE-time hook as applyWorldUpdate — keeps
  // resolveCharacter pure.
  const fanIdentityCache = mintFanIdentities(
    s.fanIdentityCache,
    newReplies.map((r) => r.authorId),
  );
  // Round 1.11.32 Faza D — crisis detection on relationship-drop. If any
  // contact JUST crossed below -50, transition state into crisis (or
  // amplify if already in crisis). +25 base bump scales the meter
  // visibly off a single feud spike. We pass the new contacts (post-shift)
  // so detectCrisisTrigger sees the crossing.
  // Round 1.11.32 G-Fix #3 — push the (sanitized) fan authors from this
  // batch into the exhaustion queue. Next refresh / next bg fetch sees
  // them as "recently active" and picks DIFFERENT fans.
  const nextExhausted = pushExhausted(
    s.recentCommenters,
    newReplies.map((r) => r.authorId),
  );
  let crisisBumped: GameState = {
    ...s,
    player,
    contacts,
    posts,
    notifications: notification ? [notification, ...s.notifications] : s.notifications,
    fanIdentityCache,
    recentCommenters: nextExhausted,
  };
  const crisisOrigin = detectCrisisTrigger(s.contacts, contacts);
  if (crisisOrigin) {
    crisisBumped = applyCrisisDelta(crisisBumped, 25, crisisOrigin);
  }
  // Fala 3 — check main-goal completion after this bump. Mutates
  // mainGoalCompletedDay + lastWinReveal in place if crossed 100.
  crisisBumped = maybeFireWinScreen(crisisBumped, s.selectedWorldId);
  return {
    ...crisisBumped,
    lastToast: {
      id: `t-${baseTime}`,
      headline: replyHeadline,
      body: result.replies?.[0]?.text ?? "",
      // Pithy slogan body — post-replies result doesn't carry a summary from
      // the AI, so first sentence of the body is used as the collapsed line.
      followerDelta: followerGain,
      // Decimal stat shifts from playerStatChanges (now -2..2 with .1 precision).
      humorDelta: result.playerStatChanges?.humor,
      auraDelta: result.playerStatChanges?.aura,
      relationshipChanges,
      // Legacy compact arrays — still populated for any old code path that
      // reads them. New UI prefers humorDelta/auraDelta/relationshipChanges.
      presenceDeltas: (result.relationshipShifts ?? [])
        .slice(0, 2)
        .map((sh, i) => ({
          key: i === 0 ? ("aura" as const) : ("humor" as const),
          direction: sh.delta >= 0 ? ("up" as const) : ("down" as const),
        })),
      relationshipDeltas: (result.relationshipShifts ?? []).map((sh) => ({
        characterId: sh.characterId,
        direction: sh.delta >= 0 ? ("up" as const) : ("down" as const),
      })),
    },
  };
}

export function useGame() {
  const context = React.use(GameContext);
  if (!context) {
    throw new Error("useGame must be used inside GameProvider");
  }
  return context;
}
