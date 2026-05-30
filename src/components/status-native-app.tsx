import { Image } from "expo-image";
import {
  ArrowLeft,
  Bell,
  BellOff,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Compass,
  Copy,
  Crown,
  Ellipsis,
  Gift,
  Heart,
  HelpCircle,
  Home,
  Link as LinkIcon,
  LogOut,
  MailPlus,
  MessageCircle,
  Pencil,
  PersonStanding,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Star,
  Store,
  Target,
  Trash2,
  Trophy,
  User,
  Users,
  X,
  Zap,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { evaluateQuestCondition, useGame } from "@/context/game-context";
import {
  allCharacters as catalogAll,
  outletCharacters,
  worlds as builtinWorlds,
} from "@/data/worlds";
import {
  AvatarSource,
  Character,
  ChemistryType,
  FeedPost,
  GameTab,
  PRStuntOption,
  Provider,
  SkillKey,
  WorldDifficulty,
  WorldUpdateToast as WorldUpdateToastT,
} from "@/data/types";
import { colors, radii } from "@/theme/tokens";

import {
  AppText,
  Avatar,
  CapsuleButton,
  Card,
  CenteredBar,
  Chip,
  DeltaPill,
  Divider,
  Field,
  formatCount,
  IconButton,
  imageSource,
  LoadingScreen,
  MilestoneNode,
  ProgressBar,
  Screen,
  SectionTitle,
  StatusLogo,
  VerifiedBadge,
} from "./primitives";

async function pickImageAsync(aspect: [number, number] = [1, 1]): Promise<string | null> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect,
      quality: 0.85,
    });
    if (result.canceled) return null;
    return result.assets[0]?.uri ?? null;
  } catch {
    return null;
  }
}

const skillCopy: Record<SkillKey, string> = {
  bravery: "Trembles slightly when the spotlight hits.",
  mystery: "Keeps them guessing with every silent move.",
  wit: "Sharp enough to cut through the industry fluff.",
};

const difficultyOptions: Array<{
  id: WorldDifficulty;
  label: string;
  caption: string;
  emoji: string;
}> = [
  { id: "easy", label: "Easy", caption: "Relaxed pace", emoji: "😌" },
  { id: "normal", label: "Normal", caption: "Balanced", emoji: "⚖️" },
  { id: "hard", label: "Hard", caption: "Intense", emoji: "😩" },
];

const chemistryOptions: Array<{ id: ChemistryType; label: string; emoji: string }> = [
  { id: "friends", label: "Friends", emoji: "🤝" },
  { id: "rivals", label: "Rivals", emoji: "❌" },
  { id: "spicy", label: "Spicy", emoji: "🌶️" },
  { id: "lovers", label: "Lovers", emoji: "💗" },
  { id: "enemies", label: "Enemies", emoji: "💢" },
];

// ===================================================================
//  LANDING
// ===================================================================

function LandingScreen() {
  const { setPhase } = useGame();
  const insets = useSafeAreaInsets();
  return (
    <Screen scroll={false}>
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 56,
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 28,
          justifyContent: "space-between",
        }}
      >
        <View style={{ gap: 18 }}>
          <StatusLogo size={48} />
          <AppText size={34} weight="900" style={{ maxWidth: 330 }}>
            Become the timeline.
          </AppText>
          <AppText size={17} color={colors.muted2} style={{ maxWidth: 330 }}>
            A free single-player celebrity social sim with unlimited moves, real XP, and private AI keys.
          </AppText>
        </View>

        <View style={{ gap: 16 }}>
          <Card style={{ gap: 12, backgroundColor: colors.surfaceAlt }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 25,
                  backgroundColor: colors.blue,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Sparkles color={colors.text} size={24} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText size={20} weight="800">
                  status
                </AppText>
                <AppText color={colors.muted2} size={14}>
                  Sims, but social media.
                </AppText>
              </View>
            </View>
          </Card>
          <CapsuleButton onPress={() => setPhase("hub")}>Enter Game</CapsuleButton>
        </View>
      </View>
    </Screen>
  );
}

// ===================================================================
//  HUB
// ===================================================================

function HubTopBar({ onSettings }: { onSettings: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <StatusLogo size={32} />
      <Pressable
        style={{
          marginLeft: 6,
          backgroundColor: colors.surfaceAlt,
          height: 36,
          borderRadius: radii.pill,
          paddingHorizontal: 12,
          alignItems: "center",
          flexDirection: "row",
          gap: 6,
        }}
      >
        <PersonStanding color={colors.muted2} size={18} />
        <ChevronDown color={colors.muted2} size={16} />
      </Pressable>
      <View style={{ flex: 1 }} />
      <IconButton size={38}>
        <Search color={colors.muted2} size={20} />
      </IconButton>
      <IconButton size={38} onPress={onSettings}>
        <Settings color={colors.muted2} size={20} />
      </IconButton>
    </View>
  );
}

function ScenarioCard({ worldId, compact }: { worldId: string; compact?: boolean }) {
  const { selectWorld, state, allCharacters } = useGame();
  const world =
    state.customWorlds.find((w) => w.id === worldId) ??
    builtinWorlds.find((w) => w.id === worldId);
  if (!world) return null;
  const cast = world.characters
    .map((id: string) => allCharacters.find((c) => c.id === id))
    .filter(Boolean) as Character[];

  return (
    <Pressable
      onPress={() => selectWorld(world.id)}
      style={({ pressed }) => ({
        width: compact ? 220 : 270,
        borderRadius: radii.lg,
        borderCurve: "continuous",
        overflow: "hidden",
        backgroundColor: colors.surface,
        borderColor: colors.borderSoft,
        borderWidth: 1,
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <View>
        <Image
          source={{ uri: world.image }}
          contentFit="cover"
          style={{ height: compact ? 140 : 168, backgroundColor: colors.surfaceAlt }}
        />
        <View
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            borderRadius: radii.pill,
            backgroundColor: "rgba(15,15,18,0.78)",
            paddingHorizontal: 12,
            paddingVertical: 7,
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
          }}
        >
          <AppText size={12} color={colors.amber}>
            ✦
          </AppText>
          <AppText size={13} weight="800">
            {world.category}
          </AppText>
        </View>
      </View>
      <View style={{ padding: 14, gap: 8 }}>
        <AppText size={20} weight="900" numberOfLines={1}>
          {world.title}
        </AppText>
        <AppText size={14} color={colors.muted2} numberOfLines={2}>
          {world.description}
        </AppText>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
          <View style={{ flexDirection: "row", marginRight: 8 }}>
            {cast.slice(0, 4).map((character, index) => (
              <View key={character.id} style={{ marginLeft: index === 0 ? 0 : -10 }}>
                <Avatar uri={character.avatar} size={26} ring={colors.surface} ringWidth={2} />
              </View>
            ))}
            <View
              style={{
                marginLeft: -10,
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: colors.blue,
                borderWidth: 2,
                borderColor: colors.surface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AppText size={10} weight="900">
                +{Math.max(1, cast.length - 4)}
              </AppText>
            </View>
          </View>
          <AppText size={12} color={colors.muted2}>
            {cast.length} Characters
          </AppText>
          <View style={{ flex: 1 }} />
          <User size={12} color={colors.muted} />
          <AppText size={12} color={colors.muted2} style={{ marginLeft: 4 }}>
            {world.audience}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

function HubScreen() {
  const { state, playActiveWorld, setPhase, resolveCharacter } = useGame();
  const allWorlds = [...builtinWorlds, ...state.customWorlds];

  return (
    <Screen>
      <HubTopBar onSettings={() => setPhase("setup")} />

      <SectionTitle title="Continue playing" action="View all" />
      <Card style={{ gap: 14 }}>
        <View
          style={{
            borderRadius: radii.pill,
            backgroundColor: colors.surfaceAlt,
            paddingVertical: 8,
            paddingHorizontal: 14,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <AppText size={13} color={colors.amber}>
            ✦
          </AppText>
          <AppText size={14} weight="800" style={{ marginLeft: 6 }}>
            Celebrities
          </AppText>
          <View style={{ flex: 1 }} />
          <AppText size={14} weight="800" color={colors.amber}>
            ☀ {state.day}
          </AppText>
          <AppText size={14} weight="800" color={colors.blue} style={{ marginLeft: 14 }}>
            ⚡ {state.level}
          </AppText>
        </View>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Avatar uri={state.player.avatar} size={56} ring={colors.blue} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText size={18} weight="900">
              {state.player.name}
            </AppText>
            <View style={{ flexDirection: "row", marginTop: 2 }}>
              {state.contacts &&
                Object.keys(state.contacts)
                  .slice(0, 3)
                  .map((id, i) => {
                    const c = resolveCharacter(id);
                    if (!c) return null;
                    return (
                      <View key={id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                        <Avatar uri={c.avatar} size={20} ring={colors.surface} ringWidth={2} />
                      </View>
                    );
                  })}
              <AppText size={13} color={colors.muted2} style={{ marginLeft: 8 }}>
                {formatCount(state.player.followers)} Followers
              </AppText>
            </View>
          </View>
          <Ellipsis color={colors.muted2} size={20} />
        </View>
        <AppText size={14} color={colors.muted2}>
          {state.player.bio}
        </AppText>
        <CapsuleButton onPress={playActiveWorld}>Play</CapsuleButton>
      </Card>

      <SectionTitle title="Featured Worlds" action="Explore more" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 14 }}
      >
        {allWorlds.map((world) => (
          <ScenarioCard key={world.id} worldId={world.id} />
        ))}
      </ScrollView>

      <SectionTitle title="Popular" action="Explore more" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 14 }}
      >
        {[...allWorlds].reverse().map((world) => (
          <ScenarioCard key={`popular-${world.id}`} worldId={world.id} compact />
        ))}
      </ScrollView>

      <Pressable
        onPress={() => setPhase("scenarioBuilder")}
        style={({ pressed }) => ({
          position: "absolute",
          right: 18,
          bottom: 24,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: radii.pill,
          backgroundColor: colors.surfaceSoft,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          opacity: pressed ? 0.86 : 1,
        })}
      >
        <Plus color={colors.text} size={18} />
        <AppText size={14} weight="800">
          Create my own
        </AppText>
      </Pressable>
    </Screen>
  );
}

// ===================================================================
//  SCENARIO BUILDER
// ===================================================================

function ScenarioBuilderScreen() {
  const { setPhase, generateCustomScenario, state } = useGame();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const world = await generateCustomScenario(prompt.trim());
      if (!world) {
        setError("Couldn't reach the AI. Add an API key in App Settings first.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <IconButton onPress={() => setPhase("hub")}>
          <ArrowLeft color={colors.text} size={20} />
        </IconButton>
        <View style={{ flex: 1 }} />
        <StatusLogo />
      </View>
      <View style={{ gap: 8 }}>
        <AppText size={26} weight="900">
          Create my own
        </AppText>
        <AppText size={15} color={colors.muted2}>
          Describe your world. The AI will set a main goal, pick a cast from the catalog, and drop you in.
        </AppText>
      </View>
      <Field
        value={prompt}
        onChangeText={setPrompt}
        placeholder="e.g. A glittery pop renaissance where Sabrina, Drake, and Beyoncé are forced to share one record label after a leaked merger"
        multiline
      />
      {error ? (
        <AppText size={13} color={colors.red}>
          {error}
        </AppText>
      ) : null}
      <CapsuleButton onPress={go} disabled={loading || !prompt.trim()}>
        {loading ? "Generating..." : "Generate scenario"}
      </CapsuleButton>
      {!state.player.apiKey ? (
        <AppText size={13} color={colors.muted}>
          No API key set yet. Open App Settings to add one.
        </AppText>
      ) : null}
    </Screen>
  );
}

// ===================================================================
//  SCENARIO DETAILS
// ===================================================================

function ScenarioDetailsScreen() {
  const { activeWorld, playActiveWorld, setPhase, allCharacters } = useGame();
  const cast = activeWorld.characters
    .map((id) => allCharacters.find((c) => c.id === id))
    .filter(Boolean) as Character[];

  return (
    <Screen
      footer={
        <BottomAction>
          <CapsuleButton onPress={playActiveWorld}>Play</CapsuleButton>
        </BottomAction>
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <IconButton onPress={() => setPhase("hub")}>
          <ArrowLeft color={colors.text} size={20} />
        </IconButton>
        <View style={{ flex: 1 }} />
        <StatusLogo dimmed />
        <View style={{ flex: 1 }} />
        <IconButton>
          <Search color={colors.muted2} size={18} />
        </IconButton>
        <View style={{ width: 10 }} />
        <IconButton>
          <Settings color={colors.muted2} size={18} />
        </IconButton>
      </View>

      <View
        style={{
          marginHorizontal: -18,
          height: 260,
          backgroundColor: colors.surface,
        }}
      >
        <Image
          source={{ uri: activeWorld.image }}
          contentFit="cover"
          style={{ width: "100%", height: "100%" }}
        />
        <Chip
          color="rgba(15,15,18,0.78)"
          style={{ position: "absolute", left: 16, bottom: 16, paddingHorizontal: 12, paddingVertical: 7 }}
        >
          <AppText size={12} color={colors.amber}>
            ✦{" "}
          </AppText>
          {activeWorld.category}
        </Chip>
      </View>

      <View style={{ gap: 10 }}>
        <AppText size={26} weight="900">
          {activeWorld.title}
        </AppText>
        <AppText size={15} color={colors.muted2}>
          {activeWorld.description}
        </AppText>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flexDirection: "row" }}>
            {cast.slice(0, 4).map((c, i) => (
              <View key={c.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                <Avatar uri={c.avatar} size={22} ring={colors.bg} ringWidth={2} />
              </View>
            ))}
            {cast.length > 4 ? (
              <View
                style={{
                  marginLeft: -8,
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 2,
                  borderColor: colors.bg,
                  backgroundColor: colors.blue,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AppText size={10} weight="900">
                  +{cast.length - 4}
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText size={13} color={colors.muted2}>
            {cast.length} Characters
          </AppText>
          <View style={{ flex: 1 }} />
          <User color={colors.muted} size={14} />
          <AppText size={13} color={colors.muted2}>
            {activeWorld.audience}
          </AppText>
        </View>
      </View>

      <Divider />

      {cast.map((c) => (
        <View key={c.id} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Avatar uri={c.avatar} size={50} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <AppText size={16} weight="900">
                {c.name}
              </AppText>
              {c.verified ? <VerifiedBadge /> : null}
            </View>
            <AppText size={13} color={colors.muted}>
              {c.handle}
            </AppText>
            <AppText size={13} color={colors.muted2} numberOfLines={2}>
              {c.bio}
            </AppText>
          </View>
        </View>
      ))}
    </Screen>
  );
}

// ===================================================================
//  CHARACTER SETUP
// ===================================================================

function CharacterSetupScreen() {
  const { avatarChoices, initializeCharacter, setPhase, state } = useGame();
  const [name, setName] = useState(state.player.name);
  const [handle, setHandle] = useState(state.player.handle);
  const [bio, setBio] = useState(state.player.bio);
  const [avatar, setAvatar] = useState(state.player.avatar);

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <IconButton onPress={() => setPhase("details")}>
          <ArrowLeft color={colors.text} size={20} />
        </IconButton>
        <View style={{ flex: 1 }} />
        <StatusLogo />
      </View>
      <View style={{ gap: 8 }}>
        <AppText size={26} weight="900">
          Create your character
        </AppText>
        <AppText size={14} color={colors.muted2}>
          This starts a clean save at Level 1, 0/50 XP, Day 1.
        </AppText>
      </View>
      <Card style={{ gap: 16 }}>
        <View style={{ alignItems: "center", gap: 12 }}>
          <Avatar uri={avatar} size={92} ring={colors.blue} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {avatarChoices.map((choice) => (
              <Pressable key={choice} onPress={() => setAvatar(choice)}>
                <Avatar uri={choice} size={46} ring={avatar === choice ? colors.amber : undefined} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <Field value={name} onChangeText={setName} placeholder="Enter your name..." />
        <Field value={handle} onChangeText={setHandle} placeholder="@handle" />
        <Field value={bio} onChangeText={setBio} placeholder="Short bio" multiline />
      </Card>
      {(() => {
        // Validation: name + handle required. Blank slate — no "Frank"
        // fallback. The button disables itself until both are present so
        // the player commits to their own identity before Day 1.
        const trimmedName = name.trim();
        const trimmedHandleRaw = handle.trim();
        const trimmedHandle = trimmedHandleRaw.replace(/^@+/, "");
        const ready = trimmedName.length > 0 && trimmedHandle.length > 0;
        return (
          <CapsuleButton
            disabled={!ready}
            onPress={() =>
              initializeCharacter({
                name: trimmedName,
                handle: `@${trimmedHandle}`,
                avatar,
                bio: bio.trim(),
              })
            }
          >
            Start Day 1
          </CapsuleButton>
        );
      })()}
    </Screen>
  );
}

function BottomAction({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 18,
        paddingTop: 12,
        paddingBottom: insets.bottom + 14,
        backgroundColor: colors.bg,
        borderTopColor: colors.divider,
        borderTopWidth: 1,
      }}
    >
      {children}
    </View>
  );
}

// ===================================================================
//  GAME SHELL + TAB BAR
// ===================================================================

function GameShell() {
  const { state, setActiveTab } = useGame();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Round 1.11.32 G-Fix #7 — Feed stays MOUNTED across tab switches,
          just hidden via display:none. The ~30-post scrollable feed was
          the worst tab-swap hiccup because every entry had to be
          re-resolved (resolveCharacter), re-rolled, and re-rendered on
          return. Keeping it mounted trades a small memory footprint for
          instant tab restoration. Other tabs (Goals/Messages/Alerts/
          Profile) are still conditional-mount because they're smaller
          screens and the cost is negligible. */}
      <View
        style={{ flex: 1, display: state.activeTab === "feed" ? "flex" : "none" }}
      >
        <FeedScreen />
      </View>
      {state.activeTab === "goals" ? <GoalsScreen /> : null}
      {state.activeTab === "messages" ? <MessagesScreen /> : null}
      {state.activeTab === "alerts" ? <AlertsScreen /> : null}
      {state.activeTab === "profile" ? <ProfileScreen /> : null}

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 62 + insets.bottom,
          paddingBottom: insets.bottom,
          backgroundColor: colors.bgDeep,
          borderTopColor: colors.divider,
          borderTopWidth: 1,
          flexDirection: "row",
          justifyContent: "space-around",
          alignItems: "center",
        }}
      >
        <TabButton tab="feed" icon={<Home />} />
        <TabButton tab="goals" icon={<Target />} />
        <TabButton tab="messages" icon={<MessageCircle />} />
        <TabButton tab="alerts" icon={<Bell />} />
        <TabButton tab="profile" icon={<User />} />
      </View>

      <CharacterProfileModal />
      <EditProfileModal />
      <CustomizeWorldModal />
      <ActivityLogModal />
      <AppSettingsModal />
      <AddCharacterModal />
      <CreateActivityModal />
      <EditCharacterModal />
      {/* Hoisted from FeedScreen — these need to mount on every tab.
          PostDetailModal: opening a post from Profile/Notifications/Goals
          was a no-op when this lived under <FeedScreen /> because the
          subtree unmounted on tab switch.
          WorldUpdateToast: post-event toasts should appear regardless of
          which tab the player is on.
          ComposeModal / EventModal: triggered from Feed but kept here for
          architectural consistency with all other modals. */}
      <ComposeModal />
      <EventModal />
      <WorldUpdateToast />
      <PostDetailModal />
      {/* Round 1.11.32 Faza D — PR Actions modal mounted at shell level
          so any screen can open it (CrisisBar tap, future toast CTAs). */}
      <PRActionsModal />
      {/* Fala 3 — main-goal win screen. Auto-triggers when
          mainGoalCompletedDay flips from null to a day number. */}
      <WinScreenModal />
      {/* F1 — first-run tutorial overlay. Self-gates on onboardingSeen. */}
      <OnboardingOverlay />
    </View>
  );

  function TabButton({
    tab,
    icon,
  }: {
    tab: GameTab;
    icon: React.ReactElement<{ color?: string; size?: number; fill?: string }>;
  }) {
    const active = state.activeTab === tab;
    const showDot = tab === "alerts" && state.notifications.length > 0;
    // F11 — readable tab names for screen readers.
    const tabLabel: Record<GameTab, string> = {
      feed: "Feed",
      goals: "Goals",
      messages: "Messages",
      alerts: "Notifications",
      profile: "Profile",
    };
    return (
      <Pressable
        onPress={() => setActiveTab(tab)}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={tabLabel[tab]}
        style={({ pressed }) => ({
          width: 56,
          height: 56,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        {React.cloneElement(icon, {
          color: active ? colors.text : colors.muted,
          size: active ? 26 : 24,
          fill: active && (tab === "feed" || tab === "goals" || tab === "profile") ? colors.text : "transparent",
        })}
        {showDot ? (
          <View
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.red,
              borderWidth: 1,
              borderColor: colors.bgDeep,
            }}
          />
        ) : null}
      </Pressable>
    );
  }
}

// ===================================================================
//  TOP HEADERS (Feed + Goals share patterns)
// ===================================================================

function FeedHeader() {
  const { state, setActivityLogOpen, setAppSettingsOpen } = useGame();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 18,
        paddingBottom: 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <AppText size={22} weight="900">
          ☀️ Day {state.day}
        </AppText>
        <View style={{ width: 10 }} />
        <NetworkStatusChip online={state.aiOnline} />
        <View style={{ flex: 1 }} />
        <EnergyBadge />
        <View style={{ width: 8 }} />
        <IconButton size={36} onPress={() => setActivityLogOpen(true)}>
          <BookOpen color={colors.muted2} size={18} />
        </IconButton>
        <View style={{ width: 8 }} />
        {/* Fala 1 #10 — replaced Store (marketplace placeholder, never
            wired) with Settings cog. The icon now matches the action
            it performs. */}
        <IconButton size={36} onPress={() => setAppSettingsOpen(true)}>
          <Settings color={colors.muted2} size={18} />
        </IconButton>
      </View>
      {/* Round 1.11.32 Faza D — CrisisBar slides in below the Day chip
          whenever the player is on fire. Tappable → opens PRActionsModal. */}
      <CrisisBar />
    </View>
  );
}

// Faza J #3 — ONLINE/OFFLINE chip in the feed header. Renders a small
// pill with a coloured dot + status word so the player knows whether
// the timeline is breathing live LLM output (green/ONLINE) or coasting
// on the local fallback bank (amber/OFFLINE). Driven by the global
// `state.aiOnline` flag — updated by the bg fetcher after every result.
function NetworkStatusChip({ online }: { online: boolean }) {
  const dotColor = online ? colors.green : colors.amber;
  const label = online ? "ONLINE" : "OFFLINE";
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={
        online ? "AI online" : "AI offline — local mode"
      }
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: colors.surfaceAlt,
      }}
    >
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 7,
          backgroundColor: dotColor,
        }}
      />
      <AppText size={10} weight="900" color={online ? colors.green : colors.amber}>
        {label}
      </AppText>
    </View>
  );
}

