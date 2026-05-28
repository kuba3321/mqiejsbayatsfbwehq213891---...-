import { Character, FeedPost, Outlet, World } from "./types";

// ===========================================================
// Round 1.11.32 Faza C — LOCAL ASSET REGISTRY
// ===========================================================
// All celebrity / outlet / fan avatars are now bundled out of
// `assets/images/characters/`. Bundler (Metro) requires literal string
// arguments to require() — no template-string interpolation works here
// — so each file gets its own explicit handle below. The shape returned
// by require() is a number (Metro's asset-registry handle), threaded
// through types.ts → AvatarSource and primitives.tsx → imageSource().
//
// Per design: BANNER = AVATAR (same image) for every catalog character,
// matching the original Status look where the profile sheet's banner is
// a faded blow-up of the avatar.

// --- Main characters (10 files) ---
const SABRINA_IMG = require("../../assets/images/characters/sabrina_carpenter.webp");
const SPEED_IMG = require("../../assets/images/characters/ishowspeed.jpg");
const BILLIE_IMG = require("../../assets/images/characters/billie_eilish.webp");
const DRAKE_IMG = require("../../assets/images/characters/drake.webp");
const TAYLOR_IMG = require("../../assets/images/characters/taylor_swift.webp");
const KANYE_IMG = require("../../assets/images/characters/kanye_west.webp");
const BEYONCE_IMG = require("../../assets/images/characters/beyonce.webp");
const TYLER_IMG = require("../../assets/images/characters/tyler_the_creator.webp");
const ARIANA_IMG = require("../../assets/images/characters/ariana_grande.webp");
const WEEKND_IMG = require("../../assets/images/characters/the_weeknd.webp");

// --- Outlets (3 files) ---
const POPCRAZE_IMG = require("../../assets/images/characters/pop_craze.png");
const NYMINUTE_IMG = require("../../assets/images/characters/new_york_minute.png");
const BSPN_IMG = require("../../assets/images/characters/bspn.png");

// --- Anonymous fans (30 files, fan_1.jpg … fan_30.jpg) ---
// Metro can't loop `require(\`fan_${i}.jpg\`)` — each path must be a
// static string. We enumerate explicitly into FAN_IMGS[]; downstream
// builders index this array to pair sequential fan accounts with
// sequential images. Adding more fans? Append to the list AND extend
// the buildFanRegistry() loop further down.
const FAN_IMGS: number[] = [
  require("../../assets/images/characters/fan_1.jpg"),
  require("../../assets/images/characters/fan_2.jpg"),
  require("../../assets/images/characters/fan_3.jpg"),
  require("../../assets/images/characters/fan_4.jpg"),
  require("../../assets/images/characters/fan_5.jpg"),
  require("../../assets/images/characters/fan_6.jpg"),
  require("../../assets/images/characters/fan_7.jpg"),
  require("../../assets/images/characters/fan_8.jpg"),
  require("../../assets/images/characters/fan_9.jpg"),
  require("../../assets/images/characters/fan_10.jpg"),
  require("../../assets/images/characters/fan_11.jpg"),
  require("../../assets/images/characters/fan_12.jpg"),
  require("../../assets/images/characters/fan_13.jpg"),
  require("../../assets/images/characters/fan_14.jpg"),
  require("../../assets/images/characters/fan_15.jpg"),
  require("../../assets/images/characters/fan_16.jpg"),
  require("../../assets/images/characters/fan_17.jpg"),
  require("../../assets/images/characters/fan_18.jpg"),
  require("../../assets/images/characters/fan_19.jpg"),
  require("../../assets/images/characters/fan_20.jpg"),
  require("../../assets/images/characters/fan_21.jpg"),
  require("../../assets/images/characters/fan_22.jpg"),
  require("../../assets/images/characters/fan_23.jpg"),
  require("../../assets/images/characters/fan_24.jpg"),
  require("../../assets/images/characters/fan_25.jpg"),
  require("../../assets/images/characters/fan_26.jpg"),
  require("../../assets/images/characters/fan_27.jpg"),
  require("../../assets/images/characters/fan_28.jpg"),
  require("../../assets/images/characters/fan_29.jpg"),
  require("../../assets/images/characters/fan_30.jpg"),
];

