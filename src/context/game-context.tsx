import * as Haptics from "expo-haptics";
// expo-file-system v19 split into a new Paths API; the legacy entry preserves the documentDirectory + read/write/delete helpers we rely on.
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  PropsWithChildren,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
  Character,
  ChatMessage,
  ChemistryType,
  ContactState,
  FeedPost,
  GamePhase,
  GameState,
  GameTab,
  Milestone,
  NotificationItem,
  PlayerProfile,
  Provider,
  ScoreChange,
  SideQuest,
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
  generateScenario,
  generateWorldUpdate,
  buildScenarioThreadReplies,
  requestCelebrityReply,
  resolveEventChoice,
} from "@/services/ai";
// sentiment.ts now only re-exports clampPercent; calculateVibeBump was removed.

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

const initialSideQuests: SideQuest[] = [
  { id: "grammy-puppet", text: "Suggest a certain Grammy winner is just a puppet for their label.", xp: 29 },
  { id: "romance-authenticity", text: "Question the authenticity of a trending celebrity romance.", xp: 54 },
  { id: "stolen-track", text: "Imply a major artist's latest track was actually stolen.", xp: 51 },
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
  };
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
  applySkillStaging: (deltas: { bravery: number; mystery: number; wit: number }) => void;
  toggleHideDMsInLog: () => void;
  dismissToast: () => void;
  resolveCharacter: (id: string) => (Character & { isOutlet?: boolean }) | undefined;
  updateCharacterOverride: (id: string, patch: Partial<{ avatar: string; banner: string; name: string; handle: string; bio: string; description: string }>) => void;

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
  createActivity: (input: { title: string; description: string; inviteeIds: string[]; scheduledDay: number }) => Promise<void>;
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
    skillPoints += 2;
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

function softHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

function logEntry(args: Omit<ActivityLogEntry, "id" | "createdAt">): ActivityLogEntry {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: `${nowLabel()} • ${new Date().toLocaleDateString()}`,
    ...args,
  };
}

