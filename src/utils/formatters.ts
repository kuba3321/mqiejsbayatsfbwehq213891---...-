// Refactor #9 — formatters utility module.
//
// repostPost + applyPostReplies used to inline-parse `post.reposts`
// strings like "12.4K" via `parseFloat(raw.replace(/[^0-9.]/g, ""))`.
// That regex strips non-digits naively, which means strings like
// "12..4K" (an LLM hallucinating a stray dot), "K12.4" (a swapped
// suffix), or "" (empty) all return either NaN-fallback-to-zero or
// silently wrong numbers. parseRepostCount centralises the parse and
// hardens it: it accepts only ONE decimal point, handles the K/M
// suffix explicitly, and clamps the result to a sane range so an
// adversarial AI can't shove "1e308" into the value and freeze
// downstream math.

/**
 * Parse a repost-count string like "12.4K" / "1.2M" / "847" into a
 * numeric count of reposts. Hardened against:
 *   - empty / null / undefined input → returns 0
 *   - multiple decimal points ("12..4K") → only the first is honored
 *   - missing suffix ("847") → treated as raw count
 *   - exotic suffixes (anything other than K/M, case-insensitive) → ignored
 *   - unsafe magnitudes (> 1e12) → clamped to 1e12 (1T reposts = absurd)
 */
export function parseRepostCount(raw: string | null | undefined): number {
  if (typeof raw !== "string") return 0;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return 0;
  // Split on the first run of digits + optional decimal — drops a leading
  // sign character if any, ignores trailing garbage after the suffix.
  const match = trimmed.match(/(\d+(?:\.\d+)?)\s*([KkMm])?/);
  if (!match) return 0;
  const base = parseFloat(match[1]);
  if (!Number.isFinite(base)) return 0;
  const suffix = match[2]?.toUpperCase();
  const multiplier = suffix === "K" ? 1_000 : suffix === "M" ? 1_000_000 : 1;
  const total = base * multiplier;
  // Clamp to 1T to neutralise adversarial values.
  return Math.min(1_000_000_000_000, Math.max(0, total));
}

/**
 * Inverse of parseRepostCount — format a numeric count back into a
 * compact display string ("12.4K"). Mirrors the existing formatCount
 * helper in primitives.tsx but with explicit handling for sub-thousand
 * values so the smallest counts render as plain integers.
 */
export function formatRepostCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}