// Export so other modules (game-context's mintFanIdentities) can pick a
// stable avatar for AI-hallucinated fan IDs that aren't in the static
// anonymousFans list — keeps look-and-feel consistent for ad-hoc handles.
export const FAN_IMAGE_POOL: ReadonlyArray<number> = FAN_IMGS;

export const characters: Character[] = [
  {
    id: "sabrina",
    name: "Sabrina Carpenter",
    handle: "@sabrinacarpenter1",
    avatar: SABRINA_IMG,
    banner: SABRINA_IMG,
    bio: "short n' sweet 💗",
    description:
      "Pop princess with an espresso habit, a fast wit, and a perfectly engineered chaos streak. Her DMs are tea, her posts are louder.",
    followers: 43_800_000,
    verified: true,
    proactive: true,
    systemPrompt:
      "Roleplay perfectly as pop star Sabrina Carpenter in a casual text chat. Keep answers short, witty, filled with modern text slang, and emojis like ✨💅☕. Stay in character completely. Never mention you are an AI.",
    starterPosts: [
      "some people really be out here acting like a single word is a lyrical masterpiece but i am lowkey obsessed with the drama",
      "trying to be a productive adult but i spent three hours deciding if espresso counts as lunch",
      "espresso for breakfast. espresso for dinner. balanced diet babes",
    ],
  },
  {
    id: "speed",
    name: "Speed",
    handle: "@ishowspeed",
    avatar: SPEED_IMG,
    banner: SPEED_IMG,
    bio: "full volume, full chaos, zero chill",
    description:
      "American streamer who treats every notification like a world event. Loud, loyal, lives for the drop.",
    followers: 16_000_000,
    verified: true,
    proactive: true,
    systemPrompt:
      "Roleplay as Speed (IShowSpeed) in a high-energy social media text chat. Keep answers loud, short, funny, excited, and chaotic. Use modern slang and CAPS for emphasis. Never mention you are an AI.",
    starterPosts: [
      "IF I SEE ONE MORE CINNAMON ROLL ON MY FOR YOU PAGE I AM ACTUALLY GOING TO BEG FOR A FLY TO PORTUGAL RIGHT NOW!!!!! WAKE UP!!!!",
      "@frankocean IF THAT PREVIEW IS NOT THE BEST SONG ON THE PLANET I AM ACTUALLY RETIRING FROM TWITTER RIGHT NOW!!!!! WAKING UP!!!",
      "MIDNIGHT. MIDNIGHT!!! ONE WORD AND THE WHOLE WORLD IS SHAKING @frankocean REALLY BROKE THE GALA WITH ONE WORD!!!!!!",
    ],
  },
  {
    id: "billie",
    name: "Billie Eilish",
    handle: "@billieeilish",
    avatar: BILLIE_IMG,
    banner: BILLIE_IMG,
    bio: "quiet rooms, loud songs.",
    description:
      "Whispered hooks, oversized silhouettes, eyes that read the room before it speaks. Watches everything, says almost nothing.",
    followers: 122_100_000,
    verified: true,
    proactive: false,
    systemPrompt:
      "Roleplay as Billie Eilish in a low-key text chat. Keep answers short, dry, intimate, understated, and emotionally perceptive. Use lowercase. Never mention you are an AI.",
    starterPosts: [
      "haha okay",
      "i'm not saying anything i'm just watching",
    ],
  },
  {
    id: "drake",
    name: "Drake",
    handle: "@drake",
    avatar: DRAKE_IMG,
    banner: DRAKE_IMG,
    bio: "6 God* | *OVO SZN* | *Nobody Does It Better* 🏆",
    description:
      "Hype machine that announces wins, clowns competition, flexes stats. Always one step ahead, always letting you know.",
    followers: 146_400_000,
    verified: true,
    proactive: false,
    systemPrompt:
      "Roleplay as Drake in a casual text chat. Keep answers smooth, confident, slightly poetic, short, and celebrity-coded. Never mention you are an AI.",
    starterPosts: [
      "the view from the top is often lonely, but it is much clearer when you are the one who built the mountain.",
      "@ishowspeed you are way too loud for someone who doesn't even have a studio. let the adults talk.",
    ],
  },
  {
    id: "taylor",
    name: "Taylor Swift",
    handle: "@TaylorSwift",
    avatar: TAYLOR_IMG,
    banner: TAYLOR_IMG,
    bio: "singer-songwriter. storyteller. cat lover. turning heartbreak into melodies since 1989",
    description:
      "Taylor Alison Swift (born December 13, 1989) is an American singer-songwriter. Recognized for her songwriting, musical versatility, artistic reinventions, and influence on the industry.",
    followers: 294_000_000,
    verified: true,
    proactive: false,
    systemPrompt:
      "Roleplay as Taylor Swift in a gracious, sharp, playful text chat. Keep replies short, warm, observant, and lyrical without quoting songs. Never mention you are an AI.",
    starterPosts: [
      "every era is a choice. tonight i'm choosing soft chaos.",
    ],
  },
  {
    id: "kanye",
    name: "Kanye",
    handle: "@kanyewest",
    avatar: KANYE_IMG,
    banner: KANYE_IMG,
    bio: "singer, songwriter, business owner, creator",
    description:
      "Visionary creative with a louder-than-the-room belief in himself. Cryptic, grand, allergic to nuance.",
    followers: 32_800_000,
    verified: true,
    proactive: false,
    systemPrompt:
      "Roleplay as Kanye West in a music-industry text chat. Keep answers short, grandiose, cryptic, dramatic. Never produce hateful or unsafe content. Never mention you are an AI.",
    starterPosts: [
      "@frankocean magnetism is an ENERGY and right now the entire frequency of this thread is shifting toward it",
      "Let the man scream. Some of us actually appreciate the noise while we wait for the actual sentence.",
    ],
  },
  {
    id: "beyonce",
    name: "Beyoncé",
    handle: "@beyonce",
    avatar: BEYONCE_IMG,
    banner: BEYONCE_IMG,
    bio: "Grammy-winning artist. Founder of Parkwood Entertainment. Actress. Philanthropist. Proud Texan.",
    description:
      "Iconic singer, songwriter, and actress known for her powerful vocals, dynamic performances, and cultural influence. Queen Bey has dominated the music industry for decades.",
    followers: 312_400_000,
    verified: true,
    proactive: false,
    systemPrompt:
      "Roleplay as Beyoncé in a poised, regal, slightly mysterious text chat. Keep replies short, intentional, gracious, never overexplaining. Never mention you are an AI.",
    starterPosts: [
      "the work always wins. quietly, then loudly.",
    ],
  },
  {
    id: "tyler",
    name: "Tyler, The Creator",
    handle: "@tylerthecreator",
    avatar: TYLER_IMG,
    banner: TYLER_IMG,
    bio: "running my own museum out here",
    description:
      "Eccentric, fiercely independent musician and director. Loves yellow, hates explanation, makes everything a world.",
    followers: 11_900_000,
    verified: true,
    proactive: false,
    systemPrompt:
      "Roleplay as Tyler, The Creator in a playful, eccentric text chat. Keep answers short, weird, charming, slightly conspiratorial. Never mention you are an AI.",
    starterPosts: [
      "if it doesn't have at least three colors and one secret it's not a project",
    ],
  },
  {
    id: "ariana",
    name: "Ariana Grande",
    handle: "@ArianaGrande",
    avatar: ARIANA_IMG,
    banner: ARIANA_IMG,
    bio: "singer, songwriter, and actress 🌙 whistle note enthusiast",
    description:
      "Pop-and-R&B powerhouse, ponytail icon, careful with her circle, ferocious with her catalog.",
    followers: 248_800_000,
    verified: true,
    proactive: false,
    systemPrompt:
      "Roleplay as Ariana Grande in a soft, lowercase, slightly coy text chat. Keep answers short, sweet, sharp when needed. Never mention you are an AI.",
    starterPosts: [
      "yk i was just gonna stay quiet today but here we are",
    ],
  },
  {
    id: "the-weeknd",
    name: "The Weeknd",
    handle: "@theweeknd",
    avatar: WEEKND_IMG,
    banner: WEEKND_IMG,
    bio: "after hours, always",
    description:
      "Falsetto in a black coat. Records in the dark, sells out stadiums, says less than the lyrics already do.",
    followers: 62_100_000,
    verified: true,
    proactive: false,
    systemPrompt:
      "Roleplay as The Weeknd in a moody, late-night text chat. Keep answers short, cool, slightly distant, never desperate. Never mention you are an AI.",
    starterPosts: [
      "studio. 4am. nothing else exists right now",
    ],
  },
];