// Round 1.11.32 Faza D — visible only when crisisLevel > 0. Renders a
// red pill with the meter value + a tiny "PR →" CTA on the right. At
// level ≥ 70 the background shifts to a louder red gradient. The whole
// pill is the press target.
function CrisisBar() {
  const { state, setPRActionsOpen } = useGame();
  // Fala 3 — calm-state render when crisisLevel <= 0. Previously
  // returned null so the system was completely invisible until the
  // player triggered a -50 vibe drop. New behaviour: always show a
  // subtle status pill so the player knows the system EXISTS and can
  // explore PR Actions even without an active fire.
  if (state.crisisLevel <= 0) {
    return (
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync().catch(() => undefined);
          setPRActionsOpen(true);
        }}
        style={({ pressed }) => ({
          marginTop: 10,
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 12,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.divider,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <AppText size={13}>🟢</AppText>
        <AppText size={12} weight="800" color={colors.muted}>
          Vibe: clear (0/100)
        </AppText>
        <View style={{ flex: 1 }} />
        <AppText size={11} color={colors.muted2}>
          PR Actions →
        </AppText>
      </Pressable>
    );
  }
  const blackout = state.crisisLevel >= 100;
  const critical = state.crisisLevel >= 70;
  const layingLow = state.crisisLayingLow;
  return (
    <Pressable
      onPress={() => {
        // Audit-fix I4 — Medium haptic on opening the crisis PR menu.
        // This is a high-stakes surface; a meatier click than the ambient
        // Light selection feedback matches its weight.
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
          () => undefined,
        );
        setPRActionsOpen(true);
      }}
      style={({ pressed }) => ({
        marginTop: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        backgroundColor: blackout
          ? "#5a1212"
          : critical
            ? "#7a1a1a"
            : "#3b1a1a",
        borderWidth: 1,
        borderColor: blackout ? "#ff4d4d" : critical ? "#ff7a7a" : "#a64242",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <AppText size={18}>{blackout ? "🚨" : critical ? "🔥" : "⚠️"}</AppText>
      <View style={{ flex: 1 }}>
        <AppText size={13} weight="900" color="#ffd7d7">
          {blackout
            ? "ABSOLUTE BLACKOUT"
            : layingLow
              ? `Crisis ${Math.round(state.crisisLevel)}/100 · Laying low`
              : `Crisis ${Math.round(state.crisisLevel)}/100`}
        </AppText>
        <AppText size={11} color="#f3a8a8" numberOfLines={1}>
          {state.crisisOrigin?.kind === "relationship-drop"
            ? `Beef with @${state.crisisOrigin.characterId}`
            : state.crisisOrigin?.kind === "event-misstep"
              ? state.crisisOrigin.eventTitle
              : "Tap to open PR menu"}
        </AppText>
      </View>
      <AppText size={13} weight="900" color="#ffd7d7">
        PR →
      </AppText>
    </Pressable>
  );
}

function EnergyBadge() {
  const { state } = useGame();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: colors.surfaceAlt,
        gap: 4,
      }}
    >
      <AppText size={14}>⚡</AppText>
      <AppText size={13} weight="800">
        {state.energy}/10
        {state.bonusEnergy > 0 ? ` +${state.bonusEnergy}` : ""}
      </AppText>
    </View>
  );
}

// ===================================================================
//  FEED
// ===================================================================

function FeedScreen() {
  const { state, setComposeOpen, triggerEvent, refreshFeed, eventXpRange } = useGame();
  const [refreshing, setRefreshing] = useState(false);
  // Round 1.11.32 Faza B — Opcja Y: if the player pulls while the local
  // buffer is empty AND a background fetch is in flight, we keep the
  // spinner spinning instead of bouncing back instantly. The state below
  // tracks "pull is waiting for the bg fetcher to resolve"; the useEffect
  // a few lines down auto-drains the resulting post and clears the
  // spinner once the bg fetch completes.
  const [waitingForBg, setWaitingForBg] = useState(false);
  const xpRange = eventXpRange(state.level);

  async function onRefresh() {
    setRefreshing(true);
    const bufferWasEmpty = state.pendingBackgroundPosts.length === 0;
    try {
      await refreshFeed();
    } catch (error) {
      // refreshFeed already swallows internal errors via try/finally + setState,
      // but if anything bubbles up we log defensively and let the spinner clear.
      console.warn("[FeedScreen] refreshFeed threw:", error);
    } finally {
      setRefreshing(false);
    }
    // If the pull happened before the bg fetcher had anything to hand
    // over, keep the spinner "armed" via waitingForBg until the bg fetch
    // resolves — Opcja Y. The useEffect below clears it.
    if (bufferWasEmpty && state.isFetchingBackgroundPost) {
      setWaitingForBg(true);
    }
  }

  // Auto-drain when the bg fetch resolves while we were waiting. If it
  // produced a post we flush the buffer to the feed immediately; either
  // way the spinner clears.
  useEffect(() => {
    if (!waitingForBg) return;
    if (state.isFetchingBackgroundPost) return;
    if (state.pendingBackgroundPosts.length > 0) {
      void refreshFeed();
    }
    setWaitingForBg(false);
  }, [
    waitingForBg,
    state.isFetchingBackgroundPost,
    state.pendingBackgroundPosts.length,
    refreshFeed,
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FeedHeader />
      {/* Faza I #1 — FlatList replaces ScrollView+.map for the feed.
          Virtualisation: only on-screen posts mount; off-screen rows
          unmount but the data stays in state. windowSize=10 keeps a
          ~10-screen window in memory (sweet spot between scroll smoothness
          and footprint). initialNumToRender=8 paints the first viewport
          fast on cold start. removeClippedSubviews=true (Android-only by
          default) ditches off-window views from the native tree. Memory
          ceiling is now bounded regardless of feed length, vs ScrollView
          which kept every post mounted forever. */}
      <FlatList
        data={state.posts}
        keyExtractor={(post) => post.id}
        renderItem={({ item, index }) => (
          <FeedPostItem post={item} showDivider={index !== 0} />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 200 }}
        windowSize={10}
        initialNumToRender={8}
        maxToRenderPerBatch={5}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={refreshing || (waitingForBg && state.isFetchingBackgroundPost)}
            onRefresh={onRefresh}
            tintColor={colors.blue}
          />
        }
      />

      {/* Event button — centered absolutely at the horizontal midpoint
          of the screen via a full-width wrapper (pointerEvents:"box-none"
          so the wrapper itself never intercepts touches above the feed).
          This decouples Event's center from the Post button on the right,
          which previously squeezed Event into an asymmetric pill. */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 116,
          alignItems: "center",
        }}
      >
        <Pressable
          onPress={triggerEvent}
          disabled={state.isGenerating}
          accessibilityRole="button"
          accessibilityLabel={`Trigger event, up to ${xpRange.hi} XP`}
          accessibilityState={{ disabled: state.isGenerating }}
          style={({ pressed }) => ({
            minHeight: 56,
            paddingHorizontal: 22,
            borderRadius: radii.pill,
            backgroundColor: state.isGenerating ? colors.surfaceSoft : colors.blue,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <AppText size={18}>📣</AppText>
            <View style={{ alignItems: "center" }}>
              <AppText size={15} weight="900">
                Event
              </AppText>
              <AppText size={11} weight="800" color={colors.amber}>
                up to +{xpRange.hi} xp
              </AppText>
            </View>
            <AppText size={18}>📣</AppText>
          </View>
        </Pressable>
      </View>

      {/* Post (+) button — anchored to the right edge, sitting alongside
          the centered Event pill. The two never compete for the same
          horizontal space anymore: Event is governed by the wrapper above,
          Post is purely right-aligned. */}
      <Pressable
        onPress={() => setComposeOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Compose a new post"
        style={({ pressed }) => ({
          position: "absolute",
          right: 18,
          bottom: 116,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.blue,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Plus color={colors.text} size={28} strokeWidth={2.4} />
      </Pressable>

      {/* PostDetailModal, ComposeModal, EventModal and WorldUpdateToast
          live in GameShell now — they need to render from any tab (opening a
          post from Profile/Notifications used to silently no-op because this
          subtree unmounts on tab switch). */}
    </View>
  );
}

// Round 1.11.32 G-Fix #7 — React.memo with shallow equality. Since
// applyPostReplies + applyWorldUpdate mutate ONLY the touched posts
// (immutable spread keeps unchanged post object references stable), this
// memo lets unmodified posts skip the re-render path entirely when the
// FeedScreen re-renders from a state mutation elsewhere. Cuts the
// per-frame reconciliation work proportional to feed length.
const FeedPostItem = React.memo(function FeedPostItem({
  post,
  showDivider,
  noTap,
}: {
  post: FeedPost;
  showDivider?: boolean;
  noTap?: boolean;
}) {
  const {
    state,
    likePost,
    starPost,
    repostPost,
    openCharacterProfile,
    openPost,
    resolveCharacter,
    reportPost,
    toggleFavoritePost,
  } = useGame();
  // Round 1.11.32 G-Fix #8 — pop scale animation on like/repost taps.
  // Twitter/X-style "thump" that gives the action visible weight. The
  // animation sequence runs in parallel with the state mutation so the
  // colored fill flips in lockstep with the pop. Native driver = 60fps
  // even on the JS-thread-stressed buffer-drain frames.
  const heartScale = useRef(new Animated.Value(1)).current;
  const zapScale = useRef(new Animated.Value(1)).current;
  const popIcon = (val: Animated.Value) => {
    Animated.sequence([
      Animated.timing(val, { toValue: 1.4, duration: 110, useNativeDriver: true }),
      Animated.spring(val, { toValue: 1, useNativeDriver: true, damping: 8, stiffness: 200 }),
    ]).start();
  };
  const author =
    post.authorId === "player"
      ? {
          id: "player",
          name: state.player.name,
          handle: state.player.handle,
          avatar: state.player.avatar,
          verified: true,
        }
      : resolveCharacter(post.authorId);
  if (!author) return null;

  const body = (
    <View
      style={{
        borderTopColor: colors.divider,
        borderTopWidth: showDivider && !post.dayLabel ? 1 : 0,
        paddingHorizontal: 18,
        paddingVertical: 14,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={() => post.authorId !== "player" && openCharacterProfile(post.authorId)}
        >
          <Avatar uri={author.avatar} size={42} />
        </Pressable>
        <View style={{ flex: 1, gap: 6 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 5,
            }}
          >
            <AppText size={14} weight="900">
              {author.name}
            </AppText>
            {author.verified ? <VerifiedBadge size={14} /> : null}
            <AppText size={13} color={colors.muted}>
              {author.handle}
            </AppText>
            <View style={{ flex: 1 }} />
            {/* Fala 3 — 3-dots menu: Report or Favorite. Report sheet
                determines justification deterministically based on
                author chemistry + whether the post @-mentions the
                player; reward or penalty applied via reducer. */}
            <Pressable
              hitSlop={8}
              onPress={() => {
                if (post.authorId === "player") return;
                const isFav = state.favoritedPostIds.includes(post.id);
                Alert.alert("Post options", "What would you like to do?", [
                  {
                    text: isFav ? "Unfavorite" : "Favorite",
                    onPress: () => toggleFavoritePost(post.id),
                  },
                  {
                    text: "Report post",
                    style: "destructive",
                    onPress: () => {
                      Alert.alert(
                        "Report this post?",
                        "If the community sees it as genuinely hostile, you'll be backed. If not, your reputation takes a small hit.",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Report",
                            style: "destructive",
                            onPress: () => reportPost(post.id),
                          },
                        ],
                      );
                    },
                  },
                  { text: "Cancel", style: "cancel" },
                ]);
              }}
            >
              <Ellipsis color={colors.muted2} size={18} />
            </Pressable>
          </View>
          <AppText size={15} selectable>
            {renderMentions(post.text.replace("@player", state.player.handle))}
          </AppText>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
              marginTop: 4,
            }}
          >
            <Pressable
              onPress={() => openPost(post.id)}
              style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
            >
              <MessageCircle color={colors.muted} size={16} />
              <AppText color={colors.muted} size={13}>
                {post.threadReplies.length}
              </AppText>
            </Pressable>
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                popIcon(zapScale);
                repostPost(post.id);
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
            >
              <Animated.View style={{ transform: [{ scale: zapScale }] }}>
                <Zap
                  color={post.reposted ? colors.green : colors.muted}
                  fill={post.reposted ? colors.green : "transparent"}
                  size={16}
                />
              </Animated.View>
              <AppText color={post.reposted ? colors.green : colors.muted} size={13}>
                {post.reposts}
              </AppText>
            </Pressable>
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                popIcon(heartScale);
                likePost(post.id);
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                <Heart
                  color={post.liked ? colors.pink : colors.muted}
                  fill={post.liked ? colors.pink : "transparent"}
                  size={16}
                />
              </Animated.View>
              <AppText color={post.liked ? colors.pink : colors.muted} size={13}>
                {formatCount(post.likes)}
              </AppText>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => starPost(post.id)}>
              <Star
                color={post.starred ? colors.amber : colors.muted}
                fill={post.starred ? colors.amber : "transparent"}
                size={16}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View>
      {post.dayLabel && (
        <View
          style={{
            borderTopWidth: showDivider ? 1 : 0,
            borderBottomWidth: 1,
            borderColor: colors.divider,
            alignItems: "center",
            paddingVertical: 12,
          }}
        >
          <AppText size={12} color={colors.muted2}>
            {post.dayLabel}
          </AppText>
        </View>
      )}
      {noTap ? body : <Pressable onPress={() => openPost(post.id)}>{body}</Pressable>}
    </View>
  );
});

function Action({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      {icon}
      <AppText color={colors.muted} size={13}>
        {label}
      </AppText>
    </View>
  );
}

function renderMentions(text: string) {
  const parts = text.split(/(\s)/);
  return parts.map((p, i) => {
    if (p.startsWith("@")) {
      return (
        <AppText key={i} size={15} color={colors.blue}>
          {p}
        </AppText>
      );
    }
    return p;
  });
}

function ComposeModal() {
  const { state, publishPost, setComposeOpen, fetchSuggestions } = useGame();
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSug, setLoadingSug] = useState(false);
  const insets = useSafeAreaInsets();
  const sideQuests = state.sideQuests.filter((q) => !q.completed).slice(0, 4);

  useEffect(() => {
    if (!state.composeOpen) {
      setText("");
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setLoadingSug(true);
    fetchSuggestions("post", text || "")
      .then((list) => !cancelled && setSuggestions(list))
      .finally(() => !cancelled && setLoadingSug(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.composeOpen]);

  return (
    <Modal visible={state.composeOpen} animationType="slide" onRequestClose={() => setComposeOpen(false)}>
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 6 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingBottom: 12,
          }}
        >
          <IconButton size={36} onPress={() => setComposeOpen(false)}>
            <X color={colors.text} size={18} />
          </IconButton>
          <View style={{ flex: 1 }} />
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderStyle: "dashed",
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: radii.pill,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Plus color={colors.muted2} size={14} />
            <AppText size={13} color={colors.muted2}>
              Add a Power-up
            </AppText>
          </View>
          <View style={{ width: 10 }} />
          <Pressable
            disabled={!text.trim() || state.isGenerating}
            onPress={() => {
              const sending = text;
              setText("");
              void publishPost(sending);
            }}
            style={{
              backgroundColor: text.trim() && !state.isGenerating ? colors.blue : colors.surfaceSoft,
              borderRadius: radii.pill,
              paddingHorizontal: 18,
              paddingVertical: 8,
            }}
          >
            <AppText
              size={14}
              weight="800"
              color={text.trim() ? colors.text : colors.muted}
            >
              Post
            </AppText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}>
          {sideQuests.length > 0 ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, marginBottom: 8 }}>
                <BookOpen color={colors.muted2} size={14} />
                <AppText size={13} color={colors.muted2} weight="700">
                  Side Quest
                </AppText>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10 }}
              >
                {sideQuests.map((q) => (
                  <View
                    key={q.id}
                    style={{
                      width: 240,
                      backgroundColor: colors.surface,
                      borderRadius: radii.md,
                      padding: 12,
                    }}
                  >
                    <AppText size={13} numberOfLines={2}>
                      {q.text}
                    </AppText>
                    <AppText size={12} color={colors.amber} weight="800" style={{ marginTop: 6 }}>
                      +{q.xp} XP
                    </AppText>
                  </View>
                ))}
              </ScrollView>
              <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: 14 }} />
            </>
          ) : null}

          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Avatar uri={state.player.avatar} size={42} />
            <View>
              <AppText size={14} weight="900">
                {state.player.name}
              </AppText>
              <AppText size={12} color={colors.muted}>
                {state.player.handle}
              </AppText>
            </View>
          </View>

          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="What's on your mind?"
            placeholderTextColor={colors.muted}
            multiline
            autoFocus
            // Faza I #5B — hard cap. 500 chars covers Twitter-style 280
            // plus a generous expansion. Prevents paste-bomb attacks
            // from blowing the AI prompt's token budget.
            maxLength={500}
            style={{
              color: colors.text,
              fontSize: 18,
              lineHeight: 24,
              paddingVertical: 14,
              minHeight: 120,
              textAlignVertical: "top",
            }}
          />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <IconButton size={38} color={colors.surfaceAlt}>
              <ImageIcon />
            </IconButton>
            <IconButton size={38} color={colors.surfaceAlt}>
              <CameraIcon />
            </IconButton>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 18, marginBottom: 8 }}>
            <AppText size={13}>💡</AppText>
            <AppText size={13} color={colors.muted2} weight="700">
              Suggestions
            </AppText>
            <View style={{ flex: 1 }} />
            <ChevronDown color={colors.muted2} size={14} />
          </View>
          {loadingSug ? (
            <AppText size={12} color={colors.muted}>
              Thinking…
            </AppText>
          ) : null}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10 }}
          >
            {suggestions.map((s, i) => (
              <Pressable
                key={i}
                onPress={() => setText(s)}
                style={{
                  width: 220,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderStyle: "dashed",
                  borderRadius: radii.md,
                  padding: 12,
                }}
              >
                <AppText size={13} numberOfLines={4}>
                  {s}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>
        </ScrollView>
      </View>
    </Modal>
  );
}

function ImageIcon() {
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <View style={{
        width: 18, height: 14, borderRadius: 3,
        borderWidth: 1.4, borderColor: colors.muted2,
      }} />
    </View>
  );
}

function CameraIcon() {
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <View style={{
        width: 18, height: 14, borderRadius: 3,
        backgroundColor: colors.muted2,
      }} />
    </View>
  );
}

