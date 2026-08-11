/**
 * Single source of visual config for table FX.
 * Layer components read colors and sizes from here; missing keys fall back to in-component defaults.
 * Version protects against breaking changes when new palette/timing fields are added.
 */
import type { TableAnimationEvent } from "./animationTypes";

export const ANIMATION_THEME_VERSION = 1;

export type AnimationThemePalette = {
  flash: string;
  burst: string;
  ring: string;
  particle: string;
  headline: string;
  headlineGlow: string;
  amountBg: string;
  amountText: string;
  /** Optional; for FLASH sweep / directional effects. */
  streakColor?: string;
  /** Optional; for hero halo / focus ring. */
  haloColor?: string;
  /** Optional; outer glow for headline when glow=true (fire depth). */
  headlineGlowSecondary?: string;
  /** Optional; bright inner glow (white/yellow core) for multi-tone fire. */
  headlineGlowBright?: string;
  /** Optional; border color for amount pill (pot chip look). */
  amountBorder?: string;
};

export type AnimationThemeTiming = {
  flashDurationMs: number;
  burstScale: [number, number];
  ringScale: [number, number];
};

export type AnimationThemeTextScale = {
  small: number;
  medium: number;
  large: number;
  xlarge: number;
  /** Viewport-dominant headline; fixed 72px until layout-driven scale exists. */
  hero: number;
};

export type AnimationTheme = {
  version: typeof ANIMATION_THEME_VERSION;
  palette: AnimationThemePalette;
  timing: AnimationThemeTiming;
  textScale: AnimationThemeTextScale;
};

const DEFAULT_PALETTE: AnimationThemePalette = {
  flash: "rgba(255, 200, 100, 0.4)",
  burst: "rgba(255, 100, 50, 0.6)",
  ring: "rgba(255, 215, 0, 0.95)",
  particle: "rgba(255, 180, 80, 0.95)",
  headline: "#fff",
  headlineGlow: "rgba(255, 100, 50, 0.95)",
  amountBg: "rgba(200, 60, 40, 0.9)",
  amountText: "#fff",
  streakColor: "rgba(255, 120, 60, 0.65)",
  haloColor: "rgba(255, 200, 100, 0.55)",
};

/** Per-event palette overrides. Merged over default; only override keys that change. */
const EVENT_PALETTE_OVERRIDES: Partial<Record<TableAnimationEvent, Partial<AnimationThemePalette>>> = {
  POT_WIN: {
    flash: "rgba(255, 210, 130, 0.38)",
    burst: "rgba(255, 180, 60, 0.55)",
    ring: "rgba(255, 200, 80, 0.92)",
    particle: "rgba(255, 190, 100, 0.92)",
    headline: "#fff",
    headlineGlow: "rgba(255, 160, 60, 0.85)",
    headlineGlowBright: "rgba(255, 240, 200, 0.95)",
    amountBg: "rgba(180, 90, 40, 0.92)",
    amountText: "#fff",
    amountBorder: "rgba(200, 120, 50, 0.95)",
    streakColor: "rgba(255, 180, 80, 0.58)",
    haloColor: "rgba(255, 200, 120, 0.52)",
  },
  ALL_IN: {
    flash: "rgba(255, 80, 60, 0.45)",
    burst: "rgba(255, 70, 40, 0.65)",
    ring: "rgba(255, 90, 50, 0.95)",
    particle: "rgba(255, 100, 60, 0.95)",
    headline: "#fff",
    headlineGlow: "rgba(255, 80, 50, 0.95)",
    headlineGlowSecondary: "rgba(180, 30, 20, 0.9)",
    headlineGlowBright: "rgba(255, 200, 180, 0.9)",
    amountBg: "rgba(160, 40, 35, 0.94)",
    amountText: "#fff",
    amountBorder: "rgba(255, 90, 60, 0.95)",
    streakColor: "rgba(255, 60, 40, 0.72)",
    haloColor: "rgba(255, 100, 60, 0.62)",
  },
  SHOWDOWN: {
    flash: "rgba(180, 160, 255, 0.35)",
    burst: "rgba(140, 120, 220, 0.55)",
    ring: "rgba(160, 140, 255, 0.9)",
    particle: "rgba(170, 150, 255, 0.88)",
    headline: "#fff",
    headlineGlow: "rgba(160, 140, 255, 0.8)",
    amountBg: "rgba(60, 50, 100, 0.92)",
    amountText: "#fff",
    streakColor: "rgba(140, 120, 220, 0.58)",
    haloColor: "rgba(160, 140, 255, 0.52)",
  },
  HAND_START: {
    flash: "rgba(255, 220, 150, 0.22)",
    ring: "rgba(255, 210, 140, 0.55)",
    burst: "rgba(255, 200, 120, 0.3)",
    particle: "rgba(255, 200, 120, 0.4)",
    headline: "#fff",
    headlineGlow: "rgba(255, 200, 120, 0.4)",
    amountBg: "rgba(40, 35, 25, 0.8)",
    amountText: "#fff",
    streakColor: "rgba(255, 210, 140, 0.35)",
    haloColor: "rgba(255, 220, 150, 0.35)",
  },
  WINNER_REVEAL: {
    // Only haloColor matters (SEAT_GLOW_WINNER_REVEAL is the only definition on this event, and
    // renderSeatGlow reads palette.haloColor ?? palette.ring). Reuses POT_WIN's `ring` value
    // exactly — the color WinningSeatPulse hard-coded before this event existed — so the
    // migration doesn't change what the pulse looks like.
    haloColor: "rgba(255, 200, 80, 0.92)",
  },
};

const DEFAULT_TIMING: AnimationThemeTiming = {
  flashDurationMs: 350,
  burstScale: [0.2, 1.35],
  ringScale: [0.65, 1.2],
};

const DEFAULT_TEXT_SCALE: AnimationThemeTextScale = {
  small: 24,
  medium: 32,
  large: 42,
  xlarge: 56,
  hero: 72,
};

const defaultAnimationTheme: AnimationTheme = {
  version: ANIMATION_THEME_VERSION,
  palette: DEFAULT_PALETTE,
  timing: DEFAULT_TIMING,
  textScale: DEFAULT_TEXT_SCALE,
};

function mergePalette(override: Partial<AnimationThemePalette> | undefined): AnimationThemePalette {
  if (!override) return DEFAULT_PALETTE;
  return { ...DEFAULT_PALETTE, ...override };
}

const THEME_CACHE = new Map<TableAnimationEvent, AnimationTheme>();

/** Resolve theme for an event. Per-event palette overrides merged over default; timing and textScale shared. Cached by event to avoid allocations on re-render. */
export function getAnimationTheme(event?: TableAnimationEvent | string | null): AnimationTheme {
  const key = event as TableAnimationEvent | undefined;
  if (!key || !EVENT_PALETTE_OVERRIDES[key]) return defaultAnimationTheme;
  let cached = THEME_CACHE.get(key);
  if (!cached) {
    const palette = mergePalette(EVENT_PALETTE_OVERRIDES[key]);
    cached = {
      version: ANIMATION_THEME_VERSION,
      palette,
      timing: DEFAULT_TIMING,
      textScale: DEFAULT_TEXT_SCALE,
    };
    THEME_CACHE.set(key, cached);
  }
  return cached;
}
