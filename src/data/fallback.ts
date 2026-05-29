// Round 1.11.32 Faza H — Expanded offline content bank.
//
// When Gemini is unreachable (503 after 3 retries, 401 invalid key,
// timeout, no key set) the AI service layer falls back to these banks
// to keep the feed alive. The Round 1.11.32 user feedback complained
// that the old offline pool was tiny (~20 entries) and that the same
// "5 fan comments" appeared under every post. This file ships:
//
//   • 100+ fan crowd comments across multiple vibes (hype, dunk,
//     deadpan, lifestyle, conspiracy, in-character).
//   • 30+ post templates for celeb authors (vague flexes, cryptic
//     drops, lifestyle bait, drama hints).
//   • 25 pre-baked thread chains — short conversational arcs (3-5
//     consecutive replies that read like a real reply-quote-dunk
//     sequence) so the offline path can drop a recognisable mini-
//     argument into any post.
//
// The arrays below stay flat strings; consumers in ai.ts shuffle,
// slice, and (per Round 1.11.32 H-3) optionally chain entries into
// sub-thread tree structures via parentReplyId.

// =============================================================
// 100+ fan crowd comments (8 vibe buckets)
// =============================================================

export const fallbackHypeComments: string[] = [
  "screaming. SCREAMING. why is this so good",
  "i'm not okay i'm not okay i'm not okay",
  "the timeline just SHIFTED with this one",
  "the way i'm dropping everything to read this again",
  "okay this is the moment we've been waiting for",
  "the audacity. the EXECUTION. iconic.",
  "this is the kind of post that ends careers",
  "alexa play 'i told you so' on loop",
  "the way my entire fyp just changed",
  "STOP THE INTERNET I NEED TO PROCESS",
  "this is so unserious in the best way",
  "tagging my therapist she needs to know",
  "the way i ran to the comments. archaeologists will study this",
  "ten outta ten no notes",
  "this is the kind of vibe i wear to interviews",
];

export const fallbackDunkComments: string[] = [
  "this is the worst era of all time and i said what i said",
  "imagine still defending this. couldn't be me.",
  "the receipts. don't. lie.",
  "you said this with your whole chest. respectfully no.",
  "the entitlement of this post is wild",
  "your fans are not your therapy team please",
  "this aged like milk in the sun",
  "we're really doing this on a tuesday",
  "the fall from grace is in real time",
  "this is the kind of post you delete in 3 hours",
  "tell me you're spiralling without telling me",
  "okay BUT have you considered touching grass",
  "tagged the receipts account. it's over.",
  "main character syndrome in HD",
  "we knew this era would be rough but damn",
];

export const fallbackDeadpanComments: string[] = [
  "ok",
  "interesting choice.",
  "noted.",
  "alright.",
  "i see.",
  "the bar is on the floor and yet.",
  "mm.",
  "well that's a sentence.",
  "neutral. expression.",
  "the words. typed.",
  "groundbreaking. truly.",
  "what a way to start the day.",
  "this is. happening.",
  "okay. that's a take.",
  "right. right. right.",
];

export const fallbackLifestyleComments: string[] = [
  "espresso for dinner is a personality at this point",
  "why is my cat staring at me like she also read this",
  "anyway, follow back queen ✨",
  "this radicalized me toward joy",
  "i'm normal. i'm normal. i'm not normal.",
  "the way i'm three drinks in reading this",
  "my therapist is gonna hear about this",
  "you can't drop this and disappear that's RUDE",
  "i missed lunch for this scroll. worth it.",
  "okay but the typography of this caption deserves a study",
  "rt'd to my mom's family group chat just to start drama",
  "screenshot saved. revisiting at 3am.",
  "the way my pulse just spiked",
  "this is the kind of post i wear as armor",
  "literally just started a new google doc",
];

export const fallbackConspiracyComments: string[] = [
  "the timing of this is suspicious and you all KNOW it",
  "this is a distraction from the album rollout",
  "they're trying to bury yesterday's leak with this",
  "the pr team is working overtime tonight",
  "if you don't see the pattern you're not looking",
  "this is psyop coded behavior",
  "the silence from the inner circle says everything",
  "draft message they had ready for weeks",
  "i've been tracking this and the numbers don't add up",
  "follow the money. always follow the money.",
  "the receipts will surface in 48 hours mark my words",
  "this is bigger than one post stay tuned",
  "i told y'all in january this was coming",
  "the fact that no one else is talking about this",
  "they want you to read this and forget about [REDACTED]",
];