function EventModal() {
  const {
    state,
    completeEvent,
    completingEvent,
    setEventOpen,
    pendingEvent,
    eventXpRange,
    fetchSuggestions,
  } = useGame();
  const insets = useSafeAreaInsets();
  const [action, setAction] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const xpRange = eventXpRange(state.level);

  useEffect(() => {
    if (!state.eventOpen) {
      setAction("");
      setSuggestions([]);
      return;
    }
    if (!pendingEvent) return;
    let cancelled = false;
    void fetchSuggestions("event", `${pendingEvent.eventTitle}: ${pendingEvent.eventBody}`).then((list) => {
      if (cancelled) return;
      // mix AI suggestions with original choices
      const merged = [...(pendingEvent.choices ?? []), ...list].filter(Boolean);
      setSuggestions(Array.from(new Set(merged)).slice(0, 4));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.eventOpen, pendingEvent]);

  const event = pendingEvent;

  return (
    <Modal visible={state.eventOpen} animationType="slide" onRequestClose={() => setEventOpen(false)}>
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 6 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingBottom: 12,
          }}
        >
          <IconButton size={36} onPress={() => setEventOpen(false)}>
            <X color={colors.text} size={18} />
          </IconButton>
          <View style={{ flex: 1 }} />
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderStyle: "dashed",
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: radii.pill,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Plus color={colors.muted2} size={14} />
            <AppText size={13} color={colors.muted2}>
              Add a Power-up
            </AppText>
          </View>
          <View style={{ width: 10 }} />
          <Pressable
            disabled={!action.trim() || completingEvent}
            onPress={() => {
              const send = action;
              setAction("");
              void completeEvent(send);
            }}
            style={{
              backgroundColor: action.trim() && !completingEvent ? colors.blue : colors.surfaceSoft,
              borderRadius: radii.pill,
              paddingHorizontal: 18,
              paddingVertical: 8,
            }}
          >
            <AppText
              size={14}
              weight="800"
              color={action.trim() && !completingEvent ? colors.text : colors.muted}
            >
              Submit
            </AppText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, marginBottom: 8 }}>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: colors.surfaceAlt,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AppText size={12}>🎭</AppText>
            </View>
            <AppText size={13} color={colors.muted2} weight="700">
              Event
            </AppText>
            <View style={{ flex: 1 }} />
            <AppText size={13} weight="800" color={colors.amber}>
              +{xpRange.lo}-{xpRange.hi} XP
            </AppText>
          </View>
          <AppText size={16} selectable style={{ lineHeight: 22 }}>
            {event?.eventBody ?? "Loading event…"}
          </AppText>

          <View style={{ flexDirection: "row", gap: 10, alignItems: "center", marginTop: 18 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: colors.surfaceAlt,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AppText size={18}>🎬</AppText>
            </View>
            <Pressable
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: radii.pill,
                backgroundColor: colors.surfaceAlt,
              }}
            >
              <Pencil color={colors.muted2} size={12} />
              <AppText size={12}>Edit</AppText>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Star color={colors.muted} size={18} />
          </View>

          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radii.md,
              marginTop: 18,
              padding: 12,
              minHeight: 110,
            }}
          >
            <TextInput
              value={action}
              onChangeText={setAction}
              placeholder="What do you do?"
              placeholderTextColor={colors.muted}
              multiline
              // Faza I #5B — event action is a short narrative beat.
              maxLength={300}
              style={{
                color: colors.text,
                fontSize: 16,
                lineHeight: 22,
                textAlignVertical: "top",
                minHeight: 100,
              }}
            />
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 18, marginBottom: 8 }}>
            <AppText size={13}>💡</AppText>
            <AppText size={13} color={colors.muted2} weight="700">
              Suggestions
            </AppText>
            <View style={{ flex: 1 }} />
            <ChevronDown color={colors.muted2} size={14} />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10 }}
          >
            {suggestions.map((s, i) => (
              <Pressable
                key={i}
                onPress={() => setAction(s)}
                style={{
                  width: 200,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderStyle: "dashed",
                  borderRadius: radii.md,
                  padding: 12,
                  backgroundColor: colors.surface,
                }}
              >
                <AppText size={13} numberOfLines={5}>
                  {s}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>

          {completingEvent ? (
            <AppText size={13} color={colors.muted} style={{ marginTop: 14 }}>
              Resolving outcome…
            </AppText>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ===================================================================
//  GOALS
// ===================================================================

function GoalsHeader() {
  const { state, setActivityLogOpen, setAppSettingsOpen } = useGame();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <AppText size={22} weight="900">
          Lvl {state.level}
        </AppText>
        <ProgressBar value={state.xp} max={state.xpRequired} height={11} color={colors.amber} />
        <AppText size={13} weight="900" color={colors.amber}>
          {state.xp}/{state.xpRequired} XP
        </AppText>
        {/* Fala 1 #15 — dead orange + plus removed. It was a static
            decoration with no onPress so it confused players who
            assumed it bought XP or upgraded the level. */}
        <EnergyBadge />
        <IconButton size={32} onPress={() => setActivityLogOpen(true)}>
          <BookOpen color={colors.muted2} size={16} />
        </IconButton>
        {/* Fala 1 #10 — matching FeedHeader: cog icon for settings. */}
        <IconButton size={32} onPress={() => setAppSettingsOpen(true)}>
          <Settings color={colors.muted2} size={16} />
        </IconButton>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
        <AppText size={12} color={colors.muted2}>
          How does this work?
        </AppText>
        <HelpCircle color={colors.muted2} size={12} style={{ marginLeft: 4 }} />
      </View>
    </View>
  );
}

function MilestoneRail() {
  const { state } = useGame();
  const ms = state.milestones;
  const nextIdx = ms.findIndex((m) => !m.completed && !m.skipped);
  // window around current: 1 complete + current + next 3
  const start = Math.max(0, nextIdx - 1);
  const end = Math.min(ms.length, start + 5);
  const visible = ms.slice(start, end);

  return (
    <View style={{ marginHorizontal: -18, paddingVertical: 10, paddingHorizontal: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1, height: 8, backgroundColor: colors.blue }} />
        {visible.map((m, i) => {
          const globalIdx = start + i;
          let variant: "completed" | "current" | "future" = "future";
          if (m.completed) variant = "completed";
          else if (globalIdx === nextIdx) variant = "current";
          const shape: "circle" | "diamond" = globalIdx % 2 === 0 ? "circle" : "diamond";
          const label = m.completed ? "✓" : `${globalIdx + 1}`;
          return (
            <View key={m.id} style={{ marginHorizontal: 8 }}>
              <MilestoneNode label={label} variant={variant} shape={shape} />
            </View>
          );
        })}
        <View style={{ flex: 1, height: 8, backgroundColor: colors.surfaceSoft }} />
      </View>
    </View>
  );
}

function GoalsScreen() {
  const {
    state,
    activeWorld,
    cast,
    applyMilestonePoints,
    completeSideQuest,
    applySkillStaging,
    skipMilestone,
    setCustomizeWorldOpen,
    setAddCharacterOpen,
    openCharacterProfile,
  } = useGame();
  const next = state.milestones.find((m) => !m.completed && !m.skipped);
  // Staging state for skill points. + and − only mutate this; "Confirm Changes" commits.
  const [pendingBravery, setPendingBravery] = useState(0);
  const [pendingMystery, setPendingMystery] = useState(0);
  const [pendingWit, setPendingWit] = useState(0);
  const pending: Record<SkillKey, number> = {
    bravery: pendingBravery,
    mystery: pendingMystery,
    wit: pendingWit,
  };
  const setPending: Record<SkillKey, (n: number) => void> = {
    bravery: setPendingBravery,
    mystery: setPendingMystery,
    wit: setPendingWit,
  };
  const totalPending = pendingBravery + pendingMystery + pendingWit;
  const remaining = state.skillPoints - totalPending;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <GoalsHeader />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 18,
          paddingBottom: 130,
          gap: 18,
        }}
      >
        <SectionTitle title="Main goal" />
        <Card style={{ gap: 14 }}>
          <AppText size={18} weight="900">
            {activeWorld.mainGoal.title}
          </AppText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ProgressBar value={state.mainGoalProgress} height={11} />
            <AppText size={13}>{Math.round(state.mainGoalProgress)}%</AppText>
          </View>
          <AppText size={14}>{activeWorld.mainGoal.description}</AppText>
          <CapsuleButton size="md" color={colors.surfaceSoft} onPress={() => setCustomizeWorldOpen(true)}>
            ⚙ Customize
          </CapsuleButton>
        </Card>

        <SectionTitle title="Milestones" />
        <MilestoneRail />

        {next ? (
          <>
            <SectionTitle title="Next Milestone" />
            <Card style={{ gap: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                <AppText size={17} weight="900" style={{ flex: 1 }}>
                  {next.title}
                </AppText>
                <Star color={colors.muted} size={18} />
              </View>
              <Divider />
              {(Object.keys(next.requirements) as SkillKey[])
                .filter((skill) => next.requirements[skill] > 0)
                .map((skill) => {
                  const remaining = next.requirements[skill] - next.applied[skill];
                  return (
                    <View key={skill} style={{ gap: 12 }}>
                      <View style={{ flexDirection: "row" }}>
                        <AppText size={15} style={{ textTransform: "capitalize" }}>
                          {skill}
                        </AppText>
                        <View style={{ flex: 1 }} />
                        <AppText size={14} weight="700" color={remaining > 0 ? colors.orange : colors.green}>
                          ⚔ +{Math.max(0, remaining)} Needed
                        </AppText>
                      </View>
                      <Divider />
                    </View>
                  );
                })}
              <CapsuleButton color={colors.orange} onPress={applyMilestonePoints}>
                ↑ Apply points
              </CapsuleButton>
              <Pressable onPress={skipMilestone} style={{ alignSelf: "center" }}>
                <AppText size={13} color={colors.muted2}>
                  Skip milestone
                </AppText>
              </Pressable>
            </Card>
          </>
        ) : null}

        <SectionTitle title="Side quests" />
        <Card style={{ gap: 0 }}>
          {state.sideQuests.map((quest, index) => {
            const done = !!quest.completed;
            // Round 1.11.32 G-Fix #5 — evaluate the quest's condition
            // against current state. `satisfied` flips the tap target
            // active; `progress` surfaces the running counter so the
            // player knows what they need to do.
            const { satisfied, progress } = evaluateQuestCondition(
              quest.condition,
              state,
            );
            const claimable = satisfied && !done;
            return (
              <Pressable
                key={quest.id}
                onPress={() => completeSideQuest(quest.id)}
                disabled={!claimable}
                style={({ pressed }) => ({
                  paddingVertical: 14,
                  borderTopColor: colors.divider,
                  borderTopWidth: index === 0 ? 0 : 1,
                  flexDirection: "row",
                  gap: 12,
                  opacity: pressed && claimable ? 0.78 : 1,
                  alignItems: "center",
                })}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderColor: done
                      ? colors.blue
                      : claimable
                        ? colors.green
                        : colors.border,
                    borderWidth: 2,
                    backgroundColor: done ? colors.blue : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {done ? <AppText size={12}>✓</AppText> : null}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <AppText size={14} color={done ? colors.muted : colors.text}>
                    {quest.text}
                  </AppText>
                  <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                    <AppText size={12} color={colors.amber}>
                      +{quest.xp} xp ✨
                    </AppText>
                    {progress && !done ? (
                      <AppText
                        size={12}
                        color={claimable ? colors.green : colors.muted2}
                      >
                        · {progress}{claimable ? " — tap to claim" : ""}
                      </AppText>
                    ) : null}
                  </View>
                </View>
                <Star
                  color={claimable ? colors.amber : colors.muted}
                  size={16}
                />
              </Pressable>
            );
          })}
        </Card>

        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <SectionTitle title="Skills" />
          <View style={{ flex: 1 }} />
          {/* Fala 1 #13 — promoted from a thin orange line to a real
              pill so the available-points count is impossible to miss.
              Greys out when zero so the player sees "level up to earn
              more" rather than "system is broken". */}
          <View
            style={{
              backgroundColor:
                state.skillPoints > 0 ? colors.orange : colors.surfaceSoft,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: radii.pill,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <AppText
              size={13}
              weight="900"
              color={state.skillPoints > 0 ? colors.text : colors.muted}
            >
              ⚔ {remaining}/{state.skillPoints} pts
            </AppText>
          </View>
        </View>
        <Card style={{ gap: 14 }}>
          {(["bravery", "mystery", "wit"] as SkillKey[]).map((skill, index) => {
            const previewValue = Math.min(100, state.stats[skill] + pending[skill]);
            return (
              <View key={skill} style={{ gap: 8 }}>
                {index > 0 ? <Divider /> : null}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <AppText size={16} weight="900" style={{ textTransform: "capitalize" }}>
                      {skill}
                    </AppText>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <ProgressBar value={previewValue} height={10} />
                      <AppText size={13}>
                        {state.stats[skill]}
                        {pending[skill] > 0 ? (
                          <AppText size={13} color={colors.green}>
                            {" "}+{pending[skill]}
                          </AppText>
                        ) : null}
                        /100
                      </AppText>
                    </View>
                    <AppText size={12} color={colors.muted}>
                      {skillCopy[skill]} ({state.stats[skill]}%)
                    </AppText>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <IconButton
                      size={36}
                      color={pending[skill] > 0 ? colors.surfaceAlt : colors.surfaceSoft}
                      onPress={() => {
                        if (pending[skill] > 0) setPending[skill](pending[skill] - 1);
                      }}
                    >
                      <AppText size={20} color={pending[skill] > 0 ? colors.text : colors.muted}>
                        −
                      </AppText>
                    </IconButton>
                    <AppText size={15} weight="900" style={{ minWidth: 16, textAlign: "center" }}>
                      {pending[skill]}
                    </AppText>
                    <IconButton
                      size={36}
                      color={remaining > 0 ? colors.orange : colors.surfaceSoft}
                      onPress={() => {
                        if (remaining > 0) setPending[skill](pending[skill] + 1);
                      }}
                    >
                      <Plus
                        color={remaining > 0 ? colors.text : colors.muted}
                        size={18}
                      />
                    </IconButton>
                  </View>
                </View>
              </View>
            );
          })}
          {totalPending > 0 ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <CapsuleButton
                size="md"
                color={colors.surfaceAlt}
                style={{ flex: 1 }}
                onPress={() => {
                  setPendingBravery(0);
                  setPendingMystery(0);
                  setPendingWit(0);
                }}
              >
                Reset
              </CapsuleButton>
              <CapsuleButton
                size="md"
                color={colors.orange}
                style={{ flex: 2 }}
                onPress={() => {
                  applySkillStaging({
                    bravery: pendingBravery,
                    mystery: pendingMystery,
                    wit: pendingWit,
                  });
                  setPendingBravery(0);
                  setPendingMystery(0);
                  setPendingWit(0);
                }}
              >
                Confirm Changes (+{totalPending})
              </CapsuleButton>
            </View>
          ) : null}
        </Card>

        <SectionTitle title="Your cast" />
        {cast.length === 0 ? (
          <Card>
            <AppText size={13} color={colors.muted2} style={{ textAlign: "center" }}>
              No characters yet. Add one and they'll start reacting to your posts and events.
            </AppText>
          </Card>
        ) : (
          cast.map((c) => {
            const contact = state.contacts[c.id];
            if (!contact) return null;
            return (
              <Pressable key={c.id} onPress={() => openCharacterProfile(c.id)}>
                <Card style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Avatar uri={c.avatar} size={40} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <AppText size={15} weight="900">
                          {c.name}
                        </AppText>
                        {c.verified ? <VerifiedBadge size={12} /> : null}
                      </View>
                      <AppText size={12} color={colors.muted}>
                        {c.handle}
                      </AppText>
                    </View>
                    <ChevronRight color={colors.muted2} size={16} />
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <CenteredBar value={contact.vibe} />
                    <AppText size={13} weight="800">
                      {contact.vibe.toFixed(1)}%
                    </AppText>
                  </View>
                  {contact.vibeReason ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <DeltaPill delta={contact.vibeDelta} />
                      <AppText size={12} color={colors.muted2} style={{ flex: 1 }}>
                        {contact.vibeReason}
                      </AppText>
                    </View>
                  ) : null}
                </Card>
              </Pressable>
            );
          })
        )}
        <CapsuleButton size="md" color={colors.surfaceAlt} onPress={() => setAddCharacterOpen(true)}>
          + Add character
        </CapsuleButton>
      </ScrollView>
    </View>
  );
}

// ===================================================================
//  MESSAGES
// ===================================================================

// Fala 3 — small ladder picker for 0-4 intensity. Used inside the
// auto-contact scheduler modal.
function IntensityPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <AppText size={11} color={colors.muted2}>
        {label}
      </AppText>
      {[0, 1, 2, 3, 4].map((step) => (
        <Pressable
          key={step}
          onPress={() => onChange(step)}
          hitSlop={4}
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: step <= value ? colors.purple : colors.surfaceSoft,
            borderWidth: 1,
            borderColor: step <= value ? colors.purple : colors.divider,
          }}
        />
      ))}
    </View>
  );
}

function MessagesScreen() {
  const { state, setActiveChatId } = useGame();
  if (state.activeChatId) {
    return (
      <ChatRoom
        characterId={state.activeChatId}
        onBack={() => setActiveChatId(null)}
      />
    );
  }
  return <InboxScreen onOpenChat={(id) => setActiveChatId(id)} />;
}

