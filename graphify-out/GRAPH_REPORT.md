# Graph Report - C:\Users\kubap\Desktop\projects\status  (2026-05-23)

## Corpus Check
- 16 files · ~461,920 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 297 nodes · 452 edges · 20 communities (14 shown, 6 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.82)
- Token cost: 130,000 input · 5,711 output

## Community Hubs (Navigation)
- [[_COMMUNITY_UI Component Library|UI Component Library]]
- [[_COMMUNITY_AI Service & Providers|AI Service & Providers]]
- [[_COMMUNITY_Expo Dependencies|Expo Dependencies]]
- [[_COMMUNITY_AI Generation Functions|AI Generation Functions]]
- [[_COMMUNITY_Game Data & Economy Helpers|Game Data & Economy Helpers]]
- [[_COMMUNITY_Domain Types|Domain Types]]
- [[_COMMUNITY_Expo App Config|Expo App Config]]
- [[_COMMUNITY_World Content (Characters, Posts)|World Content (Characters, Posts)]]
- [[_COMMUNITY_Primitive UI Hook Wiring|Primitive UI Hook Wiring]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_State Mutation Helpers|State Mutation Helpers]]
- [[_COMMUNITY_Project Identity|Project Identity]]
- [[_COMMUNITY_VSCode Launch Config|VSCode Launch Config]]
- [[_COMMUNITY_Claude Permissions|Claude Permissions]]
- [[_COMMUNITY_App Root Layout|App Root Layout]]
- [[_COMMUNITY_Babel Preset|Babel Preset]]
- [[_COMMUNITY_Character Type Stub|Character Type Stub]]
- [[_COMMUNITY_World Type Stub|World Type Stub]]

## God Nodes (most connected - your core abstractions)
1. `useGame()` - 34 edges
2. `GameProvider` - 19 edges
3. `expo` - 12 edges
4. `runLLM()` - 12 edges
5. `runLLM dispatcher` - 12 edges
6. `safeParseJSON()` - 9 edges
7. `formatCount()` - 7 edges
8. `StatusNativeApp` - 7 edges
9. `requestCelebrityReply()` - 6 edges
10. `scripts` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Status Native README` --references--> `GameProvider`  [INFERRED]
  README.md → src/context/game-context.tsx
- `Status Native README` --references--> `runLLM dispatcher`  [INFERRED]
  README.md → src/services/ai.ts
- `Expo App Config` --references--> `status-native package`  [INFERRED]
  app.json → package.json
- `TS path alias @/*` --references--> `status-native package`  [INFERRED]
  tsconfig.json → package.json
- `IndexRoute` --references--> `StatusNativeApp`  [EXTRACTED]
  app/index.tsx → src/components/status-native-app.tsx

## Hyperedges (group relationships)
- **Multi-provider LLM dispatch** — ai_runllm, ai_callopenai, ai_callanthropic, ai_callgemini [EXTRACTED 1.00]
- **Feed post reply flow with relationship shifts** — gamecontext_gameprovider, ai_generatepostreplies, gamecontext_applypostreplies, types_feedpost, worlds_anonymousfans [EXTRACTED 1.00]
- **Event triggers XP, day rollover, energy bump** — gamecontext_withxp, gamecontext_consumeenergy, gamecontext_bumpdayenergy, ai_resolveeventchoice [EXTRACTED 1.00]

## Communities (20 total, 6 thin omitted)

### Community 0 - "UI Component Library"
Cohesion: 0.05
Nodes (55): AppText(), Avatar(), CapsuleButton(), Card(), CenteredBar(), Chip(), DeltaPill(), Divider() (+47 more)

### Community 1 - "AI Service & Providers"
Cohesion: 0.08
Nodes (39): Provider, ActivityOutcomeResult, buildOfflineThreadReplies(), callAnthropic(), callGemini(), callOpenAI(), ChatReplyResult, chemistryBlock() (+31 more)

### Community 2 - "Expo Dependencies"
Cohesion: 0.06
Nodes (34): dependencies, expo, expo-constants, expo-file-system, expo-font, expo-haptics, expo-image, expo-image-picker (+26 more)

### Community 3 - "AI Generation Functions"
Cohesion: 0.09
Nodes (30): callAnthropic, callGemini, callOpenAI, generateActivityOutcome, generateComposeSuggestions, generateEvent, generatePostReplies, generateScenario (+22 more)

### Community 4 - "Game Data & Economy Helpers"
Cohesion: 0.09
Nodes (15): avatarChoices, bannerChoices, builtinMilestoneSeeds, chemistryLabels, createInitialState(), defaultPlayer, emptyContacts(), eventXpRange() (+7 more)

### Community 5 - "Domain Types"
Cohesion: 0.10
Nodes (20): ActivityInvite, ActivityKind, ActivityLogEntry, ChatMessage, ChemistryType, ContactState, GamePhase, GameState (+12 more)

### Community 6 - "Expo App Config"
Cohesion: 0.10
Nodes (20): backgroundColor, adaptiveIcon, package, typedRoutes, expo, android, experiments, ios (+12 more)

### Community 7 - "World Content (Characters, Posts)"
Cohesion: 0.15
Nodes (12): Character, FeedPost, Outlet, World, allCharacters, anonymousFanIds, anonymousFans, characters (+4 more)

### Community 8 - "Primitive UI Hook Wiring"
Cohesion: 0.20
Nodes (10): useGame hook, IndexRoute, AppText primitive, CapsuleButton primitive, Card primitive, Screen primitive, StatusNativeApp, FeedPost type (+2 more)

### Community 9 - "TypeScript Config"
Cohesion: 0.25
Nodes (7): compilerOptions, baseUrl, paths, strict, extends, include, @/*

### Community 10 - "State Mutation Helpers"
Cohesion: 0.33
Nodes (6): applyPostReplies(), applyWorldUpdate(), createContact(), logEntry(), moodFor(), nowLabel()

### Community 11 - "Project Identity"
Cohesion: 0.67
Nodes (3): Expo App Config, status-native package, TS path alias @/*

## Knowledge Gaps
- **110 isolated node(s):** `name`, `slug`, `version`, `orientation`, `scheme` (+105 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useGame()` connect `UI Component Library` to `Game Data & Economy Helpers`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `GameProvider` connect `AI Generation Functions` to `Primitive UI Hook Wiring`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `GameProvider` (e.g. with `clampPercent` and `Status Native README`) actually correct?**
  _`GameProvider` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _110 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `UI Component Library` be split into smaller, more focused modules?**
  _Cohesion score 0.051106639839034206 - nodes in this community are weakly interconnected._
- **Should `AI Service & Providers` be split into smaller, more focused modules?**
  _Cohesion score 0.08076923076923077 - nodes in this community are weakly interconnected._
- **Should `Expo Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._