/** Centralized JSON/object helpers for lessons pipeline. */

export function asObject(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((v) => typeof v === "string" && v.trim().length > 0))];
}

export function toLatestIso(values: (string | Date | null | undefined)[]): string | null {
  const times = values
    .map((v) => (v instanceof Date ? v.getTime() : v ? new Date(v).getTime() : NaN))
    .filter((t) => Number.isFinite(t));
  if (times.length === 0) return null;
  return new Date(Math.max(...times)).toISOString();
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

const COMMUNITY_ACTION_KEYS = new Set(["fold", "check", "call", "bet", "raise", "all_in"]);

export function normalizeCommunityAction(value: string): string | null {
  const action = value.trim().toLowerCase();
  return COMMUNITY_ACTION_KEYS.has(action) ? action : null;
}

export function getCommunityResponseKey(answer: unknown): string | null {
  const obj = asObject(answer);
  if (!obj) return null;
  if (typeof obj.type === "string") {
    const action = normalizeCommunityAction(obj.type);
    return action ? `act:${action}` : null;
  }
  if (typeof obj.optionKey === "string") {
    const key = obj.optionKey.trim().toUpperCase();
    return key.length > 0 ? `mcq:${key}` : null;
  }
  return null;
}
