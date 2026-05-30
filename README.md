# Status — celebrity simulator (Expo + React Native)

A turn-based social-media celebrity simulator built on Expo SDK 54.
Pick a name + handle, land in one of three scenarios
(*Accidentally Famous*, *Bridgerton*, *Magic School Meltdown*), grow
your followers, manage relationships with a curated cast of celebrities,
and survive the occasional cancel-culture crisis. The feed is generated
on-the-fly by an LLM (Gemini / OpenAI / Anthropic — picked in Settings),
with a deep offline fallback bank so the game never goes mute when the
network does.

## Run

```sh
npm install
npm start -- --clear
```

Open with Expo Go on a device, or build natively:

```sh
npm run ios
npm run android
```

Typecheck:

```sh
npx tsc --noEmit   # must EXIT=0
```

## Core mechanics (v1.0)

### Energy
- 10 base energy + 10 bonus overflow slots.
- Every player action (post / reply / DM / event / divert) costs 1
  (Divert costs 2).
- +5 energy on each day rollover, overflow spilling into the bonus
  bucket up to a hard 10 cap.
- When both buckets hit 0 the action surfaces an "out of energy" toast
  and bails — the player has to finish an event to advance the day and
  refill.

### XP and levels
- Variable XP per action. Replies = 4 XP. Side quests = 30-50 XP.
  Events scale with player level: floor 15+6·lvl, ceiling 25+10·lvl.
- Level-up curve is exponential: `xpRequired = floor(100 * 1.2^level)`.
- Each level grants 2 skill points (bravery / mystery / wit) the player
  applies through the Goals tab.

### Crisis (Stan Wars)
- `crisisLevel` 0-100. Spikes when any contact's vibe crosses below
  -50, or on event missteps.
- Three escape paths in the PR Actions menu:
  - **PR Stunts** — three contextual options pulled from the AI; each
    costs Humor / Aura, drops 15-50 crisis points.
  - **Lay Low** — toggles a passive mode where crisis decays -8/day
    (vs -3/day normal) but follower gain drops to 30%.
  - **Divert Attention** — sacrifices another celeb's vibe by 20-30 to
    knock crisis down 30-50 and inject a priority Pop Craze leak post.
- At `crisisLevel ≥ 100` an absolute blackout multiplier (0.1×) caps
  follower gain until a successful PR action breaks 100.
- At `crisisLevel > 40` fans tagged `tone === "defense"` get a ×2.5
  likes multiplier — emergent viral defense visibly outpaces the
  hate column in the comment section.

### Pre-fetching
- A background `useEffect` dispatcher fills three buckets while the
  player is idle: the next 3 feed posts, the upcoming event, and a
  set of compose suggestions tailored to that upcoming event.
- `triggerEvent` and `fetchSuggestions` consume the prefetch with 0ms
  latency when available; live AI is the fallback.
- 3-attempt exponential backoff (1s → 3s → 5s) on Gemini 503; persistent
  503 falls through to a 130+ entry offline content bank
  (`src/data/fallback.ts`) with pre-baked thread chains.

### Author rotation
- Each day builds a `dailyAuthorPool` of 6 celebs/outlets + 5 fan slots.
- A 10-entry `recentCommenters` queue prevents the same fan from
  comment-spamming consecutive posts.

## Provider configuration

The player picks `gemini` / `openai` / `anthropic` in the Settings modal
and pastes their API key. The key lives in `expo-secure-store` only;
the raw value is never persisted to the game state file. SecureStore
writes are debounced 600ms to avoid one syscall per keystroke.

`runLLM` uses a `Provider → callFn` registry, so adding a fourth model
(Mistral, Cohere, local Ollama) is a single-line addition plus the new
`callXxx` implementation — no if-else surgery in the entry point.

## Project layout

```
app/                — Expo Router entrypoints
src/
  components/       — All screens + modals (status-native-app.tsx is the shell)
  context/          — game-context.tsx (state + reducers + side effects)
  data/             — Static catalogs (worlds.ts, types.ts, fallback.ts)
  services/         — ai.ts (LLM provider registry + prompt generators)
  theme/            — tokens (colors, radii, typography)
  utils/            — formatters.ts (parseRepostCount + formatRepostCount)
assets/images/characters/  — Local celeb/outlet/fan avatars
```

## Save format

Game state lives on disk at `documentDirectory + status_game_state.json`.
Writes are atomic (`.tmp` + `moveAsync`); a corrupt save is renamed to
`*.corrupted.<timestamp>` instead of being silently discarded so it can
be inspected for diagnostics.

## Prompt-injection hardening

Player-controlled fields (`name`, `handle`, `bio`, chat messages,
context-reply text) are sanitized through `sanitizeInput()` and wrapped
in `[USER_DATA:label]…[/USER_DATA:label]` fences inside the system
prompt. The model is told that anything between those markers is opaque
data, never instructions.
