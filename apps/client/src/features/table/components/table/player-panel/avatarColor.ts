/**
 * Deterministic color identity for a player's avatar disc.
 *
 * Same seed (userId, falling back to display name) always yields the same
 * hue — stable across sessions/devices/reloads, no server round-trip needed.
 * (No existing color-from-string utility was found under src/lib or
 * src/theme; the closest relative is the ad-hoc `getAvatarColor` in
 * components/base/Avatar.tsx, which returns a Tailwind class from a small
 * fixed palette. That's a different shape than what's needed here — a full
 * hue plus light/dark/ring variants for a gradient-look disc — so this is a
 * small, purpose-built utility rather than a generic reuse.)
 */

/** Simple 32-bit string hash (djb2-ish). Deterministic, no crypto needed. */
function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0; // force 32-bit
  }
  return Math.abs(hash);
}

/** Stable hue (0-359) derived from a seed string. */
export function hueFromSeed(seed: string): number {
  const s = seed || "player";
  return hashSeed(s) % 360;
}

export type AvatarColorSet = {
  hue: number;
  /** Disc fill base tone. */
  base: string;
  /** Lighter tone used for the sheen/highlight overlay (adds gradient-like depth). */
  light: string;
  /** Darker tone used for the lower shading overlay. */
  dark: string;
  /** Idle-state ring stroke tone (same hue family as the disc). */
  ring: string;
};

/** Deterministic disc/ring color set for a given seed (userId or username). */
export function getAvatarColors(seed: string): AvatarColorSet {
  const hue = hueFromSeed(seed);
  return {
    hue,
    base: `hsl(${hue}, 44%, 38%)`,
    light: `hsl(${hue}, 58%, 56%)`,
    dark: `hsl(${hue}, 48%, 22%)`,
    ring: `hsl(${hue}, 52%, 52%)`,
  };
}
