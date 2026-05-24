# status native

A native Expo iOS/Android social-sim prototype inspired by the requested Status gameplay loop.

This project is pinned to Expo SDK 54 so it can run in the public App Store version of Expo Go.

## Run

```sh
npm install
npm start -- --clear
```

Then open the project with Expo Go or run a native build:

```sh
npm run ios
npm run android
```

## Implemented

- Native Expo Router app, not a web/PWA app.
- Landing screen, scenario hub, scenario details, character initialization, and five in-game tabs.
- Free single-player progression: no energy limits, refill timers, shop purchases, paid slots, or plus gates.
- Day 1 / Level 1 / 0 of 50 XP scenario reset.
- XP awards from likes, posts, side quests, milestones, and chat messages.
- Main event awards +108 XP and is the only mechanic that advances the day.
- Context-based save state persisted with Expo SecureStore.
- Profile settings for OpenAI or Gemini API keys and model selection.
- Client-side AI chat calls with fallback in-character replies when no key is present.