export const fallbackInCharacterComments: string[] = [
  "you said it without saying it. iconic.",
  "the bridge would have been brutal here. respect.",
  "i'm printing this on a wall.",
  "studio's gonna feel this one",
  "after hours material",
  "weird color choice for the energy. i like it.",
  "if i don't sample this in a year i quit",
  "very specific. very intentional. i see it.",
  "you used the wrong font on purpose and i KNOW it",
  "okay yeah this is fine i'll allow it",
  "the precision in this. respect.",
  "the work decides. it just did.",
  "the city sounds different when you post like this",
  "this is a season 2 character development moment",
  "magnetism is energy and right now it's tilting",
];

export const fallbackQuestionComments: string[] = [
  "wait what does this even mean",
  "is this about [REDACTED]?",
  "okay but who is this referring to",
  "did i miss something",
  "should i be worried",
  "what is happening on this site today",
  "did they fight at the gala or am i making things up",
  "are we sure this isn't a hack",
  "is the team in damage control mode rn",
  "wait when did this happen",
];

export const fallbackVoidComments: string[] = [
  "the void is louder tonight",
  "we don't talk about what happens at 4am",
  "i'll think about this for a week",
  "this is going in the memory palace",
  "i don't have words. only feelings.",
  "the silence after this caption is doing things",
  "i can't even articulate. just felt.",
  "every time. every single time.",
  "i'll be back when i can speak again",
  "okay i'm going outside.",
];

// =============================================================
// 30+ post templates for celeb authors
// =============================================================

export const fallbackCelebPostTemplates: string[] = [
  "you can hear it before you understand it.",
  "the work always wins. quietly, then loudly.",
  "i'm telling you. wait three weeks.",
  "we built the whole thing in a closet. no notes.",
  "every era is a choice. tonight i'm choosing soft chaos.",
  "studio. 4am. nothing else exists right now.",
  "if it doesn't have at least three colors and one secret it's not a project.",
  "yk i was just gonna stay quiet today but here we are.",
  "the moment the bridge hit i KNEW.",
  "they keep asking. i keep saying. ask again in december.",
  "one word. one moment. one decision.",
  "this is the album i've been threatening for two years.",
  "we're not announcing anything tonight. but we're not NOT announcing either.",
  "every choice is a love letter to someone i haven't met yet.",
  "the math is mathing.",
  "i've never been more nervous and that means i'm doing it right.",
  "if you're reading this it's already too late.",
  "the season is the show.",
  "we're not even close to peaking.",
  "i told you i'd disappear. i'm back. it's different now.",
  "everything from here is bonus.",
  "the receipts? are CURATED.",
  "if you knew the room you'd never sleep again.",
  "we're cooking. quiet kitchen. loud results.",
  "the version of me you met last year? dead. love wins.",
  "the next post will make sense in 6 months.",
  "i don't owe anyone an explanation. but here goes.",
  "the muse is on speed dial again.",
  "the era of soft launches is OVER.",
  "we go LIVE in 47 hours. mark it.",
  "this is the part where i smile and say nothing.",
  "midnight. midnight!!! one word and the whole world is shifting.",
];

// =============================================================
// 25 thread chains — pre-baked mini-conversations.
// Each chain is an array of 3-5 consecutive entries that read like a
// real reply-quote-dunk sequence. The first entry sits at top-level
// (replies the original post); each subsequent entry is a sub-reply
// to the PREVIOUS chain entry. Consumers stitch them into the
// ThreadReply tree by walking the array and assigning parentReplyId
// from the prior entry.
// =============================================================