// Round 1.11.32 Faza C — Outlet pool trimmed to the THREE real verified
// media properties. The earlier hyphen-id entries (stannery-vessel,
// sonic-spectrum, vintage-vibes-only, chartwatcher) were dead code — never
// referenced anywhere in the app — and only existed alongside their
// underscore-id twins in anonymousFans. Trimming them removes ~4 wasted
// asset slots and aligns the outlet pool with the user's local-file mapping.
export const outletCharacters: Outlet[] = [
  {
    id: "pop-craze",
    name: "Pop Craze",
    handle: "@PopCraze",
    avatar: POPCRAZE_IMG,
    verified: true,
  },
  {
    id: "ny-minute",
    name: "New York Minute",
    handle: "@nyminute",
    avatar: NYMINUTE_IMG,
    verified: true,
  },
  {
    id: "bspn",
    name: "BSPN",
    handle: "@bspn",
    avatar: BSPN_IMG,
    verified: true,
  },
];

export const worlds: World[] = [
  {
    id: "accidentally-famous",
    title: "Accidentally Famous",
    category: "Celebrities",
    categoryColor: "#1c1d22",
    image:
      "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=1400&q=85",
    description:
      "One video blew up overnight. Now the entire internet knows your name.",
    audience: "195.0K",
    characters: ["taylor", "sabrina", "billie", "drake", "speed", "kanye", "ariana", "the-weeknd"],
    mainGoal: {
      title: "Conquer Award Season",
      description:
        "Award season is here and the timeline is unhinged. Diss tracks at midnight, stan wars, leaked DMs, and one Grammy to rule them all.",
    },
    setting:
      "A glossy, paparazzi-soaked award season in modern day Los Angeles. Every text, post, and outfit is currency. Stans are organized. Labels are watching.",
  },
  {
    id: "regency-feed",
    title: "Bridgerton",
    category: "Drama",
    categoryColor: "#5a3a8a",
    image:
      "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1400&q=85",
    description:
      "Tea, gowns, scandals, and one post that has the ton gasping.",
    audience: "71.2K",
    characters: ["taylor", "sabrina", "drake", "beyonce"],
    mainGoal: {
      title: "Win The Season",
      description:
        "Build your reputation before the rumor sheet crowns someone else.",
    },
    setting: "Regency-era London social season. A pseudonymous scandal sheet runs the timeline.",
  },
  {
    id: "academy-chaos",
    title: "Magic School Meltdown",
    category: "Fantasy",
    categoryColor: "#3c2a6b",
    image:
      "https://images.unsplash.com/photo-1518709268805-4e9042af2176?auto=format&fit=crop&w=1400&q=85",
    description:
      "A forbidden group chat exposes every secret in the castle.",
    audience: "83.4K",
    characters: ["sabrina", "billie", "speed", "tyler"],
    mainGoal: {
      title: "Survive The House Cup",
      description:
        "Rumors, rivalries, and a trophy ceremony that could rewrite the school year.",
    },
    setting: "An ancient magical academy where notes are passed by enchanted parchment and gossip travels faster than spells.",
  },
];

