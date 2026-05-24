// All sentiment / vibe scoring now comes from AI responses in structured JSON.
// This module retains only the math helpers used elsewhere in the state layer.

export function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}