export const fallbackThreadChains: string[][] = [
  [
    "this is the kind of post that needs context. PLEASE.",
    "she literally said what she said. there's no context to add.",
    "ok well i need context BECAUSE i can't tell if this is shade",
    "you and me both. crying. ",
  ],
  [
    "the audacity is iconic",
    "iconic OR delusional. jury's out.",
    "okay you can't just call her delusional like that",
    "watch me",
  ],
  [
    "wait did they break up???",
    "no they're still together they're just GOING THROUGH IT",
    "going through it AT the met gala is wild though",
    "the met gala WAS the breakup energy babe",
  ],
  [
    "this is so unserious i love it",
    "wait what's unserious about it",
    "you're new here aren't you",
    "i've been here for YEARS i just need ONE example",
  ],
  [
    "the timing is suspicious",
    "EVERYTHING is suspicious to you",
    "and i'm RIGHT every time",
    "fine. give me the receipts then.",
  ],
  [
    "okay BUT the lyric in the bridge",
    "wait what bridge",
    "the BRIDGE BRIDGE. you didn't even LISTEN.",
    "i listened to the chorus and left. sue me.",
  ],
  [
    "they're trolling us",
    "no this is genuine",
    "look at the timestamp. nothing about this is genuine.",
    "okay conspiracy queen settle down",
  ],
  [
    "this aged like milk",
    "this LITERALLY just posted",
    "AND it already aged like milk. impressive.",
    "you have a gift for being mean. i respect it.",
  ],
  [
    "stop being mean to her",
    "she's a multimillionaire she's fine",
    "that's not the POINT",
    "okay what IS the point then",
  ],
  [
    "they keep getting away with this",
    "with what exactly",
    "EVERYTHING",
    "be more specific. i'm taking notes.",
  ],
  [
    "i told y'all in january",
    "told us what",
    "exactly this. go look at my timeline.",
    "wait i actually need to scroll back this is interesting",
  ],
  [
    "this is the kind of post you delete in 4 hours",
    "or pin",
    "delete OR pin. no in-between.",
    "the binary nature of celebrity twitter is so real",
  ],
  [
    "the receipts are NOT receipting",
    "they receipt enough",
    "enough for what babe",
    "for me to keep my popcorn warm",
  ],
  [
    "is this a soft launch or a hard launch",
    "this is a soft launch",
    "no this is a SUBTWEET",
    "soft launch subtweet hybrid. evolved.",
  ],
  [
    "i need a flowchart for what's happening",
    "would you like me to make one",
    "yes please. with arrows.",
    "give me 6 hours and a venn diagram. i got u.",
  ],
  [
    "okay but this slaps",
    "you say this about everything",
    "and i'm RIGHT every time",
    "show me one example where you were wrong",
  ],
  [
    "they hate us they really do",
    "who is they",
    "the algorithm",
    "the algorithm is not a person babe",
  ],
  [
    "wait i was promised a feud and this isn't a feud",
    "give it 6 hours",
    "fine. setting a timer.",
    "you'll be back. you always come back.",
  ],
  [
    "i'm not crying you're crying",
    "we're both crying it's fine",
    "okay collective sob session in the comments",
    "we shall persevere together.",
  ],
  [
    "this is going on my mood board",
    "your mood board is just other people's posts",
    "ART is RESPONSE.",
    "okay that's actually a fair point",
  ],
  [
    "the audacity is the album",
    "okay that's a tweet",
    "right? screenshot this for me",
    "already did. you're welcome.",
  ],
  [
    "we're so back",
    "are we though",
    "are you ever NOT back is the real question",
    "fair. carry on.",
  ],
  [
    "i need a glass of water and a lie down",
    "same. same.",
    "we'll meet on the other side babe",
    "see you in two business days",
  ],
  [
    "the second verse is everything",
    "the second verse is MID actually",
    "MID? have you LISTENED",
    "yes. midly.",
  ],
  [
    "stan twitter is undefeated tonight",
    "stan twitter is undefeated EVERY night",
    "fair. carry on.",
    "we always do.",
  ],
];

// =============================================================
// Helpers
// =============================================================

// Round 1.11.32 Faza H — concatenate every vibe bucket into one big
// pool. Consumers shuffle this list and slice the count they need; the
// vibe diversity is preserved by the wide bucket spread.
export const fallbackAllComments: string[] = [
  ...fallbackHypeComments,
  ...fallbackDunkComments,
  ...fallbackDeadpanComments,
  ...fallbackLifestyleComments,
  ...fallbackConspiracyComments,
  ...fallbackInCharacterComments,
  ...fallbackQuestionComments,
  ...fallbackVoidComments,
];

export function pickFallbackComment(): string {
  return fallbackAllComments[
    Math.floor(Math.random() * fallbackAllComments.length)
  ];
}

export function pickFallbackPostText(): string {
  return fallbackCelebPostTemplates[
    Math.floor(Math.random() * fallbackCelebPostTemplates.length)
  ];
}

export function pickFallbackThreadChain(): string[] {
  return fallbackThreadChains[
    Math.floor(Math.random() * fallbackThreadChains.length)
  ];
}