export function GameProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<GameState>(createInitialState);
  const [ready, setReady] = useState(false);
  const [pendingEvent, setPendingEvent] = useState<EventOutcome | null>(null);
  const [completingEvent, setCompletingEvent] = useState(false);
  const stateRef = useRef(state);
  // Round 1.11.9 — synchronous fetch lock. React's `isGenerating` setState is
  // async and batched, so two rapid taps on a refresh / send button could
  // both pass the `if (state.isGenerating) return` guard before either
  // setState commits. This ref flips IMMEDIATELY (synchronously) inside
  // refreshFeed / sendChatMessage / fetchSuggestions, eliminating that race.
  // The global `state.isGenerating` is still set/cleared in parallel — that
  // one drives the UI "disabled" affordance; this ref is the contract.
  const isFetchingRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // Game state lives on disk in documentDirectory; API key stays in SecureStore.
      let loadedState: Partial<GameState> | null = null;
      try {
        const raw = await FileSystem.readAsStringAsync(GAME_STATE_PATH);
        loadedState = JSON.parse(raw) as Partial<GameState>;
      } catch {
        /* file missing / corrupted — fall through to initial state */
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
      };
      const serialized = JSON.stringify(snapshot);
      if (serialized === lastSavedHashRef.current) return;
      lastSavedHashRef.current = serialized;
      void FileSystem.writeAsStringAsync(GAME_STATE_PATH, serialized).catch((err) => {
        console.warn("[persist] FileSystem.writeAsStringAsync failed:", err);
      });
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
            contacts: emptyContacts(),
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
            const wasReposted = !!p.reposted;
            const raw = p.reposts ?? "0";
            const num = parseFloat(raw.replace(/[^0-9.]/g, "")) || 0;
            const suffixMatch = raw.match(/[KM]\s*$/i);
            const suffix = suffixMatch ? suffixMatch[0].toUpperCase() : "";
            // Bump unit depends on suffix: 1 raw count == 0.001K == 0.000001M.
            const unit = suffix === "K" ? 0.001 : suffix === "M" ? 0.000001 : 1;
            const delta = wasReposted ? -unit : unit;
            const next = Math.max(0, num + delta);
            const reposts = suffix
              ? `${next.toFixed(1)}${suffix}`
              : `${Math.max(0, Math.round(next))}`;
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
        softHaptic();
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
        // Round 1.11.9 — sync fetch lock fires BEFORE any setState. Two rapid
        // pull-to-refresh taps can't both pass this gate because the ref
        // flips synchronously; the second tap exits immediately.
        if (isFetchingRef.current) return;
        if (stateRef.current.isGenerating) return;
        // Round 1.11.15 — IDLE PULL-TO-REFRESH: if no pending action is
        // queued, treat this as an ambient daily-tick. The feed must still
        // breathe — fans and media post even when the player is idle.
        // No more "silent return on empty queue".
        const next = stateRef.current.pendingActions[0];
        isFetchingRef.current = true;
        setState((s) => ({
          ...s,
          pendingActions: next ? s.pendingActions.slice(1) : s.pendingActions,
          isGenerating: true,
        }));

        try {
          if (next?.kind === "post-replies") {
            const post = stateRef.current.posts.find((p) => p.id === next.payload.postId);
            if (!post) return;
            // Round 1.11.15 — cast.length===0 NO LONGER blocks post-replies.
            // buildOfflinePostReplies returns fan-only replies when cast is
            // empty, so even Day 1 / no-cast players get organic engagement.
            const contextReplyId = next.payload.contextReplyId;
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
            });
            if (result) setState((s) => applyPostReplies(s, post.id, result, contextReplyId));
            return;
          }

          // Round 1.11.30 — AMBIENT pulls back to AI. Paid-tier quota makes
          // the "save free-tier RPM" reasoning from 1.11.23 obsolete. Idle
          // pull-to-refresh now gets full contextual AI content referencing
          // player's recent activity. generateWorldUpdate's own offline
          // fallback (no key / cooldown / parse fail) still catches edge
          // cases. Both ambient and explicit refreshes share one code path.
          const update = await generateWorldUpdate({
            player: stateRef.current.player,
            world: activeWorld,
            day: stateRef.current.day,
            characters: cast,
            contacts: Object.fromEntries(
              Object.entries(stateRef.current.contacts).map(([id, c]) => [
                id,
                { vibe: c.vibe, chemistryLabel: c.chemistryLabel },
              ]),
            ),
            recentPlayerActions: stateRef.current.activityLog
              .slice(0, 6)
              .map((l) => `Day ${l.day}: ${l.title} — ${l.body ?? ""}`),
          });
          if (update) setState((s) => applyWorldUpdate(s, update));
        } finally {
          isFetchingRef.current = false;
          setState((s) => ({ ...s, isGenerating: false }));
        }
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
        const reply: ThreadReply = {
          id: `r-${Date.now()}`,
          authorId: "player",
          text: trimmed,
          likes: 0,
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
          likes: 0,
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

      // ----- event flow
      triggerEvent: async () => {
        softHaptic();
        setState((s) => ({ ...s, eventOpen: true, isGenerating: true }));
        const ref = stateRef.current;
        try {
          const event = await generateEvent({
            player: ref.player,
            world: activeWorld,
            day: ref.day,
            recentLog: ref.activityLog.slice(0, 8).map((l) => `Day ${l.day}: ${l.title}`),
          });
          setPendingEvent(event);
        } finally {
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

            // 30% chance an extra daily-tick is queued (world reacts on its own next refresh).
            const dailyTick = cast.length > 0 && Math.random() < 0.3
              ? [{ id: `pa-${Date.now()}-tick`, kind: "daily-tick" as const, payload: {} as Record<string, never> }]
              : [];

            // Event follower bump (Round 1.10). Events are bigger story
            // beats than regular posts — synthesize a chunkier likeBoost
            // (2k-5k) before rolling so the follower yield is meaningfully
            // larger than applyPostReplies. Late-game (humor=80, aura=80)
            // an event can yield ~500-1500 followers in a single beat —
            // matches "+415" in the original Status post-event screenshot.
            const eventLikeBoost = Math.floor(2000 + Math.random() * 3000);
            const eventFollowerGain = rollFollowerGain(eventLikeBoost, next.player);

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
              pendingActions: cast.length > 0
                ? [
                    { id: `pa-${Date.now()}`, kind: "event-aftermath", payload: { eventChoice: action } },
                    ...dailyTick,
                    ...next.pendingActions,
                  ]
                : next.pendingActions,
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
          let next = {
            ...s,
            milestones,
            skillPoints: s.skillPoints - 1,
            stats: { ...s.stats, [need]: s.stats[need] + 1 },
            mainGoalProgress: completed
              ? Math.min(100, s.mainGoalProgress + 14)
              : s.mainGoalProgress,
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
        if (typeof profile.apiKey === "string") {
          void SecureStore.setItemAsync(API_KEY_SECURE_KEY, profile.apiKey).catch(() => undefined);
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
      createActivity: async ({ title, description, inviteeIds, scheduledDay }) => {
        softHaptic();
        const activityId = `act-${Date.now()}`;
        const activity: ActivityInvite = {
          id: activityId,
          title,
          description,
          inviteeIds,
          scheduledDay,
          createdDay: stateRef.current.day,
        };
        setState((s) => ({
          ...s,
          activities: [activity, ...s.activities],
          createActivityOpen: false,
          pendingActions: [
            { id: `pa-${Date.now()}`, kind: "activity-aftermath", payload: { activityId } },
            ...s.pendingActions,
          ],
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
          return {
            ...s,
            contacts,
            activities: s.activities.map((a) => (a.id === activityId ? next : a)),
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
      : Math.floor(Math.random() * 150);       // 0–150 (zwykły fan)
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
// gives 50-200 base. Late game (humor=80/aura=80) multiplies by 2.6× —
// matches the "+415" follower bump from the original Status screenshot.
// Floor of 50 means even an actionless refresh still moves the needle.
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
    // Derive a friendly display name from the handle: strip leading "@",
    // turn separators into spaces, title-case the words. "@kanye_truther_4"
    // → "Kanye Truther 4".
    const cleanHandle = id.replace(/^@+/, "");
    const display = cleanHandle
      .replace(/[_\-.]+/g, " ")
      .trim()
      .replace(/\b\w/g, (m) => m.toUpperCase()) || cleanHandle;
    next[id] = {
      avatar: pick.avatar,
      name: display,
      handle: `@${cleanHandle}`,
    };
  }
  return next ?? cache;
}

function applyWorldUpdate(
  s: GameState,
  update: Awaited<ReturnType<typeof generateWorldUpdate>>,
  attachedPostId?: string,
): GameState {
  let contacts = { ...s.contacts };
  const relationshipDeltas: WorldUpdateToast["relationshipDeltas"] = [];
  for (const shift of update.relationshipShifts) {
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
    relationshipDeltas.push({
      characterId: shift.characterId,
      direction: shift.delta >= 0 ? "up" : "down",
    });
  }
  const baseId = Date.now();
  const newPosts: FeedPost[] = update.posts.map((p, postIdx) => {
    // Round 1.11.6 — fan distribution is now baked into generateWorldUpdate
    // (60% celebs + exactly 4 fans + shuffle). The legacy 38% programmatic
    // override REMOVED — keeping it on top of the new algorithm would
    // over-flood the feed with fans and violate the "exactly 4" contract.
    // Trust the generator's output verbatim.
    const characterId = p.characterId;
    // Resolve the post author's followers so we can scale both the post's
    // own likes and each reply's likes off the real follower base.
    // findAnyCharacter spans celebs + outlets + fans; fans / outlets fall
    // to 0 → fan-tier or 10k-50k fallback in rollPostLikes.
    const postAuthorSrc = findAnyCharacter(characterId);
    const postAuthorFollowers =
      postAuthorSrc && "followers" in postAuthorSrc && typeof postAuthorSrc.followers === "number"
        ? postAuthorSrc.followers
        : 0;
    // Round 1.11.25 — threadReplies are now generated CLIENT-SIDE for AI
    // posts. The AI contract no longer includes them (saves ~210-525 tokens
    // per call, eliminates MAX_TOKENS truncation pattern). buildOffline
    // world-update path still pre-fills threadReplies inline, so we honor
    // them if present; only synthesize when AI returned a bare post.
    const rawReplies =
      p.threadReplies && p.threadReplies.length > 0
        ? p.threadReplies
        : buildScenarioThreadReplies(
            s.selectedWorldId,
            3 + Math.floor(Math.random() * 3), // 3-5 scenario-aware fan replies
          );
    const threadReplies = rawReplies.map((r, i) => {
      const rSrc = findAnyCharacter(r.characterId);
      const rFollowers =
        rSrc && "followers" in rSrc && typeof rSrc.followers === "number"
          ? rSrc.followers
          : 0;
      return {
        id: `tr-${baseId}-${postIdx}-${i}`,
        authorId: r.characterId,
        text: r.text,
        // Tiered + follower-scaled. Fans stay realistic (0-150), celebs
        // match cinematic reach (0.02-0.2% normal, 0.1-0.5% viral).
        likes: rollReplyLikes(r.characterId, rFollowers),
        createdAt: nowLabel(),
      };
    });
    return {
      id: `gen-${baseId}-${characterId}-${Math.random().toString(36).slice(2, 6)}`,
      authorId: characterId,
      text: p.text,
      // Reply count is authoritative on the array length now — no phantom counters.
      replies: threadReplies.length,
      reposts: `${(Math.random() * 50 + 1).toFixed(1)}K`,
      // Tiered post likes (cinematic). Fans 0-150 (5% viral to 700).
      // Outlets / 0-follower 10k-50k. Celebs 3-15% / 12-40% viral of followers.
      likes: rollPostLikes(characterId, postAuthorFollowers),
      threadReplies,
      createdAt: nowLabel(),
      day: s.day,
    };
  });
  // Round 1.11.25 — notifications DERIVED client-side from relationshipShifts.
  // AI contract no longer includes them (saves ~50-100 tokens per call). We
  // compose a single multi-character notification summarising who reacted,
  // using the first shift's reason as the preview (with @mentions colored
  // blue at render time by AlertsScreen). Backward compat: also honor any
  // notifications the offline path or legacy AI response sent inline.
  const aiNotifications: NotificationItem[] = (update.notifications ?? []).map((n) => ({
    id: `n-${baseId}-${Math.random().toString(36).slice(2, 6)}`,
    postId: attachedPostId,
    charactersInvolved: n.charactersInvolved,
    headline: n.headline,
    preview: n.preview,
    createdAt: nowLabel(),
  }));
  let derivedNotification: NotificationItem | null = null;
  if (aiNotifications.length === 0 && update.relationshipShifts.length > 0) {
    const involved = update.relationshipShifts.slice(0, 4).map((sh) => sh.characterId);
    const names = involved
      .map((id) => catalogCharacters.find((c) => c.id === id)?.name?.split(" ")[0])
      .filter((n): n is string => !!n);
    const headlineNames =
      names.length === 0
        ? "Your contacts"
        : names.length === 1
          ? names[0]
          : names.length === 2
            ? `${names[0]} and ${names[1]}`
            : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    derivedNotification = {
      id: `n-${baseId}-derived-${Math.random().toString(36).slice(2, 6)}`,
      postId: attachedPostId,
      charactersInvolved: involved,
      headline: `${headlineNames} reacted to your day`,
      preview: update.relationshipShifts[0]?.reason ?? "",
      kind: "post-reply",
      createdAt: nowLabel(),
    };
  }
  const notifications: NotificationItem[] = derivedNotification
    ? [derivedNotification, ...aiNotifications]
    : aiNotifications;
  // Apply socialPresence shifts from the AI directly so the Profile gauges actually move.
  const player = update.playerStatChanges
    ? {
        ...s.player,
        socialPresence: {
          humor: Math.max(
            0,
            Math.min(100, s.player.socialPresence.humor + (update.playerStatChanges.humor ?? 0)),
          ),
          aura: Math.max(
            0,
            Math.min(100, s.player.socialPresence.aura + (update.playerStatChanges.aura ?? 0)),
          ),
        },
      }
    : s.player;
  // Mint identities for any AI-hallucinated fan IDs that just landed in
  // the feed (post authors + their thread reply authors). This is the
  // WRITE-time hook: resolveCharacter will see them on the next render
  // without doing any setState itself.
  const candidateIds: string[] = [];
  for (const p of update.posts) candidateIds.push(p.characterId);
  for (const p of newPosts) {
    for (const tr of p.threadReplies) candidateIds.push(tr.authorId);
  }
  const fanIdentityCache = mintFanIdentities(s.fanIdentityCache, candidateIds);
  return {
    ...s,
    player,
    contacts,
    posts: [...newPosts, ...s.posts],
    notifications: [...notifications, ...s.notifications],
    fanIdentityCache,
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
  const newReplies: ThreadReply[] = (result.replies ?? []).map((r, i) => {
    const rSrc = findAnyCharacter(r.characterId);
    const rFollowers =
      rSrc && "followers" in rSrc && typeof rSrc.followers === "number"
        ? rSrc.followers
        : 0;
    return {
      id: `tr-${baseTime}-${i}`,
      authorId: r.characterId,
      text: r.text,
      // Tiered + follower-scaled. Fans: 0-150 (rare 150-700 viral). Celebs:
      // 0.005-0.05% of their followers. See rollReplyLikes.
      likes: rollReplyLikes(r.characterId, rFollowers),
      createdAt: nowLabel(),
      parentReplyId,
    };
  });
  // Player-engagement bump: every refresh that processes a post-replies action
  // ALSO dosypuje lajki pod istniejącymi komentarzami gracza w tym poście.
  // Skala = humor + aura (z socialPresence). Day-1 floor of 5 keeps the first
  // refresh from feeling completely dead. Without this, player's own replies
  // sit at 0 likes forever — applyPostReplies used to pass them through
  // untouched via `...p.threadReplies`.
  const playerEngagement = Math.max(
    5,
    s.player.socialPresence.humor + s.player.socialPresence.aura,
  );
  const posts = s.posts.map((p) => {
    if (p.id !== postId) return p;
    const newReposts =
      result.metrics?.repostBoost ??
      `${(((parseFloat(p.reposts.replace(/[^0-9.]/g, "")) || 0) + Math.random() * 50)).toFixed(1)}K`;
    const bumpedExisting = p.threadReplies.map((tr) =>
      tr.authorId === "player"
        ? {
            ...tr,
            likes:
              tr.likes +
              Math.floor(playerEngagement * (0.1 + Math.random() * 0.4)),
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
  // the original Status format: "Ariana Grande, Beyoncé, Speed and one other
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
  const followerGain = rollFollowerGain(
    result.metrics?.likeBoost ?? 0,
    s.player,
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
  return {
    ...s,
    player,
    contacts,
    posts,
    notifications: notification ? [notification, ...s.notifications] : s.notifications,
    fanIdentityCache,
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