function InboxScreen({ onOpenChat }: { onOpenChat: (id: string) => void }) {
  const { state, cast, setAddCharacterOpen, setAutoContactConfig } = useGame();
  // Fala 3 — auto-contact scheduler modal. Lists each cast member with
  // two ladders (DM intensity 0-4 / invite intensity 0-4). Stored
  // values drive the daily roll in the bg tick.
  const [autoConfigOpen, setAutoConfigOpen] = useState(false);
  const proactiveContacts = cast
    .filter((c) => state.contacts[c.id]?.proactive)
    .map((c) => ({ char: c, contact: state.contacts[c.id] }));
  const passive = cast.filter((c) => !state.contacts[c.id]?.proactive);

  const insets = useSafeAreaInsets();

  return (
    <Screen contentStyle={{ paddingTop: insets.top + 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <AppText size={26} weight="900">
          Messages
        </AppText>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => setAddCharacterOpen(true)}
          accessibilityLabel="Add a character"
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: colors.surfaceAlt,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Plus color={colors.text} size={18} />
        </Pressable>
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync().catch(() => undefined);
            setAutoConfigOpen(true);
          }}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: colors.purple,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <MailPlus color={colors.text} size={20} />
        </Pressable>
      </View>
      <Divider inset={18} />
      {/* Fala 3 — auto-contact scheduler. Each cast member gets two
          intensity ladders (0-4). Bg tick uses these to roll daily
          proactive DM / activity-invite chances. */}
      <Modal
        visible={autoConfigOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setAutoConfigOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: colors.bg,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 18,
              paddingTop: 18,
              paddingBottom: 28,
              maxHeight: "85%",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
              <AppText size={18} weight="900">
                Auto-DMs & invites
              </AppText>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setAutoConfigOpen(false)} hitSlop={8}>
                <X color={colors.muted2} size={20} />
              </Pressable>
            </View>
            <AppText size={12} color={colors.muted2} style={{ marginBottom: 14 }}>
              Pick how often each contact messages or invites you. 0 = silent,
              4 = constantly checking in.
            </AppText>
            <ScrollView style={{ maxHeight: 480 }}>
              {cast.length === 0 ? (
                <AppText size={13} color={colors.muted}>
                  Add some characters first (+ button above).
                </AppText>
              ) : (
                cast.map((c) => {
                  const cfg = state.autoContactConfig[c.id] ?? {
                    dmIntensity: 0,
                    inviteIntensity: 0,
                  };
                  return (
                    <View
                      key={c.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        paddingVertical: 10,
                        borderBottomColor: colors.divider,
                        borderBottomWidth: 1,
                      }}
                    >
                      <Avatar uri={c.avatar} size={36} />
                      <View style={{ flex: 1, gap: 4 }}>
                        <AppText size={13} weight="800" numberOfLines={1}>
                          {c.name}
                        </AppText>
                        <View style={{ flexDirection: "row", gap: 12 }}>
                          <IntensityPicker
                            label="DM"
                            value={cfg.dmIntensity}
                            onChange={(v) =>
                              setAutoContactConfig(c.id, {
                                ...cfg,
                                dmIntensity: v,
                              })
                            }
                          />
                          <IntensityPicker
                            label="Invite"
                            value={cfg.inviteIntensity}
                            onChange={(v) =>
                              setAutoContactConfig(c.id, {
                                ...cfg,
                                inviteIntensity: v,
                              })
                            }
                          />
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {cast.length === 0 ? (
        <Card style={{ gap: 10, alignItems: "center" }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: colors.surfaceAlt,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MessageCircle color={colors.muted2} size={22} />
          </View>
          <AppText size={15} weight="800">
            No messages yet
          </AppText>
          <AppText size={13} color={colors.muted2} style={{ textAlign: "center" }}>
            Add a character to start chatting. They'll show up here.
          </AppText>
          <CapsuleButton size="md" onPress={() => setAddCharacterOpen(true)}>
            + Add a character
          </CapsuleButton>
        </Card>
      ) : (
        <>
          {proactiveContacts.map((p) => (
            <Pressable key={p.char.id} onPress={() => onOpenChat(p.char.id)}>
              <MessagePreview character={p.char} preview={p.contact.preview} />
            </Pressable>
          ))}
          {proactiveContacts.length > 0 ? (
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <AppText size={18} weight="900">
                  Proactive Characters
                </AppText>
                <View style={{ flex: 1 }} />
                <AppText size={12} color={colors.muted2}>
                  ({proactiveContacts.length})
                </AppText>
              </View>
              <AppText size={13} color={colors.muted2}>
                Proactive Characters can initiate messages and activities with you.
              </AppText>
              {proactiveContacts.map((p) => (
                <Pressable key={`pcard-${p.char.id}`} onPress={() => onOpenChat(p.char.id)}>
                  <CharacterRow
                    character={p.char}
                    action={<Settings color={colors.muted2} size={18} />}
                  />
                </Pressable>
              ))}
            </Card>
          ) : null}
          {passive.length > 0 ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <AppText size={18} color={colors.muted2} weight="700">
                  Passive Characters
                </AppText>
                <View style={{ flex: 1 }} />
                <AppText size={14} color={colors.muted2}>
                  ({passive.length})
                </AppText>
              </View>
              <Card style={{ gap: 0 }}>
                {passive.map((c, index) => (
                  <Pressable key={c.id} onPress={() => onOpenChat(c.id)}>
                    <View
                      style={{
                        borderTopColor: colors.divider,
                        borderTopWidth: index === 0 ? 0 : 1,
                      }}
                    >
                      <CharacterRow character={c} action={<Plus color={colors.blue} size={22} />} />
                    </View>
                  </Pressable>
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}

    </Screen>
  );
}

function MessagePreview({ character, preview }: { character: Character; preview: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 6 }}>
      <Avatar uri={character.avatar} size={54} ring={character.proactive ? colors.purple : undefined} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <AppText size={16} weight="900">
            {character.name}
          </AppText>
          {character.verified ? <VerifiedBadge size={14} /> : null}
        </View>
        <AppText numberOfLines={2} color={colors.muted2} size={14}>
          {preview || "Start a new chat. Everyone is unlocked."}
        </AppText>
      </View>
    </View>
  );
}

function CharacterRow({ character, action }: { character: Character; action: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 12 }}>
      <Avatar uri={character.avatar} size={48} ring={character.proactive ? colors.purple : undefined} />
      <View style={{ flex: 1 }}>
        <AppText size={16} weight="900">
          {character.name}
        </AppText>
        <AppText size={13} color={colors.muted}>
          {character.handle}
        </AppText>
      </View>
      {action}
    </View>
  );
}

function ChatRoom({ characterId, onBack }: { characterId: string; onBack: () => void }) {
  const { state, sendChatMessage, openCharacterProfile, resolveCharacter } = useGame();
  const character = resolveCharacter(characterId);
  const contact = state.contacts[characterId];
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const insets = useSafeAreaInsets();

  if (!character || !contact) {
    return (
      <Screen>
        <CapsuleButton onPress={onBack}>Back</CapsuleButton>
      </Screen>
    );
  }

  async function send() {
    const text = message.trim();
    if (!text || sending) return;
    setMessage("");
    setSending(true);
    await sendChatMessage(characterId, text);
    setSending(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 14,
          paddingBottom: 12,
          borderBottomColor: colors.divider,
          borderBottomWidth: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Pressable onPress={onBack}>
          <ArrowLeft color={colors.text} size={22} />
        </Pressable>
        <Pressable onPress={() => openCharacterProfile(character.id)}>
          <Avatar uri={character.avatar} size={36} />
        </Pressable>
        <AppText size={16} weight="900" style={{ flex: 1 }}>
          {character.name}
        </AppText>
        <Ellipsis color={colors.text} size={20} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 260, gap: 8 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.divider }} />
          <AppText size={12} color={colors.muted2}>
            Day {state.day}
          </AppText>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.divider }} />
        </View>
        {contact.messages.map((m) => (
          <ChatBubble key={m.id} message={m.text} mine={m.sender === "player"} avatar={character.avatar} createdAt={m.createdAt} />
        ))}
        {sending ? (
          <View style={{ alignSelf: "flex-start", marginLeft: 48 }}>
            <AppText color={colors.muted2} size={12}>
              {character.name} is typing...
            </AppText>
          </View>
        ) : null}
      </ScrollView>

      <KeyboardAvoidingView
        // Faza I #2 — Platform-conditional keyboard handling.
        // iOS: behavior="padding" + offset pushes content above keyboard.
        // Android: behavior=undefined + offset=0. Android's window manager
        // already runs in adjustResize mode by default, which physically
        // shrinks the layout when the keyboard opens. Layering
        // behavior="padding" on top of that double-adds margin, sending
        // the composer flying to the middle of the screen.
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.bottom + 30 : 0}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 62 + insets.bottom,
          backgroundColor: colors.bg,
          borderTopColor: colors.divider,
          borderTopWidth: 1,
          padding: 14,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Avatar uri={character.avatar} size={36} />
          <View style={{ flex: 1 }}>
            <AppText size={14} weight="800">
              {contact.currentFeeling.headline}
            </AppText>
            <AppText size={12} color={colors.muted2}>
              {contact.currentFeeling.detail}
            </AppText>
          </View>
          <DeltaPill delta={contact.mood.delta} />
        </View>
        <View
          style={{
            minHeight: 48,
            borderRadius: radii.pill,
            backgroundColor: colors.surface,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
            gap: 10,
          }}
        >
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Message..."
            placeholderTextColor={colors.muted}
            // Faza I #5B — DM message cap. 800 chars allows a paragraph
            // without flooding the chat history.
            maxLength={800}
            style={{
              flex: 1,
              color: colors.text,
              fontSize: 15,
              minHeight: 44,
            }}
          />
          <Pressable
            onPress={send}
            disabled={!message.trim() || sending || state.isGenerating}
          >
            <Send
              color={
                !message.trim() || sending || state.isGenerating ? colors.muted : colors.blue
              }
              size={20}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function ChatBubble({
  message,
  mine,
  avatar,
  createdAt,
}: {
  message: string;
  mine: boolean;
  avatar: AvatarSource;
  createdAt: string;
}) {
  return (
    <View style={{ marginVertical: 4 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: mine ? "flex-end" : "flex-start",
          gap: 8,
        }}
      >
        {!mine ? <Avatar uri={avatar} size={32} /> : null}
        <View
          style={{
            maxWidth: "78%",
            borderRadius: 20,
            borderCurve: "continuous",
            backgroundColor: mine ? colors.blue : colors.surfaceAlt,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <AppText size={15} selectable>
            {message}
          </AppText>
        </View>
      </View>
      <AppText
        size={10}
        color={colors.muted}
        style={{
          marginTop: 3,
          marginLeft: mine ? 0 : 42,
          marginRight: mine ? 4 : 0,
          textAlign: mine ? "right" : "left",
        }}
      >
        {createdAt}
      </AppText>
    </View>
  );
}

// ===================================================================
//  ALERTS / NOTIFICATIONS
// ===================================================================

// Round 1.11 D — render a preview line with @mentions colored blue, matching
// original Status. Splits on whitespace and re-joins React fragments so
// "Ariana Grande: @ishowspeed please let him breathe" becomes
// "Ariana Grande: [@ishowspeed in blue] please let him breathe".
function renderPreviewWithMentions(text: string, baseColor: string) {
  // Faza I #3 — defensive guard. The signature is `text: string` so
  // TypeScript blocks compile-time misuse, BUT a hydrated save from an
  // older app version could legitimately deserialise `preview: null`
  // because the type was `string | undefined` in earlier formats.
  // .split() on a non-string throws a TypeError that nukes the whole
  // AlertsScreen. Render an empty fragment instead — the row still has
  // the headline, only the preview line is missing.
  if (typeof text !== "string" || text.length === 0) {
    return null;
  }
  const parts = text.split(/(\s+)/);
  return parts.map((part, i) => {
    if (/^@\w/.test(part)) {
      return (
        <AppText key={i} size={13} weight="800" color={colors.blue}>
          {part}
        </AppText>
      );
    }
    return (
      <AppText key={i} size={13} color={baseColor}>
        {part}
      </AppText>
    );
  });
}

function AlertsScreen() {
  const { state, openPost, resolveCharacter } = useGame();
  const insets = useSafeAreaInsets();

  return (
    <Screen contentStyle={{ paddingTop: insets.top + 8 }}>
      <View style={{ alignItems: "center" }}>
        <AppText size={20} weight="900">
          Notifications
        </AppText>
      </View>
      <Divider inset={18} />
      {state.notifications.length === 0 ? (
        <Card style={{ alignItems: "center", gap: 8, marginTop: 16 }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: colors.surfaceAlt,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Bell color={colors.muted2} size={22} />
          </View>
          <AppText size={15} weight="800">
            Nothing yet
          </AppText>
          <AppText size={13} color={colors.muted2} style={{ textAlign: "center" }}>
            As you post, reply, and chat, the timeline starts reacting. Replies and mentions will show up here.
          </AppText>
        </Card>
      ) : (
        state.notifications
          .filter(
            // Fala 1 #5 — drop notifications whose involved characters
            // are ALL muted. Mixed (some muted, some not) still shows
            // — the unmuted character is the reason this notif matters.
            (item) =>
              item.charactersInvolved.length === 0 ||
              item.charactersInvolved.some(
                (id) => !state.mutedCharacterIds.includes(id),
              ),
          )
          .map((item) => {
          const involved = item.charactersInvolved
            .map((id) => resolveCharacter(id))
            .filter(Boolean) as Array<{ avatar: AvatarSource; name: string }>;
          const resolvedHeadline = item.charactersInvolved.reduce((acc, id) => {
            const c = resolveCharacter(id);
            return c ? acc.replaceAll(id, c.name) : acc;
          }, item.headline);
          // Overlay icon decided by notification kind (Round 1.11 D).
          // activity-invite / activity-response → calendar (purple bg)
          // event-mention → party-popper (yellow bg)
          // post-reply (default) → no overlay
          const overlayKind = item.kind;
          const showCalendar =
            overlayKind === "activity-invite" || overlayKind === "activity-response";
          const showParty = overlayKind === "event-mention";
          return (
            <Pressable
              key={item.id}
              onPress={() => item.postId && openPost(item.postId)}
              style={{
                flexDirection: "row",
                gap: 10,
                paddingVertical: 12,
                paddingHorizontal: 4,
              }}
            >
              {/* Avatar + optional overlay icon. Use single (primary) avatar
                  with bottom-right overlay, matching original Status. */}
              <View style={{ width: 48, height: 48 }}>
                {involved[0] ? (
                  <Avatar uri={involved[0].avatar} size={48} />
                ) : (
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: colors.surfaceAlt,
                    }}
                  />
                )}
                {showCalendar ? (
                  <View
                    style={{
                      position: "absolute",
                      right: -2,
                      bottom: -2,
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: colors.purple,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 2,
                      borderColor: colors.bg,
                    }}
                  >
                    <AppText size={11}>📅</AppText>
                  </View>
                ) : null}
                {showParty ? (
                  <View
                    style={{
                      position: "absolute",
                      right: -2,
                      bottom: -2,
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: colors.amber,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 2,
                      borderColor: colors.bg,
                    }}
                  >
                    <AppText size={11}>🎉</AppText>
                  </View>
                ) : null}
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <AppText size={14} weight="800">
                  {resolvedHeadline}
                </AppText>
                {/* Preview with @mention coloring — splits on whitespace and
                    inline-renders @handles in blue. */}
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    alignItems: "baseline",
                  }}
                >
                  {renderPreviewWithMentions(item.preview, colors.muted2)}
                </View>
              </View>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

// ===================================================================
//  PROFILE (player)
// ===================================================================

function ProfileScreen() {
  const {
    state,
    cast,
    setEditProfileOpen,
    setActivityLogOpen,
    setCustomizeWorldOpen,
    setAppSettingsOpen,
    setCreateActivityOpen,
    openCharacterProfile,
    resolveCharacter,
    openPost,
  } = useGame();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 130 }}
      style={{ backgroundColor: colors.bg }}
    >
      <View style={{ height: 160 }}>
        <Image
          source={imageSource(state.player.banner)}
          contentFit="cover"
          style={{ width: "100%", height: "100%" }}
        />
        <View
          style={{
            position: "absolute",
            top: insets.top + 6,
            right: 14,
            flexDirection: "row",
            gap: 8,
          }}
        >
          {/* Fala 1 #6 — left button = Activity Log shortcut. Was a
              duplicate Settings before, which made it useless. The log
              is the most-requested deep-link from Profile (review what
              happened across recent days). */}
          <IconButton
            size={36}
            color="rgba(0,0,0,0.55)"
            onPress={() => setActivityLogOpen(true)}
          >
            <BookOpen color={colors.muted2} size={18} />
          </IconButton>
          <IconButton size={36} color="rgba(0,0,0,0.55)" onPress={() => setAppSettingsOpen(true)}>
            <Settings color={colors.muted2} size={18} />
          </IconButton>
        </View>
      </View>

      <View style={{ paddingHorizontal: 18, marginTop: -36 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
          {/* zIndex/elevation keep the avatar above the banner on both iOS and Android. */}
          <View style={{ zIndex: 10, elevation: 10 }}>
            <Avatar uri={state.player.avatar} size={84} ring={colors.bg} ringWidth={3} />
          </View>
          <View style={{ flex: 1 }} />
          <CapsuleButton size="sm" onPress={() => setEditProfileOpen(true)}>
            Edit details
          </CapsuleButton>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
          <AppText size={24} weight="900">
            {state.player.name}
          </AppText>
          <VerifiedBadge size={16} />
        </View>
        <AppText size={14} color={colors.muted}>
          {state.player.handle}
        </AppText>
        <AppText size={14} style={{ marginTop: 8 }}>
          {state.player.bio}
        </AppText>
        <AppText size={14} weight="800" style={{ marginTop: 8 }}>
          {formatCount(state.player.followers)}{" "}
          <AppText size={14} color={colors.muted2}>
            Followers
          </AppText>
        </AppText>

        {/* Fala 1 #16 — milestones strip removed. Goals tab is the
            single source of truth for milestones; mirroring the count
            here added clutter without information. */}

        <View style={{ gap: 10, marginTop: 14 }}>
          <Pressable
            onPress={() => setActivityLogOpen(true)}
            style={{
              backgroundColor: colors.surface,
              borderRadius: radii.pill,
              paddingHorizontal: 16,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <BookOpen color={colors.muted2} size={16} />
            <AppText size={15} weight="700">
              View Actions Log
            </AppText>
          </Pressable>
          <Pressable
            onPress={() => setCustomizeWorldOpen(true)}
            style={{
              backgroundColor: colors.surface,
              borderRadius: radii.pill,
              paddingHorizontal: 16,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Settings color={colors.muted2} size={16} />
            <AppText size={15} weight="700">
              Customize World
            </AppText>
          </Pressable>
        </View>

        {/* Fala 2 — Favorites section. Renders compact rows of the
            posts + replies the player starred. Tapping a row opens
            that post in PostDetailModal. */}
        {state.favoritedPostIds.length + state.favoritedReplyIds.length > 0 ? (
          <>
            <AppText size={18} weight="900" style={{ marginTop: 22, marginBottom: 10 }}>
              Favorites
            </AppText>
            <Card style={{ gap: 10 }}>
              {state.favoritedPostIds.slice(0, 6).map((pid) => {
                const fp = state.posts.find((p) => p.id === pid);
                if (!fp) return null;
                const fa =
                  fp.authorId === "player"
                    ? { name: state.player.name, handle: state.player.handle, avatar: state.player.avatar }
                    : resolveCharacter(fp.authorId);
                if (!fa) return null;
                return (
                  <Pressable
                    key={pid}
                    onPress={() => openPost(pid)}
                    style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}
                  >
                    <Avatar uri={fa.avatar} size={28} />
                    <View style={{ flex: 1 }}>
                      <AppText size={12} weight="900" numberOfLines={1}>
                        {fa.name}
                      </AppText>
                      <AppText size={12} color={colors.muted2} numberOfLines={2}>
                        {fp.text}
                      </AppText>
                    </View>
                    <Star color={colors.amber} fill={colors.amber} size={14} />
                  </Pressable>
                );
              })}
              {state.favoritedReplyIds.length > 0 ? (
                <AppText size={11} color={colors.muted2} style={{ marginTop: 4 }}>
                  + {state.favoritedReplyIds.length} starred reply
                  {state.favoritedReplyIds.length === 1 ? "" : "s"}
                </AppText>
              ) : null}
            </Card>
          </>
        ) : null}

        <AppText size={18} weight="900" style={{ marginTop: 22, marginBottom: 10 }}>
          Social Media Presence
        </AppText>
        <Card style={{ gap: 12 }}>
          <PresenceRow
            label="Humor"
            emoji="😎"
            value={state.player.socialPresence.humor}
            color={colors.lime}
          />
          <Divider />
          <PresenceRow
            label="Aura"
            emoji="✦"
            value={state.player.socialPresence.aura}
            color={colors.lime}
          />
        </Card>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 22,
            marginBottom: 10,
          }}
        >
          <AppText size={18} weight="900">
            Activities
          </AppText>
          <View style={{ flex: 1 }} />
          <AppText size={13} color={colors.blue} weight="700">
            View all
          </AppText>
        </View>
        {/* Audit-fix I7 — render scheduled activities (state.activities was
            populated by createActivity but never surfaced). Upcoming
            (scheduledDay >= today, unresolved) listed first; resolved ones
            show their outcome. Empty state keeps the create CTA. */}
        {state.activities.length === 0 ? (
          <Card style={{ gap: 12, alignItems: "center" }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: colors.surfaceAlt,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AppText size={20}>🎬</AppText>
            </View>
            <AppText size={13} color={colors.muted2} style={{ textAlign: "center" }}>
              Create activities and roleplay with your characters
            </AppText>
            <CapsuleButton size="md" onPress={() => setCreateActivityOpen(true)}>
              + Create activity
            </CapsuleButton>
          </Card>
        ) : (
          <View style={{ gap: 10 }}>
            {state.activities.slice(0, 6).map((act) => {
              const upcoming = !act.resolved && act.scheduledDay >= state.day;
              const inviteeAvatars = act.inviteeIds
                .map((id) => resolveCharacter(id))
                .filter(Boolean)
                .slice(0, 4) as Array<{ avatar: AvatarSource; name: string }>;
              return (
                <Card key={act.id} style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <AppText size={15} weight="900" style={{ flex: 1 }} numberOfLines={1}>
                      {act.title}
                    </AppText>
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 999,
                        backgroundColor: upcoming
                          ? "rgba(58,150,255,0.16)"
                          : colors.surfaceAlt,
                      }}
                    >
                      <AppText
                        size={11}
                        weight="800"
                        color={upcoming ? colors.blue : colors.muted2}
                      >
                        {upcoming ? `Day ${act.scheduledDay}` : "Resolved"}
                      </AppText>
                    </View>
                  </View>
                  {act.description ? (
                    <AppText size={13} color={colors.muted2} numberOfLines={2}>
                      {act.description}
                    </AppText>
                  ) : null}
                  {inviteeAvatars.length > 0 ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: -6 }}>
                      {inviteeAvatars.map((iv, idx) => (
                        <View key={idx} style={{ marginLeft: idx === 0 ? 0 : -6 }}>
                          <Avatar uri={iv.avatar} size={24} ring={colors.surface} ringWidth={2} />
                        </View>
                      ))}
                      <AppText size={12} color={colors.muted2} style={{ marginLeft: 8 }}>
                        {act.inviteeIds.length} invited
                      </AppText>
                    </View>
                  ) : null}
                  {act.resolved && act.outcome ? (
                    <View
                      style={{
                        borderTopColor: colors.divider,
                        borderTopWidth: 1,
                        paddingTop: 8,
                      }}
                    >
                      <AppText size={13} color={colors.muted}>
                        {act.outcome}
                      </AppText>
                    </View>
                  ) : null}
                </Card>
              );
            })}
            <CapsuleButton
              size="md"
              color={colors.surfaceAlt}
              onPress={() => setCreateActivityOpen(true)}
            >
              + Create activity
            </CapsuleButton>
          </View>
        )}

        <AppText size={18} weight="900" style={{ marginTop: 22, marginBottom: 10 }}>
          Relationships ({Object.keys(state.contacts).length})
        </AppText>
        {Object.keys(state.contacts).length === 0 ? (
          <Card style={{ gap: 8, alignItems: "center" }}>
            <AppText size={13} color={colors.muted2} style={{ textAlign: "center" }}>
              No relationships yet. Add characters from the Messages tab to start building.
            </AppText>
          </Card>
        ) : (
          <View style={{ gap: 10 }}>
            {Object.entries(state.contacts).map(([id, c]) => {
              const ch = resolveCharacter(id);
              if (!ch) return null;
              return (
                <Pressable key={id} onPress={() => openCharacterProfile(id)}>
                  <Card style={{ gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Avatar uri={ch.avatar} size={40} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                          <AppText size={15} weight="900">
                            {ch.name}
                          </AppText>
                          {ch.verified ? <VerifiedBadge size={13} /> : null}
                        </View>
                        <AppText size={12} color={colors.muted}>
                          {ch.handle}
                        </AppText>
                      </View>
                      <ChevronRight color={colors.muted2} size={18} />
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <CenteredBar value={c.vibe} />
                      <AppText size={13} weight="800">
                        {c.vibe.toFixed(1)}%
                      </AppText>
                    </View>
                    {c.vibeReason ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <DeltaPill delta={c.vibeDelta} />
                        <AppText size={12} color={colors.muted2} style={{ flex: 1 }}>
                          {c.vibeReason}
                        </AppText>
                      </View>
                    ) : null}
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}

        <AppText size={18} weight="900" style={{ marginTop: 22, marginBottom: 10 }}>
          Posts by {state.player.name.split(" ")[0]}
        </AppText>
        {state.posts.filter((p) => p.authorId === "player").length === 0 ? (
          <Card style={{ alignItems: "center", gap: 8 }}>
            <AppText size={13} color={colors.muted2} style={{ textAlign: "center" }}>
              You haven't posted anything yet. Tap the + on the feed to write your first post.
            </AppText>
          </Card>
        ) : (
          <View style={{ marginHorizontal: -18 }}>
            {state.posts
              .filter((p) => p.authorId === "player")
              .map((p, index) => (
                <FeedPostItem key={p.id} post={p} showDivider={index !== 0} />
              ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function PresenceRow({
  label,
  emoji,
  value,
  color,
}: {
  label: string;
  emoji: string;
  value: number;
  color: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <AppText size={14}>{emoji}</AppText>
      <AppText size={14} weight="700" style={{ width: 70 }}>
        {label}
      </AppText>
      <ProgressBar value={value} height={10} color={color} />
      <AppText size={13} weight="800" style={{ width: 56, textAlign: "right" }}>
        {value.toFixed(1)}%
      </AppText>
    </View>
  );
}

// ===================================================================
//  CHARACTER PROFILE MODAL
// ===================================================================

function CharacterProfileModal() {
  const {
    state,
    openCharacterProfile,
    changeChemistry,
    chemistryLabels,
    resolveCharacter,
    setEditingCharacterId,
    setActiveChatId,
    toggleMuteCharacter,
  } = useGame();
  const id = state.characterProfileId;
  const character = id ? resolveCharacter(id) : undefined;
  const contact = id ? state.contacts[id] : undefined;
  const insets = useSafeAreaInsets();
  const [chemistryPickerOpen, setChemistryPickerOpen] = useState(false);

  if (!id || !character) return null;
  const posts = state.posts.filter((p) => p.authorId === id);

  return (
    <Modal
      visible={!!id}
      animationType="slide"
      onRequestClose={() => openCharacterProfile(null)}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
          <View style={{ height: 200 }}>
            <Image source={imageSource(character.banner)} contentFit="cover" style={{ width: "100%", height: "100%" }} />
            <View
              style={{
                position: "absolute",
                top: insets.top + 4,
                left: 14,
                right: 14,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <IconButton size={34} color="rgba(0,0,0,0.55)" onPress={() => openCharacterProfile(null)}>
                <ArrowLeft color={colors.text} size={18} />
              </IconButton>
              <View style={{ flex: 1 }} />
              {/* Fala 1 #5 — left button = mute notifs toggle. Bell when
                  active, BellOff when muted. Tapping flips the state. */}
              <IconButton
                size={34}
                color="rgba(0,0,0,0.55)"
                onPress={() => {
                  Haptics.selectionAsync();
                  toggleMuteCharacter(id);
                }}
              >
                {state.mutedCharacterIds.includes(id) ? (
                  <BellOff color={colors.muted} size={16} />
                ) : (
                  <Bell color={colors.text} size={16} />
                )}
              </IconButton>
              <View style={{ width: 8 }} />
              {/* Fala 1 #5 — right button = settings sheet. Single
                  visible action right now (Mute toggle) so the player
                  has TWO entry points to the same control — bell is
                  the quick toggle, settings is the discoverable menu.
                  Future expansion: Block, Remove from cast, Report. */}
              <IconButton
                size={34}
                color="rgba(0,0,0,0.55)"
                onPress={() => {
                  const muted = state.mutedCharacterIds.includes(id);
                  Alert.alert(
                    character.name,
                    `What would you like to do with @${character.handle.replace(/^@/, "")}?`,
                    [
                      {
                        text: muted
                          ? "Unmute notifications"
                          : "Mute notifications",
                        onPress: () => toggleMuteCharacter(id),
                      },
                      { text: "Cancel", style: "cancel" },
                    ],
                  );
                }}
              >
                <Settings color={colors.text} size={16} />
              </IconButton>
            </View>
          </View>

          <View style={{ paddingHorizontal: 18, marginTop: -36 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
              <Avatar uri={character.avatar} size={82} ring={colors.purple} ringWidth={3} />
              <View style={{ flex: 1 }} />
              <CapsuleButton
                size="sm"
                onPress={() => {
                  // Close the profile sheet before the editor opens so they don't stack.
                  openCharacterProfile(null);
                  setEditingCharacterId(id);
                }}
              >
                Edit details
              </CapsuleButton>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
              <AppText size={22} weight="900">
                {character.name}
              </AppText>
              {character.verified ? <VerifiedBadge size={16} /> : null}
            </View>
            <AppText size={13} color={colors.muted}>
              {character.handle}
            </AppText>
            <AppText size={14} style={{ marginTop: 8 }}>
              {character.description ?? character.bio}
            </AppText>
            <AppText size={14} weight="800" style={{ marginTop: 8 }}>
              {formatCount(character.followers)}{" "}
              <AppText size={14} color={colors.muted2}>
                Followers
              </AppText>
            </AppText>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <CapsuleButton size="md" color={colors.surfaceAlt} style={{ flex: 1 }}>
                Following
              </CapsuleButton>
              <CapsuleButton
                size="md"
                style={{ flex: 1 }}
                onPress={() => setActiveChatId(id)}
              >
                Message
              </CapsuleButton>
            </View>

            {contact ? (
              <>
                <Card style={{ gap: 6, marginTop: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <AppText size={14}>💬</AppText>
                    <AppText size={14} weight="900">
                      Current Feeling
                    </AppText>
                    <View style={{ flex: 1 }} />
                    <Star color={colors.muted} size={16} />
                  </View>
                  <AppText size={13} weight="800" color={colors.amber}>
                    {contact.currentFeeling.headline.replace("Currently feeling ", "").toUpperCase()}!!!
                  </AppText>
                  <AppText size={13} color={colors.muted2}>
                    {contact.currentFeeling.detail}
                  </AppText>
                  <Pressable>
                    <AppText size={12} color={colors.blue}>
                      Show more
                    </AppText>
                  </Pressable>
                </Card>

                <Card style={{ gap: 10, marginTop: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <AppText size={14}>💖</AppText>
                    <AppText size={14} weight="900">
                      Your Relationship
                    </AppText>
                    <View style={{ flex: 1 }} />
                    <Star color={colors.muted} size={16} />
                  </View>
                  <Chip color={colors.amber} textColor="#1a1408" size="sm">
                    {contact.chemistryLabel}
                  </Chip>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <CenteredBar value={contact.vibe} />
                    <AppText size={13} weight="800">
                      {contact.vibe.toFixed(1)}%
                    </AppText>
                  </View>
                  <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                    <DeltaPill delta={contact.vibeDelta} />
                    <AppText size={12} color={colors.muted2} style={{ flex: 1 }}>
                      {contact.vibeReason}
                    </AppText>
                  </View>
                  <Pressable
                    onPress={() => setChemistryPickerOpen(true)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 6,
                    }}
                  >
                    <AppText size={13} weight="700">
                      Change chemistry
                    </AppText>
                    <ChevronDown color={colors.muted2} size={14} />
                  </Pressable>
                </Card>
              </>
            ) : null}

            {posts.length > 0 ? (
              <>
                <AppText size={18} weight="900" style={{ marginTop: 22, marginBottom: 10 }}>
                  Posts by {character.name.split(" ")[0]}
                </AppText>
                <View style={{ marginHorizontal: -18 }}>
                  {posts.map((p, index) => (
                    <FeedPostItem key={p.id} post={p} showDivider={index !== 0} />
                  ))}
                </View>
              </>
            ) : null}
          </View>
        </ScrollView>

        <Modal
          visible={chemistryPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setChemistryPickerOpen(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.7)",
              justifyContent: "center",
              padding: 24,
            }}
          >
            <Card style={{ gap: 12 }}>
              <AppText size={18} weight="900">
                Change chemistry
              </AppText>
              <AppText size={13} color={colors.muted2}>
                Pick the new vibe for {character.name}.
              </AppText>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {chemistryOptions.map((o) => (
                  <Pressable
                    key={o.id}
                    onPress={() => {
                      changeChemistry(id, o.id);
                      setChemistryPickerOpen(false);
                    }}
                    style={{
                      backgroundColor:
                        contact?.chemistry === o.id ? colors.amber : colors.surfaceAlt,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: radii.pill,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <AppText size={13}>{o.emoji}</AppText>
                    <AppText
                      size={13}
                      weight="800"
                      color={contact?.chemistry === o.id ? "#1a1408" : colors.text}
                    >
                      {o.label}
                    </AppText>
                  </Pressable>
                ))}
              </View>
              <CapsuleButton
                size="md"
                color={colors.surfaceSoft}
                onPress={() => setChemistryPickerOpen(false)}
              >
                Cancel
              </CapsuleButton>
            </Card>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

// ===================================================================
//  EDIT PROFILE MODAL
// ===================================================================

function EditProfileModal() {
  const { state, setEditProfileOpen, updateProfile, avatarChoices, bannerChoices } = useGame();
  const [name, setName] = useState(state.player.name);
  const [handle, setHandle] = useState(state.player.handle);
  const [bio, setBio] = useState(state.player.bio);
  const [description, setDescription] = useState(state.player.description);
  const [avatar, setAvatar] = useState(state.player.avatar);
  const [banner, setBanner] = useState(state.player.banner);
  const insets = useSafeAreaInsets();

  function save() {
    updateProfile({
      name: name.trim() || state.player.name,
      handle: handle.trim().startsWith("@") ? handle.trim() : `@${handle.trim()}`,
      bio,
      description,
      avatar,
      banner,
    });
    setEditProfileOpen(false);
  }

  return (
    <Modal
      visible={state.editProfileOpen}
      animationType="slide"
      onRequestClose={() => setEditProfileOpen(false)}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
          <View style={{ paddingHorizontal: 18, paddingTop: insets.top + 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
              <IconButton onPress={() => setEditProfileOpen(false)}>
                <ArrowLeft color={colors.text} size={20} />
              </IconButton>
              <AppText size={20} weight="900" style={{ marginLeft: 8 }}>
                Edit Profile
              </AppText>
            </View>
          </View>

          <View style={{ height: 140 }}>
            <Image source={imageSource(banner)} contentFit="cover" style={{ width: "100%", height: "100%" }} />
            <Pressable
              onPress={async () => {
                const uri = await pickImageAsync([16, 9]);
                if (uri) setBanner(uri);
              }}
              style={{ position: "absolute", right: 14, top: 12 }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: "rgba(0,0,0,0.6)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Pencil color={colors.text} size={16} />
              </View>
            </Pressable>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{
                position: "absolute",
                bottom: 8,
                left: 12,
                right: 12,
              }}
              contentContainerStyle={{ gap: 8 }}
            >
              {bannerChoices.map((b) => (
                <Pressable key={b} onPress={() => setBanner(b)}>
                  <Image
                    source={{ uri: b }}
                    style={{
                      width: 90,
                      height: 46,
                      borderRadius: 8,
                      borderWidth: banner === b ? 2 : 0,
                      borderColor: colors.amber,
                    }}
                    contentFit="cover"
                  />
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={{ paddingHorizontal: 18, marginTop: -40, gap: 16 }}>
            <View style={{ alignItems: "flex-start" }}>
              <View style={{ position: "relative" }}>
                <Avatar uri={avatar} size={70} ring={colors.bg} ringWidth={3} />
                <Pressable
                  onPress={async () => {
                    const uri = await pickImageAsync([1, 1]);
                    if (uri) setAvatar(uri);
                  }}
                  style={{
                    position: "absolute",
                    right: -4,
                    bottom: -4,
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: colors.blue,
                    borderWidth: 2,
                    borderColor: colors.bg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Pencil color={colors.text} size={12} />
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, marginTop: 10 }}
                style={{ marginTop: 10 }}
              >
                {avatarChoices.map((c) => (
                  <Pressable key={c} onPress={() => setAvatar(c)}>
                    <Avatar uri={c} size={40} ring={avatar === c ? colors.amber : undefined} />
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={{ gap: 6 }}>
              <AppText size={13} color={colors.muted2}>
                Character Name
              </AppText>
              <Field value={name} onChangeText={setName} placeholder="Enter your name..." />
            </View>
            <View style={{ gap: 6 }}>
              <AppText size={13} color={colors.muted2}>
                Handle
              </AppText>
              <Field value={handle} onChangeText={setHandle} placeholder="@handle" />
            </View>
            <View style={{ gap: 6 }}>
              <AppText size={13} color={colors.muted2}>
                Profile bio
              </AppText>
              <Field value={bio} onChangeText={setBio} placeholder="Short bio" multiline maxLength={1000} />
              <AppText size={11} color={colors.muted} style={{ textAlign: "right" }}>
                {bio.length}/1000
              </AppText>
            </View>
            <View style={{ gap: 6 }}>
              <AppText size={13} color={colors.muted2}>
                Description
              </AppText>
              <Field
                value={description}
                onChangeText={setDescription}
                placeholder="A longer description of you"
                multiline
              />
            </View>

            <CapsuleButton onPress={save}>Save</CapsuleButton>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ===================================================================
//  CUSTOMIZE WORLD MODAL
// ===================================================================

function CustomizeWorldModal() {
  const { state, activeWorld, setCustomizeWorldOpen, customizeWorld } = useGame();
  const [mainGoalTitle, setMainGoalTitle] = useState(activeWorld.mainGoal.title);
  const [setting, setSetting] = useState(activeWorld.setting ?? activeWorld.description);
  const [difficulty, setDifficulty] = useState<WorldDifficulty>(state.difficulty);
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={state.customizeWorldOpen}
      animationType="slide"
      onRequestClose={() => setCustomizeWorldOpen(false)}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
        <ScrollView contentContainerStyle={{ padding: 18, gap: 18, paddingBottom: 40 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <IconButton onPress={() => setCustomizeWorldOpen(false)}>
              <ArrowLeft color={colors.text} size={20} />
            </IconButton>
            <AppText size={20} weight="900" style={{ marginLeft: 8 }}>
              Customize world
            </AppText>
          </View>
          <View style={{ gap: 6 }}>
            <AppText size={15} weight="900">
              Your main character goal
            </AppText>
            <AppText size={12} color={colors.muted2}>
              Changing it unlocks new milestones and skills while keeping your current progress.
            </AppText>
            <Field
              value={mainGoalTitle}
              onChangeText={setMainGoalTitle}
              placeholder="Conquer Award Season"
              multiline
              maxLength={130}
            />
            <AppText size={11} color={colors.muted} style={{ textAlign: "right" }}>
              {mainGoalTitle.length}/130
            </AppText>
          </View>
          <View style={{ gap: 6 }}>
            <AppText size={15} weight="900">
              My world setting
            </AppText>
            <AppText size={12} color={colors.muted2}>
              Define the world your story takes place in. Focus on a specific era, perspective, or theme.
            </AppText>
            <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <AppText size={12} color={colors.amber}>
                ✨ Need Inspiration?
              </AppText>
              <ChevronDown color={colors.amber} size={12} />
            </Pressable>
            <Field
              value={setting}
              onChangeText={setSetting}
              placeholder="Describe your world..."
              multiline
              maxLength={1869}
            />
            <AppText size={11} color={colors.muted} style={{ textAlign: "right" }}>
              {setting.length}/1869
            </AppText>
          </View>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <AppText size={15} weight="900">
                Difficulty mode
              </AppText>
              <Chip size="sm" color={colors.purple}>
                ✦ PLUS
              </Chip>
            </View>
            <AppText size={12} color={colors.muted2}>
              Affects how fast you gain followers and how hard scandals hit.
            </AppText>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {difficultyOptions.map((d) => (
                <Pressable
                  key={d.id}
                  onPress={() => setDifficulty(d.id)}
                  style={{
                    flex: 1,
                    borderRadius: radii.md,
                    backgroundColor: difficulty === d.id ? colors.blue : colors.surfaceAlt,
                    paddingVertical: 14,
                    alignItems: "center",
                    borderWidth: difficulty === d.id ? 2 : 0,
                    borderColor: colors.blueSoft,
                  }}
                >
                  <AppText size={20}>{d.emoji}</AppText>
                  <AppText size={13} weight="900">
                    {d.label}
                  </AppText>
                  <AppText size={11} color={colors.muted2}>
                    {d.caption}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </View>

          <CapsuleButton onPress={() => customizeWorld({ mainGoalTitle, setting, difficulty })}>
            Save
          </CapsuleButton>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ===================================================================
//  ACTIVITY LOG MODAL
// ===================================================================

function ActivityLogModal() {
  const {
    state,
    setActivityLogOpen,
    rateOutcome,
    undoLastAction,
    toggleHideDMsInLog,
  } = useGame();
  const insets = useSafeAreaInsets();

  const items = state.hideDMsInLog
    ? state.activityLog.filter((l) => l.kind !== "chat-sent")
    : state.activityLog;

  return (
    <Modal
      visible={state.activityLogOpen}
      animationType="slide"
      onRequestClose={() => setActivityLogOpen(false)}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 18,
            paddingBottom: 8,
          }}
        >
          <IconButton onPress={() => setActivityLogOpen(false)}>
            <ArrowLeft color={colors.text} size={20} />
          </IconButton>
          <AppText size={20} weight="900" style={{ marginLeft: 8 }}>
            Activity Log
          </AppText>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={toggleHideDMsInLog}
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: state.hideDMsInLog ? colors.blue : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {state.hideDMsInLog ? <AppText size={12}>✓</AppText> : null}
            </View>
            <AppText size={13}>Hide DMs</AppText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 40 }}>
          <Pressable
            onPress={undoLastAction}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              padding: 14,
              borderRadius: radii.md,
              backgroundColor: "rgba(245,183,58,0.16)",
              borderColor: "rgba(245,183,58,0.4)",
              borderWidth: 1,
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: colors.amber,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AppText size={14}>↺</AppText>
            </View>
            <AppText size={15} weight="800">
              Undo last action
            </AppText>
            <View style={{ flex: 1 }} />
            <AppText size={13} color={colors.muted2}>
              Free
            </AppText>
          </Pressable>

          {items.length === 0 ? (
            <AppText size={13} color={colors.muted2} style={{ textAlign: "center", marginTop: 30 }}>
              Nothing logged yet. Make a move.
            </AppText>
          ) : null}

          {items.map((entry) => (
            <View key={entry.id} style={{ gap: 8 }}>
              {entry.kind === "milestone-completed" ? (
                <Card
                  style={{
                    gap: 6,
                    borderColor: colors.green,
                    backgroundColor: "rgba(57,224,122,0.10)",
                  }}
                >
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <Trophy color={colors.amber} size={18} />
                    <AppText size={14} weight="900" color={colors.green}>
                      Milestone completed:
                    </AppText>
                  </View>
                  <AppText size={14}>{entry.body}</AppText>
                </Card>
              ) : null}

              <Card style={{ gap: 8 }}>
                {entry.kind === "event-created" ? (
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <AppText size={16}>🎉</AppText>
                    <AppText size={14} weight="900" color={colors.pink}>
                      You created an event
                    </AppText>
                  </View>
                ) : null}
                {entry.kind === "post-published" ? (
                  <AppText size={13} weight="800" color={colors.blue}>
                    Posted to feed
                  </AppText>
                ) : null}
                {entry.body ? <AppText size={14}>{entry.body}</AppText> : null}
                {entry.outcome ? (
                  <View style={{ gap: 8 }}>
                    <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <AppText size={12} weight="800" color={colors.blue}>
                        Outcome
                      </AppText>
                      <ChevronDown color={colors.blue} size={12} />
                    </Pressable>
                    <AppText size={14} color={colors.muted2}>
                      {entry.outcome}
                    </AppText>
                  </View>
                ) : null}
                {entry.scoreChanges && entry.scoreChanges.length > 0 ? (
                  <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <AppText size={12} weight="800" color={colors.amber}>
                      Score Changes
                    </AppText>
                    <ChevronDown color={colors.amber} size={12} />
                  </Pressable>
                ) : null}
                {entry.scoreChanges?.map((s, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <AppText size={13} style={{ flex: 1 }}>
                      {s.label}
                    </AppText>
                    <AppText size={13} weight="800" color={s.positive ? colors.green : colors.amber}>
                      {s.positive ? "+" : ""}
                      {s.delta}
                    </AppText>
                  </View>
                ))}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 4,
                  }}
                >
                  <AppText size={11} color={colors.muted}>
                    {entry.createdAt}
                  </AppText>
                  <Pressable
                    onPress={() => rateOutcome(entry.id, 5)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                  >
                    <AppText size={11} color={colors.amber}>
                      Rate this outcome
                    </AppText>
                    <Star color={colors.amber} size={12} />
                  </Pressable>
                </View>
              </Card>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ===================================================================
//  APP SETTINGS MODAL
// ===================================================================

function AppSettingsModal() {
  const { state, setAppSettingsOpen, updateProfile, leaveScenario, resetSave } = useGame();
  const insets = useSafeAreaInsets();
  const [apiKey, setApiKey] = useState(state.player.apiKey);
  const [model, setModel] = useState(state.player.model);

  return (
    <Modal
      visible={state.appSettingsOpen}
      animationType="slide"
      onRequestClose={() => setAppSettingsOpen(false)}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
        <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 40 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <IconButton onPress={() => setAppSettingsOpen(false)}>
              <ArrowLeft color={colors.text} size={20} />
            </IconButton>
            <AppText size={20} weight="900" style={{ marginLeft: 8 }}>
              App Settings
            </AppText>
          </View>

          {/* Refactor #11 — widget was a Pressable with no onPress
              for many rounds (visual lie: "Tap to read" but nothing
              happened). Now opens a What's New alert with the v1.0
              launch summary so the chevron and the "Tap to read"
              subtitle deliver on their promise. */}
          <Pressable
            onPress={() =>
              Alert.alert(
                "What's new — v1.0",
                [
                  "• Crisis system: stan-wars-grade defense + Pop Craze diverts",
                  "• Pre-fetched events + suggestions — 0 ms when you tap",
                  "• Local avatar assets for every celeb / outlet / fan",
                  "• Plus Jakarta Sans across the UI",
                  "• Atomic save with corrupted-save preservation",
                ].join("\n"),
                [{ text: "OK" }],
              )
            }
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              padding: 14,
              borderRadius: radii.lg,
              backgroundColor: colors.surface,
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: "rgba(245,183,58,0.18)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AppText size={16}>📣</AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText size={14} weight="900">
                Important updates
              </AppText>
              <AppText size={12} color={colors.muted2}>
                Tap to read
              </AppText>
            </View>
            <ChevronRight color={colors.muted2} size={18} />
          </Pressable>

          <View style={{ alignItems: "center", gap: 6 }}>
            <Avatar uri={state.player.avatar} size={70} ring={colors.blue} ringWidth={2} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <AppText size={16} weight="800">
                {state.player.handle.replace("@", "")}
              </AppText>
              <Pencil color={colors.muted} size={14} />
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <AppText size={12} color={colors.muted2}>
              Account details
            </AppText>
            <Card style={{ gap: 0 }}>
              <SettingsRow icon={<User color={colors.muted2} size={16} />} label="Username" value={state.player.handle.replace(/^@/, "")} trailing={<Copy color={colors.muted} size={14} />} />
              <Divider />
              <SettingsRow icon={<LinkIcon color={colors.muted2} size={16} />} label="Link account" value="Link" valueColor={colors.blue} />
              <Divider />
              <SettingsRow icon={<Gift color={colors.muted2} size={16} />} label="Have a share code?" value="Add code" valueColor={colors.blue} />
            </Card>
          </View>

          <View style={{ gap: 8 }}>
            <AppText size={12} color={colors.muted2}>
              AI Chat Engine
            </AppText>
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Crown color={colors.amber} size={18} />
                <AppText size={14} weight="900">
                  Your key, your model
                </AppText>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["openai", "anthropic", "gemini"] as Provider[]).map((p) => (
                  <ProviderPill
                    key={p}
                    provider={p}
                    active={state.player.provider === p}
                    onPress={() => {
                      const defaultModel =
                        p === "openai"
                          ? "gpt-4o-mini"
                          : p === "anthropic"
                            ? "claude-sonnet-4-6"
                            : "gemini-2.5-flash";
                      setModel(defaultModel);
                      updateProfile({ provider: p, model: defaultModel });
                    }}
                  />
                ))}
              </View>
              <Field
                value={model}
                onChangeText={(next) => {
                  setModel(next);
                  updateProfile({ model: next });
                }}
                placeholder="model id"
              />
              <Field
                value={apiKey}
                onChangeText={(next) => {
                  setApiKey(next);
                  updateProfile({ apiKey: next });
                }}
                placeholder="Paste your API key"
                secureTextEntry
              />
            </Card>
          </View>

          <View style={{ gap: 8 }}>
            <AppText size={12} color={colors.muted2}>
              Preferences
            </AppText>
            <Card style={{ gap: 0 }}>
              <SettingsRow
                icon={<Sparkles color={colors.amber} size={16} />}
                label="Auto-roleplay world ticks"
                value="On"
                valueColor={colors.muted}
              />
            </Card>
          </View>

          <Card style={{ gap: 0 }}>
            <Pressable onPress={leaveScenario} style={{ paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <PersonStanding color={colors.text} size={16} />
              <AppText size={14}>Leave Scenario</AppText>
            </Pressable>
            <Divider />
            <Pressable onPress={resetSave} style={{ paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <LogOut color={colors.text} size={16} />
              <AppText size={14}>Log out / reset save</AppText>
            </Pressable>
            <Divider />
            <Pressable onPress={resetSave} style={{ paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Trash2 color={colors.red} size={16} />
              <AppText size={14} color={colors.red}>
                Delete Account
              </AppText>
            </Pressable>
          </Card>

          <AppText size={11} color={colors.muted} style={{ textAlign: "center" }}>
            App version 1.9.38
          </AppText>
        </ScrollView>
      </View>
    </Modal>
  );
}

function SettingsRow({
  icon,
  label,
  value,
  valueColor = colors.muted2,
  trailing,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14 }}>
      {icon}
      <AppText size={14} weight="700" style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText size={13} color={valueColor}>
        {value}
      </AppText>
      {trailing}
    </View>
  );
}

function ProviderPill({
  provider,
  active,
  onPress,
}: {
  provider: Provider;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        height: 40,
        borderRadius: radii.pill,
        backgroundColor: active ? colors.blue : colors.surfaceAlt,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AppText size={13} weight="800" style={{ textTransform: "capitalize" }}>
        {provider}
      </AppText>
    </Pressable>
  );
}

// ===================================================================
//  ADD CHARACTER MODAL
// ===================================================================

function AddCharacterModal() {
  const {
    state,
    setAddCharacterOpen,
    addCharacterFromCatalog,
    createCustomCharacter,
    cast,
    resolveCharacter,
  } = useGame();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"search" | "create">("search");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chemistry, setChemistry] = useState<ChemistryType>("co-conspirators");
  const castIds = new Set(cast.map((c) => c.id));

  // Custom form state
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("Roleplay in character. Keep replies short and casual. Never mention you are an AI.");

  const selectedChar = selectedId ? resolveCharacter(selectedId) : null;

  return (
    <Modal
      visible={state.addCharacterOpen}
      animationType="slide"
      onRequestClose={() => setAddCharacterOpen(false)}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View
          style={{
            paddingTop: insets.top + 8,
            paddingHorizontal: 18,
            paddingBottom: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }} />
            <AppText size={18} weight="900">
              {selectedChar ? "Add a New Character" : "Unlock a new character"}
            </AppText>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <IconButton size={32} onPress={() => setAddCharacterOpen(false)}>
                <X color={colors.text} size={16} />
              </IconButton>
            </View>
          </View>
        </View>

        {!selectedChar ? (
          <>
            <View
              style={{
                flexDirection: "row",
                gap: 10,
                paddingHorizontal: 18,
                marginBottom: 10,
              }}
            >
              <Pressable
                onPress={() => setTab("search")}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: radii.pill,
                  backgroundColor: tab === "search" ? colors.surfaceAlt : colors.surface,
                }}
              >
                <AppText size={13} weight="800">
                  🔍 Search existing
                </AppText>
                <Chip color={colors.amber} textColor="#1a1408" size="sm">
                  recommended
                </Chip>
              </Pressable>
              <Pressable
                onPress={() => setTab("create")}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: radii.pill,
                  backgroundColor: tab === "create" ? colors.surfaceAlt : colors.surface,
                }}
              >
                <AppText size={13} weight="800">
                  ✏ Create my own
                </AppText>
                <AppText size={11} color={colors.muted}>
                  advanced
                </AppText>
              </Pressable>
            </View>

            {tab === "search" ? (
              <ScrollView
                contentContainerStyle={{ padding: 18, gap: 12, paddingBottom: 80 }}
              >
                <AppText size={11} color={colors.muted2} style={{ textTransform: "uppercase" }}>
                  Curated by the preset creator for this scenario.
                </AppText>
                {catalogAll
                  .filter((c) => "systemPrompt" in c)
                  .map((c) => {
                    const character = c as Character;
                    const added = castIds.has(character.id);
                    return (
                      <Pressable
                        key={character.id}
                        onPress={() => !added && setSelectedId(character.id)}
                        style={{
                          padding: 12,
                          borderRadius: radii.lg,
                          backgroundColor: colors.surface,
                          gap: 8,
                          opacity: added ? 0.5 : 1,
                        }}
                      >
                        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                          <Avatar uri={character.avatar} size={44} />
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <AppText size={15} weight="900">
                                {character.name}
                              </AppText>
                              {character.verified ? <VerifiedBadge size={12} /> : null}
                              {added ? (
                                <AppText size={12} color={colors.green} weight="800">
                                  Added
                                </AppText>
                              ) : null}
                            </View>
                            <AppText size={12} color={colors.muted} numberOfLines={2}>
                              {character.bio}
                            </AppText>
                          </View>
                        </View>
                        <AppText size={12} color={colors.muted2} numberOfLines={3}>
                          {character.description ?? character.bio}
                        </AppText>
                      </Pressable>
                    );
                  })}
              </ScrollView>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 18, gap: 12, paddingBottom: 100 }}>
                <Field value={name} onChangeText={setName} placeholder="Character name" />
                <Field value={handle} onChangeText={setHandle} placeholder="@handle" />
                <Field value={bio} onChangeText={setBio} placeholder="Short bio" multiline />
                <Field value={description} onChangeText={setDescription} placeholder="Longer description / personality" multiline />
                <Field value={systemPrompt} onChangeText={setSystemPrompt} placeholder="AI system prompt" multiline />
                <CapsuleButton
                  disabled={!name.trim() || !handle.trim()}
                  onPress={() => {
                    createCustomCharacter({
                      name,
                      handle: handle.startsWith("@") ? handle : `@${handle}`,
                      bio,
                      description,
                      avatar:
                        "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80",
                      banner:
                        "https://images.unsplash.com/photo-1483393458019-411bc6bd104e?auto=format&fit=crop&w=1200&q=80",
                      systemPrompt,
                    });
                  }}
                >
                  Add character
                </CapsuleButton>
              </ScrollView>
            )}
          </>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
            <View style={{ height: 200, marginBottom: 10 }}>
              <Image
                source={imageSource(selectedChar.banner)}
                contentFit="cover"
                style={{ width: "100%", height: "100%" }}
              />
              <View style={{ position: "absolute", left: 14, top: 14 }}>
                <IconButton size={34} color="rgba(0,0,0,0.55)" onPress={() => setSelectedId(null)}>
                  <ArrowLeft color={colors.text} size={18} />
                </IconButton>
              </View>
              <View
                style={{
                  position: "absolute",
                  alignSelf: "center",
                  bottom: -36,
                }}
              >
                <Avatar uri={selectedChar.avatar} size={84} ring={colors.bg} ringWidth={3} />
              </View>
            </View>
            <View style={{ paddingHorizontal: 18, marginTop: 38 }}>
              <View style={{ alignItems: "center", gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <AppText size={20} weight="900">
                    {selectedChar.name}
                  </AppText>
                  {selectedChar.verified ? <VerifiedBadge size={14} /> : null}
                </View>
                <AppText size={13} color={colors.muted}>
                  {selectedChar.handle}
                </AppText>
              </View>

              <AppText size={15} weight="900" style={{ marginTop: 18 }}>
                Bio
              </AppText>
              <AppText size={13} color={colors.muted2} style={{ marginTop: 4 }}>
                {selectedChar.bio}
              </AppText>

              <AppText size={15} weight="900" style={{ marginTop: 14 }}>
                Description
              </AppText>
              <AppText size={13} color={colors.muted2} style={{ marginTop: 4 }}>
                {selectedChar.description ?? selectedChar.bio}
              </AppText>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 18 }}>
                <AppText size={14} weight="900">
                  Relationship chemistry
                </AppText>
                <Chip size="sm" color={colors.purple}>
                  ✦ PLUS
                </Chip>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  flexWrap: "wrap",
                  marginTop: 10,
                }}
              >
                {chemistryOptions.map((o) => (
                  <Pressable
                    key={o.id}
                    onPress={() => setChemistry(o.id)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: radii.pill,
                      backgroundColor: chemistry === o.id ? colors.amber : colors.surface,
                      borderColor: colors.borderSoft,
                      borderWidth: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <AppText size={13}>{o.emoji}</AppText>
                    <AppText
                      size={13}
                      weight="800"
                      color={chemistry === o.id ? "#1a1408" : colors.text}
                    >
                      {o.label}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>
        )}

        {selectedChar ? (
          <BottomAction>
            <CapsuleButton
              onPress={() => {
                addCharacterFromCatalog(selectedChar.id, chemistry);
                setSelectedId(null);
              }}
            >
              Add character
            </CapsuleButton>
          </BottomAction>
        ) : null}
      </View>
    </Modal>
  );
}

// ===================================================================
//  POST DETAIL MODAL
// ===================================================================

function PostDetailModal() {
  const {
    state,
    openPost,
    replyToPost,
    replyToThreadReply,
    likePost,
    repostPost,
    likeThreadReply,
    openCharacterProfile,
    resolveCharacter,
    refreshFeed,
    toggleFavoriteReply,
    toggleFavoritePost,
    reportPost,
  } = useGame();
  const insets = useSafeAreaInsets();
  const post = state.posts.find((p) => p.id === state.openPostId);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  // Fala 1 #1 — activeReplyId is now the ONLY sub-reply state. When
  // non-null, the bottom composer shows "Replying to @handle" context
  // and submits to replyToThreadReply instead of replyToPost. The
  // separate subReplyText buffer is gone — the unified `reply` state
  // covers both cases.
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  // Round 1.11.32 Faza F Fix #1 — ref so the top "Reply" action pill can
  // focus the bottom composer (same behavior as tapping the input).
  const replyInputRef = useRef<TextInput | null>(null);
  // Faza K #2 — composer is HIDDEN by default. Opens only when the
  // player taps the top "Reply" pill. Reduces visual noise on a fresh
  // open (screenshot IMG_5413: previously two reply inputs sat on
  // screen at once, the always-on bottom composer competing with an
  // inline sub-reply input). Closes on backdrop tap or after a
  // successful send.
  const [composerOpen, setComposerOpen] = useState(false);
  // Fala 2 — pop animations matching FeedPostItem. Heart for the
  // post-level like + repost zap. Replies use a shared scale ref via
  // a small subcomponent so each reply gets its own bounce.
  const headerHeartScale = useRef(new Animated.Value(1)).current;
  const headerZapScale = useRef(new Animated.Value(1)).current;
  const popIcon = (val: Animated.Value) => {
    Animated.sequence([
      Animated.timing(val, { toValue: 1.4, duration: 110, useNativeDriver: true }),
      Animated.spring(val, { toValue: 1, useNativeDriver: true, damping: 8, stiffness: 200 }),
    ]).start();
  };
  // Reset composer state whenever the modal swaps to a different post
  // (or closes entirely). Without this, opening Post B after replying
  // in Post A would inherit the open-state and leftover draft.
  useEffect(() => {
    setComposerOpen(false);
    setReply("");
    setActiveReplyId(null);
  }, [state.openPostId]);
  // Round 1.11.5 — local refreshing flag drives RefreshControl spinner on the
  // post detail ScrollView. Pulling down inside an open post fires
  // refreshFeed(), which consumes the next pending action — if the player
  // just replied to THIS post the head of the queue IS a post-replies action
  // for it, so the AI batch lands here without leaving the modal. Side
  // benefit: applyPostReplies bumps engagement on the player's own replies
  // in this post when it runs.
  const [refreshingPost, setRefreshingPost] = useState(false);
  const onPullRefresh = async () => {
    if (refreshingPost || state.isGenerating) return;
    setRefreshingPost(true);
    try {
      await refreshFeed();
    } finally {
      setRefreshingPost(false);
    }
  };

  if (!post) return null;
  const author =
    post.authorId === "player"
      ? {
          id: "player",
          name: state.player.name,
          handle: state.player.handle,
          avatar: state.player.avatar,
          verified: true,
        }
      : resolveCharacter(post.authorId);
  if (!author) return null;

  async function send() {
    const t = reply.trim();
    if (!t || sending) return;
    const targetReplyId = activeReplyId; // capture before reset
    setReply("");
    setSending(true);
    try {
      // Fala 1 #1 — branch on activeReplyId. Null = top-level reply
      // to the post; non-null = sub-reply to that specific comment.
      // Both flows share the same composer + state machinery.
      if (targetReplyId) {
        await replyToThreadReply(post!.id, targetReplyId, t);
      } else {
        await replyToPost(post!.id, t);
      }
      // Faza K #2 — auto-close composer after a successful send so the
      // player goes straight back to reading the thread.
      setComposerOpen(false);
      setActiveReplyId(null);
      Keyboard.dismiss();
    } finally {
      setSending(false);
    }
  }

  function renderReply({
    reply: r,
    isFirst,
  }: {
    reply: NonNullable<typeof post>["threadReplies"][number];
    isFirst: boolean;
  }): React.ReactNode {
    const rAuthor =
      r.authorId === "player"
        ? {
            id: "player",
            name: state.player.name,
            handle: state.player.handle,
            avatar: state.player.avatar,
            verified: true,
          }
        : resolveCharacter(r.authorId);
    if (!rAuthor) return null;
    // Faza J #1 — flat thread layout. Each reply renders at uniform
    // paddingHorizontal: 14 regardless of where it sits in the
    // conversation tree. Threading is communicated lexically via the
    // @parent_handle blue tag prefix inside the reply text. No more
    // pyramid indent, no more children.map recursion — discussion reads
    // naturally top-to-bottom in chronological order.
    const isOpen = activeReplyId === r.id;
    // Lookup parent author for the blue @handle prefix when this is a
    // sub-reply (not a top-level reply to the post itself).
    let parentTag: { handle: string; authorId: string } | null = null;
    if (r.parentReplyId) {
      const parent = post!.threadReplies.find((p) => p.id === r.parentReplyId);
      if (parent) {
        const parentAuthor =
          parent.authorId === "player"
            ? { handle: state.player.handle }
            : resolveCharacter(parent.authorId);
        if (parentAuthor) {
          parentTag = { handle: parentAuthor.handle, authorId: parent.authorId };
        }
      }
    }
    return (
      <View key={r.id}>
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderTopWidth: isFirst ? 0 : 1,
            borderTopColor: colors.divider,
            flexDirection: "row",
            gap: 10,
          }}
        >
          <Pressable
            onPress={() => r.authorId !== "player" && openCharacterProfile(r.authorId)}
          >
            <Avatar uri={rAuthor.avatar} size={36} />
          </Pressable>
          <View style={{ flex: 1, gap: 4 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 5,
              }}
            >
              <AppText size={13} weight="900">
                {rAuthor.name}
              </AppText>
              {rAuthor.verified ? <VerifiedBadge size={12} /> : null}
              <AppText size={12} color={colors.muted}>
                {rAuthor.handle}
              </AppText>
            </View>
            <AppText size={14}>
              {/* Faza J #1 — blue clickable @parent tag prefix when this
                  reply is a sub-thread response. Tapping the tag opens
                  the parent author's profile (or no-op for player). We
                  use an AppText with onPress directly via nested Text
                  semantics: React Native lets inline <Text onPress>
                  work as an inline tappable span. AppText doesn't
                  forward onPress, so we wrap a Pressable around the
                  whole reply text instead — when the player taps the
                  blue prefix we open the parent profile; taps on the
                  body text fall through harmlessly (Pressable is
                  position: relative inside flowing text). */}
              {parentTag &&
              // Faza K #1 defensive guard — legacy replies saved before
              // we killed the setSubReplyText prefill may already have
              // "@parent_handle" baked into the body text. Skip the
              // blue tag prefix in that case so we don't render
              // "@billieeilish @billieeilish craaazy" twice on old saves.
              !r.text
                .trim()
                .toLowerCase()
                .startsWith(parentTag.handle.toLowerCase()) ? (
                <AppText size={14}>
                  <AppText
                    size={14}
                    weight="800"
                    color={colors.blue}
                  >
                    {parentTag.handle}
                  </AppText>
                  {" "}
                  {renderMentions(r.text.replace("@player", state.player.handle))}
                </AppText>
              ) : (
                renderMentions(r.text.replace("@player", state.player.handle))
              )}
            </AppText>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <Pressable
                onPress={() => likeThreadReply(post!.id, r.id)}
                style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
              >
                <Heart
                  color={r.liked ? colors.pink : colors.muted}
                  fill={r.liked ? colors.pink : "transparent"}
                  size={14}
                />
                <AppText size={12} color={r.liked ? colors.pink : colors.muted}>
                  {formatCount(r.likes)}
                </AppText>
              </Pressable>
              <Pressable
                onPress={() => {
                  // Fala 1 #1 — unified composer. Tapping Reply on any
                  // comment opens the SAME bottom composer used for
                  // top-level replies, with a context bar showing
                  // "Replying to @handle" and a cancel button to drop
                  // back to top-level scope. No more inline form
                  // disappearing under the keyboard at the bottom of
                  // the thread.
                  if (isOpen) {
                    setActiveReplyId(null);
                    setComposerOpen(false);
                    Keyboard.dismiss();
                  } else {
                    setActiveReplyId(r.id);
                    setComposerOpen(true);
                    setTimeout(() => replyInputRef.current?.focus(), 50);
                  }
                }}
              >
                <AppText size={12} color={isOpen ? colors.blue : colors.muted}>
                  Reply
                </AppText>
              </Pressable>
              <View style={{ flex: 1 }} />
              {/* Fala 2 — favorite star is now interactive. Filled
                  yellow when this reply is in favoritedReplyIds. */}
              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync().catch(() => undefined);
                  toggleFavoriteReply(r.id);
                }}
                hitSlop={6}
              >
                <Star
                  color={
                    state.favoritedReplyIds.includes(r.id)
                      ? colors.amber
                      : colors.muted
                  }
                  fill={
                    state.favoritedReplyIds.includes(r.id)
                      ? colors.amber
                      : "transparent"
                  }
                  size={14}
                />
              </Pressable>
            </View>
            {/* Fala 1 #1 — inline sub-reply form removed. The bottom
                composer handles every reply, top-level or threaded,
                with a "Replying to @handle" context bar when scoped
                to a comment. */}
          </View>
        </View>
      </View>
    );
  }

  return (
    <Modal
      visible={!!state.openPostId}
      animationType="slide"
      onRequestClose={() => openPost(null)}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View
          style={{
            paddingTop: insets.top + 6,
            paddingHorizontal: 14,
            paddingBottom: 12,
            flexDirection: "row",
            alignItems: "center",
            borderBottomColor: colors.divider,
            borderBottomWidth: 1,
          }}
        >
          <IconButton size={36} onPress={() => openPost(null)} color="transparent">
            <ArrowLeft color={colors.text} size={20} />
          </IconButton>
          <View style={{ flex: 1, alignItems: "center" }}>
            <AppText size={16} weight="900">
              Post
            </AppText>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          // Faza K #2 — paddingBottom adapts to composer visibility:
          // when closed the scroll content can run all the way to the
          // safe-area edge; when open we leave headroom equal to the
          // composer height so the last reply stays tappable above it.
          contentContainerStyle={{
            paddingBottom: composerOpen ? 200 : insets.bottom + 24,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshingPost}
              onRefresh={onPullRefresh}
              tintColor={colors.blue}
              colors={[colors.blue]}
            />
          }
        >
          <View style={{ padding: 18, gap: 12 }}>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <Pressable
                onPress={() =>
                  post.authorId !== "player" && openCharacterProfile(post.authorId)
                }
              >
                <Avatar uri={author.avatar} size={44} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <AppText size={15} weight="900">
                    {author.name}
                  </AppText>
                  {author.verified ? <VerifiedBadge size={14} /> : null}
                </View>
                <AppText size={13} color={colors.muted}>
                  {author.handle}
                </AppText>
              </View>
            </View>
            <AppText size={17} selectable style={{ lineHeight: 24 }}>
              {renderMentions(post.text.replace("@player", state.player.handle))}
            </AppText>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <AppText size={13} color={colors.muted}>
                {post.createdAt}
              </AppText>
              <AppText size={13} color={colors.muted}>
                ·
              </AppText>
              <AppText size={13} color={colors.muted}>
                Day {post.day}
              </AppText>
              {post.views ? (
                <>
                  <AppText size={13} color={colors.muted}>
                    ·
                  </AppText>
                  <AppText size={13} weight="800">
                    {post.views}
                  </AppText>
                  <AppText size={13} color={colors.muted}>
                    Views
                  </AppText>
                </>
              ) : null}
            </View>
          </View>
          <Divider />
          <View
            style={{
              flexDirection: "row",
              paddingVertical: 14,
              paddingHorizontal: 14,
              gap: 10,
              alignItems: "center",
            }}
          >
            {/* Reply pill — primary action, keeps blue fill.
                Round 1.11.32 Faza F Fix #1 — now a Pressable that focuses
                the bottom composer.
                Faza K #2 — additionally toggles composerOpen. The
                composer is hidden by default; this pill is the ONLY
                entry point for top-level replies. We delay focus()
                one tick so the TextInput is mounted by the time
                React Native tries to bring it up. */}
            <Pressable
              onPress={() => {
                setComposerOpen(true);
                setTimeout(() => replyInputRef.current?.focus(), 50);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                backgroundColor: colors.blue,
                paddingHorizontal: 14,
                height: 34,
                borderRadius: radii.pill,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <MessageCircle color={colors.text} size={14} fill={colors.text} />
              <AppText size={13} weight="800">
                Reply
              </AppText>
            </Pressable>
            {/* Repost — same pill shape & height as Reply so they sit on one perfectly aligned row.
                Fala 2 — Animated.View wrapper for pop on tap. */}
            <Pressable
              onPress={() => {
                popIcon(headerZapScale);
                repostPost(post.id);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                backgroundColor: post.reposted ? "rgba(0,200,120,0.16)" : colors.surfaceAlt,
                paddingHorizontal: 14,
                height: 34,
                borderRadius: radii.pill,
              }}
            >
              <Animated.View style={{ transform: [{ scale: headerZapScale }] }}>
                <Zap
                  color={post.reposted ? colors.green : colors.muted2}
                  fill={post.reposted ? colors.green : "transparent"}
                  size={14}
                />
              </Animated.View>
              <AppText size={13} color={post.reposted ? colors.green : colors.muted}>
                {post.reposts}
              </AppText>
            </Pressable>
            {/* Like — same pill shape & height. Fala 2 — Animated.View pop. */}
            <Pressable
              onPress={() => {
                popIcon(headerHeartScale);
                likePost(post.id);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                backgroundColor: post.liked ? "rgba(255,67,143,0.14)" : colors.surfaceAlt,
                paddingHorizontal: 14,
                height: 34,
                borderRadius: radii.pill,
              }}
            >
              <Animated.View style={{ transform: [{ scale: headerHeartScale }] }}>
                <Heart
                  color={post.liked ? colors.pink : colors.muted2}
                  fill={post.liked ? colors.pink : "transparent"}
                  size={14}
                />
              </Animated.View>
              <AppText size={13} color={post.liked ? colors.pink : colors.muted}>
                {formatCount(post.likes)}
              </AppText>
            </Pressable>
          </View>
          <Divider />
          {post.threadReplies.length === 0 ? (
            <AppText
              size={13}
              color={colors.muted2}
              style={{ textAlign: "center", padding: 24 }}
            >
              No replies yet. Be the first.
            </AppText>
          ) : (
            (() => {
              // Faza J #1 — flat chronological feed of every reply (top
              // level + sub-thread), oldest first. We sort by the numeric
              // timestamp baked into each reply's id ("tr-1700000-0",
              // "r-1700001") so that AI sub-thread replies generated in
              // the same batch sit in their original generation order —
              // matching how the conversation actually unfolded. Parent
              // relationships are kept around for the @handle prefix
              // tag inside renderReply, NOT for indent or filtering.
              const ordered = [...post.threadReplies].sort((a, b) => {
                const ma = a.id.match(/(\d+)/);
                const mb = b.id.match(/(\d+)/);
                const ta = ma ? parseInt(ma[1], 10) : 0;
                const tb = mb ? parseInt(mb[1], 10) : 0;
                return ta - tb;
              });
              return ordered.map((r, i) =>
                renderReply({ reply: r, isFirst: i === 0 }),
              );
            })()
          )}
        </ScrollView>

        {/* Faza K #2 — backdrop dim layer sits between the post body and
            the composer. Tapping it dismisses both the keyboard and
            the composer itself, so the player can quickly bail without
            reaching for the corner Back arrow. Pointer-events are
            "auto" so the touch is captured; the composer above it has
            a higher z-order via React Native's last-rendered-is-on-top
            rule. */}
        {composerOpen && (
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              setComposerOpen(false);
            }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.45)",
            }}
          />
        )}
        {composerOpen && (
        <KeyboardAvoidingView
          // Faza I #2 — Platform-conditional, mirrors ChatRoom logic.
          // Android's adjustResize already resizes the window; layering
          // padding behavior on top causes a "flying composer" bug. iOS
          // needs explicit offset because the keyboard overlays the view.
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.bottom + 30 : 0}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 14,
            paddingTop: 14,
            // Faza K #3 — insets.bottom guarantees the composer never
            // slips under the home indicator on devices with safe area.
            // We add a small +12 cushion so the Post button isn't
            // flush against the bottom edge.
            paddingBottom: insets.bottom + 12,
            backgroundColor: colors.surfaceDeep,
            borderTopColor: colors.divider,
            borderTopWidth: 1,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Avatar uri={state.player.avatar} size={36} />
            <View>
              <AppText size={13} weight="800">
                {state.player.name}
              </AppText>
              <AppText size={11} color={colors.muted}>
                {state.player.handle}
              </AppText>
            </View>
          </View>
          {/* Fala 1 #1 — sub-reply scope context bar. Shows "Replying
              to @handle" when activeReplyId is set, with an X to drop
              back to top-level scope. Mirrors Twitter's "Replying to"
              header above the input. */}
          {activeReplyId
            ? (() => {
                const target = post.threadReplies.find(
                  (x) => x.id === activeReplyId,
                );
                if (!target) return null;
                const targetAuthor =
                  target.authorId === "player"
                    ? {
                        handle: state.player.handle,
                      }
                    : resolveCharacter(target.authorId);
                if (!targetAuthor) return null;
                return (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      backgroundColor: colors.surface,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: radii.pill,
                      alignSelf: "flex-start",
                    }}
                  >
                    <AppText size={12} color={colors.muted}>
                      Replying to
                    </AppText>
                    <AppText size={12} weight="800" color={colors.blue}>
                      {targetAuthor.handle}
                    </AppText>
                    <Pressable
                      onPress={() => setActiveReplyId(null)}
                      hitSlop={8}
                      style={{ marginLeft: 4 }}
                    >
                      <AppText size={12} color={colors.muted2}>
                        ×
                      </AppText>
                    </Pressable>
                  </View>
                );
              })()
            : null}
          <TextInput
            ref={replyInputRef}
            value={reply}
            onChangeText={setReply}
            placeholder={
              activeReplyId
                ? "Tweet your reply"
                : `Reply to ${author.handle}`
            }
            placeholderTextColor={colors.muted}
            multiline
            // Faza I #5B — top-level reply matches Twitter reply length.
            maxLength={280}
            style={{
              color: colors.text,
              fontSize: 15,
              minHeight: 36,
              maxHeight: 90,
              textAlignVertical: "top",
            }}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderStyle: "dashed",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: radii.pill,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Plus color={colors.muted2} size={12} />
              <AppText size={12} color={colors.muted2}>
                Add a boost
              </AppText>
            </View>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={send}
              disabled={!reply.trim() || sending || state.isGenerating}
              style={{
                backgroundColor:
                  reply.trim() && !sending && !state.isGenerating
                    ? colors.blue
                    : colors.surfaceSoft,
                paddingHorizontal: 18,
                paddingVertical: 8,
                borderRadius: radii.pill,
              }}
            >
              <AppText
                size={13}
                weight="800"
                color={
                  reply.trim() && !sending && !state.isGenerating ? colors.text : colors.muted
                }
              >
                Post
              </AppText>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
}

// ===================================================================
//  WORLD UPDATE TOAST
// ===================================================================

function WorldUpdateToast() {
  const { state, dismissToast, resolveCharacter } = useGame();
  const insets = useSafeAreaInsets();
  const toast = state.lastToast;
  // Expanded mode (Round 1.11 B) — when true the toast renders the rich
  // Score Changes panel + Relationships cards instead of the compact summary.
  // Reset to collapsed every time a new toast appears.
  const [expanded, setExpanded] = useState(false);
  // Round 1.11.32 — animated slide-down from the top, system-push style.
  // The toast now lives anchored to the safe-area top inset (+8 px breathing
  // room) so Notch / Dynamic Island / status bar can never overlap text.
  // translateY starts above the screen (-700) and springs into place when a
  // new toast appears; dismiss runs the spring in reverse before clearing
  // state.
  const slide = useRef(new Animated.Value(-700)).current;
  // Round 1.11.32 G-Fix #2 — explicit Animated.Value drives the expanded
  // panel's height + opacity together (0 → 1 on expand, 1 → 0 on
  // collapse). We DO NOT toggle render of the panel anymore — it's
  // always mounted inside an Animated.View with overflow: hidden, and
  // the height interp grows/shrinks it. That kills the previous jank
  // where flipping `expanded ? <Panel /> : null` made the layout pop.
  // useNativeDriver: false because height isn't native-driverable; the
  // animation is short enough (220ms) that JS thread cost is invisible.
  const expandValue = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(expandValue, {
      toValue: expanded ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [expanded, expandValue]);
  // Round 1.11.32 Faza F Fix #3 — animateOut chains animation → state
  // clear. ANY programmatic dismiss (close button, auto-timer, etc.)
  // routes through this helper so the toast finishes its exit slide
  // before the component unmounts. Without the chain, dismissToast()
  // tore the toast off-screen with no animation = visible glitch.
  const animateOut = (after: () => void) => {
    Animated.timing(slide, {
      toValue: -700,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) after();
    });
  };
  useEffect(() => {
    setExpanded(false);
    if (toast) {
      slide.setValue(-700);
      Animated.spring(slide, {
        toValue: 0,
        useNativeDriver: true,
        damping: 18,
        stiffness: 160,
        mass: 1,
      }).start();
    }
  }, [toast?.id, slide, toast]);
  // Round 1.11.32 Faza F Fix #3 — auto-dismiss timer. 8 seconds gives
  // the player time to read the toast, then animateOut(dismissToast) is
  // called so the exit slide plays before the component clears. Timer
  // resets every time toast.id changes. We DO NOT auto-dismiss while
  // expanded — the player is actively reading the details panel.
  useEffect(() => {
    if (!toast) return;
    if (expanded) return;
    const timer = setTimeout(() => {
      animateOut(dismissToast);
    }, 8000);
    return () => clearTimeout(timer);
    // animateOut + dismissToast are stable refs; we only re-arm on toast
    // change or expanded toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.id, expanded]);
  if (!toast) return null;

  // Body for collapsed view — prefer pithy AI-supplied summary, fall back
  // to first sentence of full body so we don't dump a paragraph into the
  // toast on legacy entries.
  const collapsedBody = toast.summary || toast.body.split(".")[0];

  // 2-column grid of relationship chips (max 4, like original Status). Each
  // chip shows mini-avatar in a green/amber ring + first-name + arrow.
  const relChips = (toast.relationshipChanges ?? toast.relationshipDeltas.map((d) => ({
    characterId: d.characterId,
    delta: d.direction === "up" ? 1 : -1,
    rationale: "",
    vibeAfter: 0,
  }))).slice(0, 4);

  // Sticky header — always rendered at the top of the toast card, even when
  // body is scrolled. Houses the XP pill on the left and the X close button
  // on the right. Without this, on small screens with long expanded content
  // the close button used to scroll out of reach.
  const stickyHeader = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {toast.xpDelta && toast.xpDelta > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Sparkles color={colors.amber} size={16} />
            <AppText size={14} weight="900" color={colors.amber}>
              +{toast.xpDelta} XP
            </AppText>
          </View>
        ) : (
          <AppText size={14} weight="900" style={{ flex: 1 }} numberOfLines={1}>
            {toast.headline}
          </AppText>
        )}
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => animateOut(dismissToast)} hitSlop={14}>
          <X color={colors.muted2} size={18} />
        </Pressable>
      </View>
      <Divider />
    </>
  );

  // Body content — same for collapsed and expanded. When expanded the
  // body is wrapped in a ScrollView (below) so it can be scrolled
  // independently of the sticky header.
  const bodyContent = (
    <>
      {/* Followers chunky pill */}
      {toast.followerDelta && toast.followerDelta > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Users color={colors.blue} size={18} />
          <AppText size={16} weight="900">
            Followers
          </AppText>
          <AppText size={16} weight="900" color={colors.green}>
            +{formatCount(toast.followerDelta)}
          </AppText>
        </View>
      ) : null}

      {/* Pithy slogan body */}
      {collapsedBody ? (
        <AppText size={13} color={colors.muted2}>
          {collapsedBody}
        </AppText>
      ) : null}

      {/* Humor / Aura row */}
      {(toast.humorDelta !== undefined || toast.auraDelta !== undefined || toast.presenceDeltas.length > 0) && (
        <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
          {(toast.humorDelta !== undefined || toast.presenceDeltas.some((d) => d.key === "humor")) && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <AppText size={14}>🤣</AppText>
              <AppText size={13} weight="800">Humor</AppText>
              <AppText
                size={13}
                weight="900"
                color={(toast.humorDelta ?? 0) >= 0 ? colors.green : colors.amber}
              >
                {toast.humorDelta !== undefined
                  ? `${toast.humorDelta >= 0 ? "+" : ""}${toast.humorDelta.toFixed(1)}%`
                  : toast.presenceDeltas.find((d) => d.key === "humor")?.direction === "up"
                    ? "↑"
                    : "↓"}
              </AppText>
            </View>
          )}
          {(toast.auraDelta !== undefined || toast.presenceDeltas.some((d) => d.key === "aura")) && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <AppText size={14}>❤️‍🔥</AppText>
              <AppText size={13} weight="800">Aura</AppText>
              <AppText
                size={13}
                weight="900"
                color={(toast.auraDelta ?? 0) >= 0 ? colors.green : colors.amber}
              >
                {toast.auraDelta !== undefined
                  ? `${toast.auraDelta >= 0 ? "+" : ""}${toast.auraDelta.toFixed(1)}%`
                  : toast.presenceDeltas.find((d) => d.key === "aura")?.direction === "up"
                    ? "↑"
                    : "↓"}
              </AppText>
            </View>
          )}
        </View>
      )}

      {/* Relationship chips grid */}
      {relChips.length > 0 && (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            rowGap: 8,
          }}
        >
          {relChips.map((d, i) => {
            const c = resolveCharacter(d.characterId);
            const positive = d.delta >= 0;
            const hasNumericDelta = Math.abs(d.delta) > 0 && Math.abs(d.delta) !== 1;
            return (
              <View
                key={`r${i}`}
                style={{
                  // Round 1.11.32 Alpha Fix #2 — keep a safe gutter on the
                  // right of each 50%-wide chip so the Δ% number never bumps
                  // into the NEXT chip's avatar in the 2-column grid.
                  width: "50%",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingRight: 10,
                }}
              >
                <Avatar
                  uri={c?.avatar ?? ""}
                  size={24}
                  ring={positive ? colors.green : colors.amber}
                  ringWidth={2}
                />
                <AppText
                  size={12}
                  weight="800"
                  numberOfLines={1}
                  // flexShrink: 1 lets long names ellipsis instead of
                  // pushing Δ% out of the chip; minWidth: 0 lets the
                  // shrink actually take effect (RN default minWidth is
                  // "auto" which leaks past parent).
                  style={{ flexShrink: 1, minWidth: 0 }}
                >
                  {c?.name?.split(" ")[0] ?? d.characterId}
                </AppText>
                <AppText
                  size={12}
                  weight="900"
                  // marginLeft: "auto" pulls the Δ% to whatever space
                  // remains, with the parent's paddingRight: 10 keeping
                  // it off the neighboring chip.
                  style={{ marginLeft: "auto" }}
                  color={positive ? colors.green : colors.amber}
                >
                  {hasNumericDelta
                    ? `${positive ? "+" : ""}${d.delta.toFixed(1)}%`
                    : positive
                      ? "↑"
                      : "↓"}
                </AppText>
              </View>
            );
          })}
        </View>
      )}

      {/* View all changes / Collapse toggle — Round 1.11.32 Alpha Fix #6.
          Hidden entirely when the toast carries NO numeric changes (e.g.
          the "Nothing new today" info toast). Expanding into an empty
          panel was confusing UX — now those toasts stay purely
          informational. The hasAnyStats check covers every field the
          ExpandedToastPanel would actually render. */}
      {(() => {
        const hasAnyStats =
          (toast.followerDelta ?? 0) > 0 ||
          (toast.xpDelta ?? 0) > 0 ||
          toast.humorDelta !== undefined ||
          toast.auraDelta !== undefined ||
          (toast.relationshipChanges?.length ?? 0) > 0 ||
          relChips.length > 0;
        if (!hasAnyStats) return null;
        return (
          <>
            <Pressable onPress={() => setExpanded((e) => !e)} hitSlop={6}>
              <AppText size={12} color={colors.green} weight="800">
                {expanded ? "← Collapse" : "View all changes →"}
              </AppText>
            </Pressable>
            {/* Round 1.11.32 G-Fix #2 — expanded panel always mounted
                inside an animated height+opacity wrapper. overflow:
                hidden clips during collapse so the parent card shrinks
                cleanly instead of layout-thrashing. maxHeight cap of
                560 fits the score-changes grid + 3 relationship cards
                comfortably on every device; larger lists scroll inside
                the existing inner ScrollView already. */}
            <Animated.View
              style={{
                overflow: "hidden",
                opacity: expandValue,
                maxHeight: expandValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 560],
                }),
              }}
            >
              <ExpandedToastPanel toast={toast} />
            </Animated.View>
          </>
        );
      })()}
    </>
  );

  // Anchor strategy — Round 1.11.32:
  // The toast now drops in from the top like a system push notification.
  // `top` is anchored to insets.top + 8 so Notch / Dynamic Island / status
  // bar can NEVER overlap the card (the +8 buffer is the minimum visual
  // breathing room around iOS Dynamic Island and Android punch-holes).
  // Animated translateY drives the slide; expanded mode extends downward
  // (bottom anchor) so long relationship lists can scroll inside the card
  // without pushing the close button below the screen.
  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: insets.top + 8,
        bottom: expanded ? insets.bottom + 110 : undefined,
        left: 14,
        right: 14,
        alignItems: "center",
        transform: [{ translateY: slide }],
      }}
    >
      <View
        style={{
          maxWidth: 360,
          width: "100%",
          // When expanded, flex:1 lets the card claim available height so the
          // ScrollView gets a bounded container to scroll within.
          flex: expanded ? 1 : 0,
          backgroundColor: colors.surface,
          borderColor: colors.purple,
          borderWidth: 1,
          borderRadius: radii.lg,
          padding: 14,
          gap: 10,
          shadowColor: "#000",
          shadowOpacity: 0.4,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        {stickyHeader}
        {expanded ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ gap: 10, paddingBottom: 6 }}
            showsVerticalScrollIndicator={false}
          >
            {bodyContent}
          </ScrollView>
        ) : (
          <View style={{ gap: 10 }}>{bodyContent}</View>
        )}
      </View>
    </Animated.View>
  );
}

// Round 1.11 B — Expanded panel that opens IN PLACE inside the toast when
// the player taps "View all changes →". Mirrors the original Status post-
// event detail view: a 3-box Score Changes grid (Followers / Humor / Aura),
// a pithy summary caption, then per-character relationship cards with avatar,
// verified badge, handle, Δ%, CenteredBar showing vibeAfter, and rationale.
function ExpandedToastPanel({ toast }: { toast: WorldUpdateToastT }) {
  const { resolveCharacter } = useGame();
  const hasScores =
    (toast.followerDelta && toast.followerDelta > 0) ||
    toast.humorDelta !== undefined ||
    toast.auraDelta !== undefined;
  const relChanges = toast.relationshipChanges ?? [];

  return (
    <View style={{ gap: 12, paddingTop: 4 }}>
      <Divider />

      {/* SCORE CHANGES — 3 boxes in a row. Followers is the "hero" box with
          a blue highlight border; Humor/Aura use neutral surface. Decimal
          values are always rendered with .toFixed(1) so we never get
          floating-point tails on the screen. */}
      {hasScores ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <AppText size={14}>📈</AppText>
            <AppText size={13} weight="900" color={colors.amber}>
              Score Changes
            </AppText>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {/* Followers box — highlighted with blue border when present */}
            <ScoreBox
              icon={<Users color={colors.blue} size={20} />}
              label="Followers"
              value={
                toast.followerDelta && toast.followerDelta > 0
                  ? `+${formatCount(toast.followerDelta)}`
                  : "—"
              }
              highlight={!!(toast.followerDelta && toast.followerDelta > 0)}
            />
            <ScoreBox
              icon={<AppText size={20}>🤣</AppText>}
              label="Humor"
              value={
                toast.humorDelta !== undefined
                  ? `${toast.humorDelta >= 0 ? "+" : ""}${toast.humorDelta.toFixed(1)}%`
                  : "—"
              }
              valueColor={
                toast.humorDelta !== undefined && toast.humorDelta >= 0
                  ? colors.green
                  : toast.humorDelta !== undefined
                    ? colors.amber
                    : colors.muted
              }
            />
            <ScoreBox
              icon={<AppText size={20}>❤️‍🔥</AppText>}
              label="Aura"
              value={
                toast.auraDelta !== undefined
                  ? `${toast.auraDelta >= 0 ? "+" : ""}${toast.auraDelta.toFixed(1)}%`
                  : "—"
              }
              valueColor={
                toast.auraDelta !== undefined && toast.auraDelta >= 0
                  ? colors.green
                  : toast.auraDelta !== undefined
                    ? colors.amber
                    : colors.muted
              }
            />
          </View>
        </>
      ) : null}

      {/* Summary slogan in a pill — same line that lives in the collapsed
          body, repeated here so the expanded view reads as a complete card. */}
      {toast.summary ? (
        <View
          style={{
            backgroundColor: colors.surfaceSoft,
            borderRadius: radii.md,
            paddingVertical: 10,
            paddingHorizontal: 12,
          }}
        >
          <AppText size={13} color={colors.muted2}>
            {toast.summary}
          </AppText>
        </View>
      ) : null}

      {/* RELATIONSHIPS section — header + per-character cards. Each card has
          avatar, name + verified badge, handle, signed Δ%, CenteredBar
          positioned at vibeAfter, and rationale text. */}
      {relChanges.length > 0 ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <AppText size={14}>💖</AppText>
            <AppText size={13} weight="900" color={colors.pink}>
              Relationships
            </AppText>
          </View>
          <View style={{ gap: 8 }}>
            {relChanges.map((rc) => {
              const c = resolveCharacter(rc.characterId);
              if (!c) return null;
              const positive = rc.delta >= 0;
              return (
                <View
                  key={rc.characterId}
                  style={{
                    backgroundColor: colors.surfaceSoft,
                    borderRadius: radii.md,
                    padding: 10,
                    gap: 8,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Avatar uri={c.avatar} size={32} />
                    <View style={{ flex: 1 }}>
                      <View
                        style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                      >
                        <AppText size={14} weight="900">
                          {c.name}
                        </AppText>
                        {c.verified ? <VerifiedBadge size={12} /> : null}
                      </View>
                      <AppText size={12} color={colors.muted}>
                        {c.handle}
                      </AppText>
                    </View>
                    <AppText
                      size={14}
                      weight="900"
                      color={positive ? colors.green : colors.amber}
                    >
                      {positive ? "+" : ""}
                      {rc.delta.toFixed(1)}%
                    </AppText>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <CenteredBar value={rc.vibeAfter} height={10} />
                    <AppText size={11} color={colors.muted2} weight="800">
                      {rc.vibeAfter.toFixed(1)}%
                    </AppText>
                  </View>
                  {rc.rationale ? (
                    <AppText size={12} color={colors.muted2}>
                      {rc.rationale}
                    </AppText>
                  ) : null}
                </View>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}

// Small 3-up panel box used in the expanded Score Changes section. Highlight
// mode renders a blue border (Followers is the "hero" stat in the original
// Status game — gets visual priority).
function ScoreBox({
  icon,
  label,
  value,
  highlight = false,
  valueColor = colors.green,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  valueColor?: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surfaceSoft,
        borderColor: highlight ? colors.blue : "transparent",
        borderWidth: highlight ? 1.5 : 0,
        borderRadius: radii.md,
        paddingVertical: 12,
        paddingHorizontal: 8,
        alignItems: "center",
        gap: 4,
      }}
    >
      {icon}
      <AppText size={11} color={colors.muted2}>
        {label}
      </AppText>
      <AppText size={14} weight="900" color={valueColor}>
        {value}
      </AppText>
    </View>
  );
}

// ===================================================================
//  CREATE ACTIVITY MODAL
// ===================================================================

function CreateActivityModal() {
  const { state, setCreateActivityOpen, createActivity, cast } = useGame();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [day, setDay] = useState(state.day + 1);
  // Fala 2 — continuous time picker (24h). Default 19 = 7pm prime time.
  const [hour, setHour] = useState<number>(19);
  const [invitees, setInvitees] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!state.createActivityOpen) {
      setTitle("");
      setDescription("");
      setInvitees([]);
      setDay(state.day + 1);
      setHour(19);
    }
  }, [state.createActivityOpen, state.day]);

  function toggle(id: string) {
    setInvitees((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function submit() {
    if (!title.trim() || invitees.length === 0) return;
    setSubmitting(true);
    try {
      await createActivity({
        title: title.trim(),
        description: description.trim(),
        inviteeIds: invitees,
        scheduledDay: day,
        scheduledHour: hour,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      visible={state.createActivityOpen}
      animationType="slide"
      onRequestClose={() => setCreateActivityOpen(false)}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14 }}>
          <IconButton size={36} onPress={() => setCreateActivityOpen(false)}>
            <X color={colors.text} size={18} />
          </IconButton>
          <AppText size={18} weight="900" style={{ marginLeft: 8 }}>
            Create activity
          </AppText>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={submit}
            disabled={!title.trim() || invitees.length === 0 || submitting}
            style={{
              backgroundColor:
                title.trim() && invitees.length > 0 && !submitting
                  ? colors.blue
                  : colors.surfaceSoft,
              paddingHorizontal: 18,
              paddingVertical: 8,
              borderRadius: radii.pill,
            }}
          >
            <AppText
              size={14}
              weight="800"
              color={
                title.trim() && invitees.length > 0 && !submitting
                  ? colors.text
                  : colors.muted
              }
            >
              {submitting ? "..." : "Send"}
            </AppText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 60 }}>
          <View style={{ gap: 6 }}>
            <AppText size={13} color={colors.muted2}>
              Activity name
            </AppText>
            <Field value={title} onChangeText={setTitle} placeholder="Studio session, dinner, gala..." />
          </View>
          <View style={{ gap: 6 }}>
            <AppText size={13} color={colors.muted2}>
              When
            </AppText>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pressable
                onPress={() => setDay(Math.max(state.day, day - 1))}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: colors.surfaceAlt,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AppText size={16}>−</AppText>
              </Pressable>
              <View
                style={{
                  flex: 1,
                  height: 36,
                  borderRadius: radii.pill,
                  backgroundColor: colors.surface,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AppText size={14} weight="800">
                  Day {day}
                  {day === state.day ? " (today)" : day === state.day + 1 ? " (tomorrow)" : ""}
                </AppText>
              </View>
              <Pressable
                onPress={() => setDay(day + 1)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: colors.surfaceAlt,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AppText size={16}>+</AppText>
              </Pressable>
            </View>
          </View>
          {/* Fala 2 — continuous hour picker (0-23). Two pressables
              drift hour by ±1, label shows "HH:00 (period)" so the
              player sees both the precise number and the vibe. */}
          <View style={{ gap: 6 }}>
            <AppText size={13} color={colors.muted2}>
              Time of day
            </AppText>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pressable
                onPress={() => setHour((h) => (h <= 0 ? 23 : h - 1))}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: colors.surfaceAlt,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AppText size={16}>−</AppText>
              </Pressable>
              <View
                style={{
                  flex: 1,
                  height: 36,
                  borderRadius: radii.pill,
                  backgroundColor: colors.surface,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AppText size={14} weight="800">
                  {String(hour).padStart(2, "0")}:00
                  {hour < 6
                    ? " (late night)"
                    : hour < 11
                      ? " (morning)"
                      : hour < 14
                        ? " (midday)"
                        : hour < 18
                          ? " (afternoon)"
                          : hour < 22
                            ? " (evening)"
                            : " (late night)"}
                </AppText>
              </View>
              <Pressable
                onPress={() => setHour((h) => (h >= 23 ? 0 : h + 1))}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: colors.surfaceAlt,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AppText size={16}>+</AppText>
              </Pressable>
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <AppText size={13} color={colors.muted2}>
              Who's invited ({invitees.length})
            </AppText>
            {cast.length === 0 ? (
              <Card>
                <AppText size={13} color={colors.muted2}>
                  Add some characters first (Messages tab → +).
                </AppText>
              </Card>
            ) : (
              cast.map((c) => {
                const selected = invitees.includes(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => toggle(c.id)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      padding: 10,
                      borderRadius: radii.md,
                      backgroundColor: selected ? "rgba(61,139,250,0.15)" : colors.surface,
                      borderWidth: 1,
                      borderColor: selected ? colors.blue : colors.borderSoft,
                    }}
                  >
                    <Avatar uri={c.avatar} size={36} />
                    <View style={{ flex: 1 }}>
                      <AppText size={14} weight="800">
                        {c.name}
                      </AppText>
                      <AppText size={12} color={colors.muted}>
                        {c.handle}
                      </AppText>
                    </View>
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        borderWidth: 2,
                        borderColor: selected ? colors.blue : colors.border,
                        backgroundColor: selected ? colors.blue : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {selected ? <AppText size={12}>✓</AppText> : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
          <View style={{ gap: 6 }}>
            <AppText size={13} color={colors.muted2}>
              Description
            </AppText>
            <Field
              value={description}
              onChangeText={setDescription}
              placeholder="What's the vibe, where, what's at stake..."
              multiline
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ===================================================================
//  EDIT CHARACTER MODAL — lets you swap in a real influencer photo
// ===================================================================

function EditCharacterModal() {
  const { state, setEditingCharacterId, resolveCharacter, updateCharacterOverride } = useGame();
  const id = state.editingCharacterId;
  const character = id ? resolveCharacter(id) : undefined;
  const insets = useSafeAreaInsets();

  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [description, setDescription] = useState("");
  // Round 1.11.32 Faza C — explicit AvatarSource type so setState accepts
  // either a string URI (image-picker output) or a require()'d asset
  // handle (number) from the static catalog.
  const [avatar, setAvatar] = useState<AvatarSource>("");
  const [banner, setBanner] = useState<AvatarSource>("");

  useEffect(() => {
    if (!character) return;
    setName(character.name);
    setHandle(character.handle);
    setBio(character.bio ?? "");
    setDescription(character.description ?? "");
    setAvatar(character.avatar);
    setBanner(character.banner ?? "");
  }, [id, character?.id]);

  if (!id || !character) return null;

  function save() {
    if (!id) return;
    updateCharacterOverride(id, {
      name: name.trim() || character!.name,
      handle: handle.trim().startsWith("@") ? handle.trim() : `@${handle.trim()}`,
      bio,
      description,
      avatar,
      banner,
    });
    setEditingCharacterId(null);
  }

  return (
    <Modal
      visible={!!id}
      animationType="slide"
      onRequestClose={() => setEditingCharacterId(null)}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
          <View style={{ paddingHorizontal: 14, paddingTop: insets.top + 6, flexDirection: "row", alignItems: "center" }}>
            <IconButton onPress={() => setEditingCharacterId(null)}>
              <ArrowLeft color={colors.text} size={20} />
            </IconButton>
            <AppText size={18} weight="900" style={{ marginLeft: 8 }}>
              Edit character
            </AppText>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={save}
              style={{
                backgroundColor: colors.blue,
                paddingHorizontal: 18,
                paddingVertical: 8,
                borderRadius: radii.pill,
              }}
            >
              <AppText size={14} weight="800">
                Save
              </AppText>
            </Pressable>
          </View>

          <View style={{ height: 160, marginTop: 12 }}>
            {banner ? (
              <Image source={imageSource(banner)} contentFit="cover" style={{ width: "100%", height: "100%" }} />
            ) : (
              <View style={{ flex: 1, backgroundColor: colors.surfaceAlt }} />
            )}
            <Pressable
              onPress={async () => {
                const uri = await pickImageAsync([16, 9]);
                if (uri) setBanner(uri);
              }}
              style={{ position: "absolute", right: 14, top: 12 }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: "rgba(0,0,0,0.6)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Pencil color={colors.text} size={16} />
              </View>
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: 18, marginTop: -40, gap: 14 }}>
            <View style={{ position: "relative", alignSelf: "flex-start" }}>
              <Avatar uri={avatar} size={80} ring={colors.bg} ringWidth={3} />
              <Pressable
                onPress={async () => {
                  const uri = await pickImageAsync([1, 1]);
                  if (uri) setAvatar(uri);
                }}
                style={{
                  position: "absolute",
                  right: -4,
                  bottom: -4,
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: colors.blue,
                  borderWidth: 2,
                  borderColor: colors.bg,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Pencil color={colors.text} size={14} />
              </Pressable>
            </View>

            <View style={{ gap: 6 }}>
              <AppText size={13} color={colors.muted2}>
                Character name
              </AppText>
              <Field value={name} onChangeText={setName} placeholder={character.name} />
            </View>
            <View style={{ gap: 6 }}>
              <AppText size={13} color={colors.muted2}>
                Handle
              </AppText>
              <Field value={handle} onChangeText={setHandle} placeholder={character.handle} />
            </View>
            <View style={{ gap: 6 }}>
              <AppText size={13} color={colors.muted2}>
                Bio
              </AppText>
              <Field value={bio} onChangeText={setBio} placeholder="Short bio" multiline />
            </View>
            <View style={{ gap: 6 }}>
              <AppText size={13} color={colors.muted2}>
                Description
              </AppText>
              <Field
                value={description}
                onChangeText={setDescription}
                placeholder="Longer description"
                multiline
              />
            </View>

            <AppText size={11} color={colors.muted}>
              Photos picked from your library stay on your device. Want to revert to the default photo? Pick the image again from the gallery — or paste a fresh one.
            </AppText>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ===================================================================
//  PR ACTIONS MODAL — Round 1.11.32 Faza D
// ===================================================================
// Fala 3 — WinScreenModal. Triggers when mainGoalCompletedDay flips
// from null to a day number (via maybeFireWinScreen in game-context).
// Scenario-aware: in accidentally-famous, the body is a Grammy reveal;
// other scenarios get a generic "main goal cleared" copy.
function WinScreenModal() {
  const { state, dismissWinScreen, resolveCharacter } = useGame();
  const insets = useSafeAreaInsets();
  const reveal = state.lastWinReveal;
  const open = state.mainGoalCompletedDay !== null && !!reveal;
  if (!open || !reveal) return null;
  const winner =
    reveal.winnerCharacterId === "player"
      ? {
          name: state.player.name,
          handle: state.player.handle,
          avatar: state.player.avatar,
        }
      : resolveCharacter(reveal.winnerCharacterId);
  return (
    <Modal visible animationType="fade" transparent>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.85)",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 24,
            paddingHorizontal: 24,
            paddingVertical: 28,
            alignItems: "center",
            gap: 14,
            maxWidth: 380,
          }}
        >
          <AppText size={32}>🏆</AppText>
          <AppText size={18} weight="900" style={{ textAlign: "center" }}>
            {reveal.headline}
          </AppText>
          {winner ? (
            <View style={{ alignItems: "center", gap: 6 }}>
              <Avatar uri={winner.avatar} size={68} ring={colors.amber} ringWidth={3} />
              <AppText size={15} weight="900">
                {winner.name}
              </AppText>
              <AppText size={12} color={colors.muted2}>
                {winner.handle}
              </AppText>
            </View>
          ) : null}
          <AppText size={14} color={colors.muted} style={{ textAlign: "center" }}>
            {reveal.body}
          </AppText>
          <AppText size={12} color={colors.muted2} style={{ textAlign: "center" }}>
            Goals cleared: {state.goalsCompleted + 1}
          </AppText>
          <Pressable
            onPress={dismissWinScreen}
            style={{
              marginTop: 6,
              backgroundColor: colors.blue,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: radii.pill,
            }}
          >
            <AppText size={14} weight="900">
              Onto the next chapter →
            </AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// Three sections: PR Stunts (3 AI/offline options), Laying Low toggle,
// Divert Attention (pick a cast member to throw under the bus). Opens
// whenever `prActionsOpen === true` (CrisisBar tap).
function PRActionsModal() {
  const {
    state,
    prActionsOpen,
    setPRActionsOpen,
    fetchPRStuntOptions,
    triggerPRStunt,
    toggleLayingLow,
    triggerDivertAttention,
    cast,
    resolveCharacter,
  } = useGame();
  const insets = useSafeAreaInsets();
  const [stunts, setStunts] = useState<PRStuntOption[]>([]);
  const [loadingStunts, setLoadingStunts] = useState(false);
  // Audit-fix I2 — cache the fetched stunt set so open→close→reopen
  // without acting doesn't burn a second AI call. We key the cache on
  // crisisLevel: if the player reopens at the SAME crisis level we reuse
  // the prior options; any crisis movement (PR stunt, decay, escalation)
  // invalidates the cache and refetches fresh, origin-appropriate moves.
  const stuntCacheRef = useRef<{ level: number; opts: PRStuntOption[] } | null>(null);

  useEffect(() => {
    if (!prActionsOpen) return;
    let cancelled = false;
    // Cache hit — same crisis level as the last fetch. Reuse instantly,
    // skip the network/offline round-trip entirely.
    const cached = stuntCacheRef.current;
    if (cached && cached.level === state.crisisLevel && cached.opts.length > 0) {
      setStunts(cached.opts);
      setLoadingStunts(false);
      return;
    }
    setLoadingStunts(true);
    setStunts([]);
    fetchPRStuntOptions()
      .then((opts) => {
        if (!cancelled) {
          setStunts(opts);
          stuntCacheRef.current = { level: state.crisisLevel, opts };
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingStunts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [prActionsOpen, fetchPRStuntOptions, state.crisisLevel]);

  // Divert cooldown — same target may not be diverted on twice in <3 days.
  const divertCooldownTarget = (id: string): boolean => {
    return state.prHistory.some(
      (p) =>
        p.action === "divert" &&
        p.targetId === id &&
        p.day > state.day - 3,
    );
  };

  return (
    <Modal
      visible={prActionsOpen}
      animationType="slide"
      onRequestClose={() => setPRActionsOpen(false)}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14 }}>
          <IconButton onPress={() => setPRActionsOpen(false)}>
            <X color={colors.text} size={20} />
          </IconButton>
          <AppText size={18} weight="900" style={{ marginLeft: 8, flex: 1 }}>
            PR Actions
          </AppText>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: "#5a1212",
            }}
          >
            <AppText size={12} weight="900" color="#ffd7d7">
              Crisis {Math.round(state.crisisLevel)}/100
            </AppText>
          </View>
        </View>
        <ScrollView
          contentContainerStyle={{ padding: 18, paddingBottom: 60, gap: 22 }}
        >
          {/* Origin context */}
          <Card style={{ backgroundColor: "#2a1414", borderColor: "#7a1a1a" }}>
            <AppText size={13} color="#f3a8a8" weight="800">
              {state.crisisOrigin?.kind === "relationship-drop"
                ? `Public beef with @${state.crisisOrigin.characterId}`
                : state.crisisOrigin?.kind === "event-misstep"
                  ? `Event misstep: ${state.crisisOrigin.eventTitle}`
                  : "The internet just turned"}
            </AppText>
            {state.crisisStartedDay !== null ? (
              <AppText size={11} color="#c98787">
                Day {state.crisisStartedDay} → present (Day {state.day})
              </AppText>
            ) : null}
          </Card>

          {/* SECTION 1 — PR Stunts */}
          <View style={{ gap: 10 }}>
            <SectionTitle title="PR Stunts & Statements" />
            <AppText size={12} color={colors.muted2}>
              Burn stat points for an instant crisis drop. Higher effect costs more.
            </AppText>
            {loadingStunts ? (
              <View style={{ paddingVertical: 24, alignItems: "center" }}>
                <AppText size={13} color={colors.muted2}>
                  Loading options…
                </AppText>
              </View>
            ) : (
              stunts.map((opt) => {
                const cannotAfford =
                  state.player.socialPresence.humor < opt.humorCost ||
                  state.player.socialPresence.aura < opt.auraCost;
                return (
                  <Pressable
                    key={opt.id}
                    disabled={cannotAfford}
                    onPress={() => triggerPRStunt(opt)}
                    style={({ pressed }) => ({
                      backgroundColor: cannotAfford ? colors.surfaceSoft : colors.surface,
                      borderColor: cannotAfford ? colors.divider : colors.blue,
                      borderWidth: 1,
                      borderRadius: 14,
                      padding: 14,
                      gap: 6,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <AppText size={14} weight="900">
                      {opt.title}
                    </AppText>
                    <AppText size={12} color={colors.muted2}>
                      {opt.description}
                    </AppText>
                    <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                      <AppText size={12} weight="800" color={colors.green}>
                        -{opt.effect} crisis
                      </AppText>
                      {opt.humorCost > 0 ? (
                        <AppText size={12} color={colors.amber}>
                          -{opt.humorCost.toFixed(1)} humor
                        </AppText>
                      ) : null}
                      {opt.auraCost > 0 ? (
                        <AppText size={12} color={colors.amber}>
                          -{opt.auraCost.toFixed(1)} aura
                        </AppText>
                      ) : null}
                      {cannotAfford ? (
                        <AppText size={11} color={colors.muted}>
                          (insufficient stats)
                        </AppText>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>

          {/* SECTION 2 — Lay Low */}
          <View style={{ gap: 10 }}>
            <SectionTitle title="Lay Low" />
            <Pressable
              onPress={toggleLayingLow}
              style={({ pressed }) => ({
                backgroundColor: state.crisisLayingLow ? "#2a3a2a" : colors.surface,
                borderColor: state.crisisLayingLow ? colors.green : colors.border,
                borderWidth: 1,
                borderRadius: 14,
                padding: 14,
                gap: 6,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <AppText size={14} weight="900">
                {state.crisisLayingLow ? "Stop laying low" : "Lay low for now"}
              </AppText>
              <AppText size={12} color={colors.muted2}>
                {state.crisisLayingLow
                  ? "Resume normal posting. Crisis decays slowly again."
                  : "Crisis decays faster (-8/day) but follower gain is reduced by 70%."}
              </AppText>
            </Pressable>
          </View>

          {/* SECTION 3 — Divert Attention */}
          <View style={{ gap: 10 }}>
            <SectionTitle title="Divert Attention" />
            <AppText size={12} color={colors.muted2}>
              Costs 2 energy. Sacrifices another celeb's vibe to flip the cycle off you.
              Same target can't be picked twice in 3 days.
            </AppText>
            {cast.length === 0 ? (
              <Card>
                <AppText size={13} color={colors.muted2}>
                  No cast members yet — add a celebrity first.
                </AppText>
              </Card>
            ) : (
              cast.map((c) => {
                const onCooldown = divertCooldownTarget(c.id);
                const ch = resolveCharacter(c.id);
                if (!ch) return null;
                return (
                  <Pressable
                    key={c.id}
                    disabled={onCooldown}
                    onPress={() => triggerDivertAttention(c.id)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      padding: 12,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: onCooldown ? colors.divider : colors.border,
                      backgroundColor: onCooldown ? colors.surfaceSoft : colors.surface,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Avatar uri={ch.avatar} size={42} />
                    <View style={{ flex: 1 }}>
                      <AppText size={14} weight="900">
                        {ch.name}
                      </AppText>
                      <AppText size={12} color={colors.muted2}>
                        {ch.handle}
                      </AppText>
                    </View>
                    <AppText
                      size={12}
                      weight="800"
                      color={onCooldown ? colors.muted : colors.amber}
                    >
                      {onCooldown ? "Cooldown" : "Throw under bus"}
                    </AppText>
                  </Pressable>
                );
              })
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ===================================================================
//  ONBOARDING OVERLAY — F1
// ===================================================================
// First-run 4-card tutorial. Renders as a full-screen modal the first
// time the player lands in the Game phase (onboardingSeen === false).
// Explains the core loops: the feed economy, relationships/chemistry,
// events, and crisis. Skip jumps straight to dismiss; Next walks the
// cards; the last card's button dismisses. Shows once per save.
const ONBOARDING_CARDS: Array<{
  emoji: string;
  title: string;
  body: string;
}> = [
  {
    emoji: "📱",
    title: "This is your timeline",
    body: "Post to the feed, reply to celebrities, and watch the world react in real time. Every post spends 1 energy — you refill it by triggering Events.",
  },
  {
    emoji: "💞",
    title: "Vibe & Chemistry",
    body: "Add celebrities to your cast from Messages. Each has a Vibe (−100…+100) and a Chemistry style (rivals, lovers, co-conspirators…). Your posts and replies nudge their Vibe up or down.",
  },
  {
    emoji: "📣",
    title: "Events move the day",
    body: "Tap the Event button to trigger a story beat. Choosing an outcome rolls the day forward, refills energy, and earns XP toward Milestones. Humor & Aura are your social-presence stats — grow them to gain followers faster.",
  },
  {
    emoji: "🔥",
    title: "Mind the Crisis meter",
    body: "Beef with a celebrity (Vibe below −50) or a bad event choice can spark a Crisis. When it flares, open the PR menu: issue a statement, lay low, or divert the heat onto someone else. Let it hit 100 and the internet turns on you.",
  },
];

function OnboardingOverlay() {
  const { state, dismissOnboarding } = useGame();
  const insets = useSafeAreaInsets();
  const [card, setCard] = useState(0);
  // Only show in-game, once per save.
  const visible = state.phase === "game" && !state.onboardingSeen;
  if (!visible) return null;
  const isLast = card >= ONBOARDING_CARDS.length - 1;
  const c = ONBOARDING_CARDS[card];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismissOnboarding}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.82)",
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 20,
          paddingHorizontal: 22,
          justifyContent: "center",
        }}
      >
        {/* Skip — top right */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip tutorial"
          onPress={dismissOnboarding}
          hitSlop={12}
          style={{ position: "absolute", top: insets.top + 16, right: 20 }}
        >
          <AppText size={14} color={colors.muted2} weight="700">
            Skip
          </AppText>
        </Pressable>

        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radii.lg,
            borderColor: colors.purple,
            borderWidth: 1,
            padding: 24,
            gap: 14,
            alignItems: "center",
          }}
        >
          <AppText size={52}>{c.emoji}</AppText>
          <AppText size={22} weight="900" style={{ textAlign: "center" }}>
            {c.title}
          </AppText>
          <AppText
            size={15}
            color={colors.muted2}
            style={{ textAlign: "center", lineHeight: 22 }}
          >
            {c.body}
          </AppText>

          {/* Progress dots */}
          <View style={{ flexDirection: "row", gap: 7, marginTop: 4 }}>
            {ONBOARDING_CARDS.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === card ? 22 : 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: i === card ? colors.blue : colors.surfaceSoft,
                }}
              />
            ))}
          </View>

          <CapsuleButton
            onPress={() => {
              if (isLast) dismissOnboarding();
              else setCard((n) => n + 1);
            }}
            style={{ alignSelf: "stretch", marginTop: 6 }}
          >
            {isLast ? "Start playing" : "Next"}
          </CapsuleButton>
        </View>
      </View>
    </Modal>
  );
}

// ===================================================================
//  ROOT
// ===================================================================

export default function StatusNativeApp() {
  const { state, ready } = useGame();
  const { width } = useWindowDimensions();
  const appMaxWidth = useMemo(() => Math.min(width, 520), [width]);

  if (!ready) {
    return <LoadingScreen />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgDeep, alignItems: "center" }}>
      <View style={{ flex: 1, width: "100%", maxWidth: appMaxWidth, backgroundColor: colors.bg }}>
        {/* Round 1.11.32 G-Fix #9 — subtle fade on phase transitions.
            PhaseFade re-keys whenever state.phase flips, so the new
            screen mounts with opacity 0 and fades to 1 over 220ms. The
            outgoing screen unmounts the moment React swaps roots, so
            there's no cross-fade — but the receiving screen's gentle
            reveal kills the "BAM, new screen!" pop. */}
        <PhaseFade key={state.phase}>
          {state.phase === "landing" ? <LandingScreen /> : null}
          {state.phase === "hub" ? <HubScreen /> : null}
          {state.phase === "details" ? <ScenarioDetailsScreen /> : null}
          {state.phase === "setup" ? <CharacterSetupScreen /> : null}
          {state.phase === "scenarioBuilder" ? <ScenarioBuilderScreen /> : null}
          {state.phase === "game" ? <GameShell /> : null}
        </PhaseFade>
      </View>
    </View>
  );
}

// Round 1.11.32 G-Fix #9 — fade-in wrapper. Mounted at the START of a
// new phase render with opacity 0, then animated to 1 over 220ms. Keyed
// by the parent so changing phase forces a remount + replay of the
// animation. Native driver = JS thread stays clean during the fade.
function PhaseFade({ children }: { children: React.ReactNode }) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [fade]);
  return (
    <Animated.View style={{ flex: 1, opacity: fade }}>{children}</Animated.View>
  );
}