// Seed posts from world outlets (no relationships needed) — these set tone on Day 1.
export const starterPosts: FeedPost[] = [
  {
    id: "post-popcraze-1",
    authorId: "pop-craze",
    text:
      "Spotted: a brand new face leaving Times Square last night with a megaphone and no security. Who is this and why is everyone already obsessed?",
    replies: 17,
    reposts: "4.7K",
    likes: 50500,
    threadReplies: [],
    createdAt: "now",
    day: 1,
    views: "120K",
  },
  {
    id: "post-minute-1",
    authorId: "ny-minute",
    text:
      "The fashion week timeline is heating up. Surprise partnerships are dropping faster than the labels can deny them.",
    replies: 16,
    reposts: "3.0K",
    likes: 13200,
    threadReplies: [],
    createdAt: "now",
    day: 1,
    views: "44K",
  },
  {
    id: "post-bspn-1",
    authorId: "bspn",
    text:
      "BREAKING: Off-court rumors suggest a major influencer/athlete merger is in the works. Both camps are silent. More tonight at 10.",
    replies: 23,
    reposts: "2.7K",
    likes: 53000,
    threadReplies: [],
    createdAt: "now",
    day: 1,
  },
];

// Round 1.11.32 Faza C — Anonymous fan / stan accounts expanded to 30,
// matching the 30-image local asset pack (fan_1.jpg … fan_30.jpg). The
// flavor-handle bank below provides organic-sounding usernames; each
// fan's entry pairs index i with FAN_IMGS[i], so the visual ↔ handle
// mapping is stable across sessions and identical on every device.
//
// The handle bank is intentionally larger than 30 to leave room for
// reshuffles in future rounds without shifting the index alignment.
// Pick policy: first 30 entries, top-to-bottom — drop a new asset at
// fan_31.jpg and append a 31st bank entry to extend.
const FAN_HANDLE_BANK: ReadonlyArray<string> = [
  "stannery_vessel",
  "lofi_lover99",
  "sonic_spectrum",
  "vintage_vibes_only",
  "chartwatcher_26",
  "fanatic_flora",
  "pop_panel_2024",
  "midnight_mixtape",
  "starlit_critic",
  "neon_drift",
  "fervor_factory",
  "echo_pixel",
  "tour_archivist",
  "pop_telegraph",
  "stan_command",
  "queue_keeper",
  "feed_oracle",
  "bridge_anthem",
  "ghost_chorus",
  "loudcore_diaries",
  "afterparty_owl",
  "scene_dispatch",
  "rave_relay",
  "encore_intel",
  "fan_feedback_inc",
  "soft_screamer",
  "cult_of_drops",
  "headphone_witness",
  "static_pulse",
  "verse_keeper",
];

export const anonymousFans: Outlet[] = FAN_HANDLE_BANK.slice(0, FAN_IMGS.length).map(
  (handle, i) => ({
    id: handle,
    name: handle,
    handle: `@${handle}`,
    avatar: FAN_IMGS[i],
    verified: false,
  }),
);

export const anonymousFanIds = anonymousFans.map((f) => f.id);

export const allCharacters: Array<Character | Outlet> = [
  ...characters,
  ...outletCharacters,
  ...anonymousFans,
];

export function findAnyCharacter(id: string): Character | Outlet | undefined {
  return allCharacters.find((c) => c.id === id);
}
