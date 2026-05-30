// Versioned changelog. Surfaced inside the "What's new" entry in
// AppSettingsModal. Newest version sits at index 0 — the UpdatesModal
// renders the array in order, so prepending a new entry automatically
// pushes the rest down.
//
// Each version has:
//   - tag: short SemVer-ish label ("v1.1")
//   - title: punchy headline ("Beef Era")
//   - date: ISO yyyy-mm-dd
//   - tagline: 1-2 sentence pitch
//   - sections: themed groups of bullet points
//
// When adding a new entry, also bump CURRENT_VERSION so the future
// "first-launch toast" hook can detect a fresh install. The bump is
// purely advisory right now — no auto-toast wired yet.

export type ChangelogSection = {
  heading: string;
  bullets: string[];
};

export type ChangelogEntry = {
  tag: string;
  title: string;
  date: string;
  tagline: string;
  sections: ChangelogSection[];
};

export const CURRENT_VERSION = "v1.1.1";

export const changelog: ChangelogEntry[] = [
  {
    tag: "v1.1.1",
    title: "Hardening",
    date: "2026-05-30",
    tagline:
      "Auto-DMs now actually fire daily (without nuking the API), reported posts gracefully soft-delete, and the inbox can wake up to a real message from a configured contact.",
    sections: [
      {
        heading: "Auto-DM engine wired (lazy)",
        bullets: [
          "Every day rollover (after each event), each cast member whose Auto-DM intensity is set rolls dice — 1 = 5%, 2 = 15%, 3 = 35%, 4 = 60%. Hits drop a fresh inbound message into the chat AND a notification.",
          "Auto-invites use the same ladder. Hits create an ActivityInvite for tomorrow + an invite notification.",
          "Lazy generation: messages and invites use a small per-chemistry offline bank. ZERO AI calls fire at rollover — the expensive call only happens when the player replies inside the chat (existing flow). No flood, no 503, no save corruption.",
          "Hard cap of 1 DM + 1 invite per character per day even if both dice land.",
        ],
      },
      {
        heading: "Reports now soft-delete",
        bullets: [
          "Reported posts get a hidden:true flag instead of being filtered out of state.posts. Audit trail in reports[] stays consistent with a real (hidden) FeedPost.",
          "All UI surfaces (feed FlatList, post detail, character profile post lists, favorites) filter on !hidden. A reported post the player had also favorited just vanishes from the favorites row.",
          "Any in-flight applyPostReplies that targets a reported post now resolves to a ghost entry instead of being silently dropped.",
        ],
      },
    ],
  },
  {
    tag: "v1.1",
    title: "Beef Era",
    date: "2026-05-30",
    tagline:
      "Celebrities finally sound like themselves. Rivals throw subtle digs at you on the feed. You can favorite, report, mute, schedule auto-DMs, and the main goal now ends with a Grammy reveal.",
    sections: [
      {
        heading: "Personas & Beef",
        bullets: [
          "Each verified celeb now has a locked voice in every AI prompt — Drake plugs OVO and 6God, Kanye uses CAPS on one prophetic word, Billie writes lowercase four-word lines, Speed SCREAMS in CAPS, Sabrina drops 'babes' and espresso, Taylor weaves cardigan-November imagery. Ten characters, ten unmistakable voices.",
          "Chemistry directives strengthened. Rivals = 30% of their posts/replies must contain a subtle dig at you, 10% direct callouts. Enemies = 50% openly hostile. One-sided beef — set Sabrina to rival and watch her dissy posts start appearing on the feed.",
          "Player presence (humor + aura) now feeds into every AI prompt as a vibe label — 'chaotic gen-z', 'mysterious', 'icon status', 'still building'. AI tunes how it talks ABOUT you based on how the world reads you.",
        ],
      },
      {
        heading: "New systems",
        bullets: [
          "Favorites — tap any star to save posts or comments. New section in your Profile shows your starred memorabilia.",
          "Reports — long-press 3-dots on a post to report. If the post is genuinely hostile (rival/enemy author + mentions you), the community backs you: +50 followers, +5 aura, author loses vibe. If not, your reputation takes a hit. Post is removed either way.",
          "Mute notifications — bell button on any character profile. Silences alerts from them without affecting the world.",
          "Auto-DMs & invites — purple button in Messages opens the scheduler. Pick 0-4 intensity per character for daily proactive DMs and activity invites.",
          "Activity time picker — schedule activities by the hour (24h), with morning/midday/evening/late-night labels.",
          "Activity aftermath — Pop Craze drops a leak post about you and your activity partners ~70% of the time on the next refresh.",
        ],
      },
      {
        heading: "Goal cycle & closure",
        bullets: [
          "Main goal completion now triggers a Win Screen. In Accidentally Famous, that's a Grammy: 'Best New Artist goes to…' — sometimes you, sometimes someone else from your contacts.",
          "After winning, the goal cycles. New target threshold, fresh progress bar, your goalsCompleted counter ticks up.",
          "Milestones got real. Each completion drops a Pop Craze leak post + 200-800 follower bump. Every 5th milestone surfaces a 'New connections unlocked' notification — your industry pull is expanding.",
        ],
      },
      {
        heading: "UI polish",
        bullets: [
          "Replies are unified. The bottom composer is the ONLY reply input — sub-replies open it with a 'Replying to @handle' context bar. No more keyboard covering inline forms at the bottom of long threads.",
          "Like and repost get a pop animation in the post detail (matching the feed).",
          "Crisis bar is ALWAYS visible. Calm-state pill at 0/100 with 'Vibe: clear', escalates through orange/red/blackout as crisis climbs.",
          "Skill points: 3 per level (was 2). Available count promoted to a high-visibility orange pill.",
          "Marketplace icon is gone — both Feed and Goals headers now show a cog for Settings.",
          "Character profile buttons wired: bell toggles mute, settings opens an action sheet.",
          "Player profile left button is now an Activity Log shortcut (was a duplicate Settings).",
          "Dead 'Milestones' strip removed from Player Profile. Goals tab is the only place that lists them.",
          "Dead orange '+' next to XP in Goals removed (no onPress, was confusing).",
        ],
      },
      {
        heading: "Under the hood",
        bullets: [
          "API key moved from URL query to x-goog-api-key header — no more key leaks to proxy logs.",
          "Duplicate @handle bug squashed in sub-reply threads. The blue parent tag is the single source of truth now.",
          "First-person voice enforced across remaining offline celeb fallback templates.",
        ],
      },
    ],
  },
];
