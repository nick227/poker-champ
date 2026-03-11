/**
 * Reusable FX presets: named layer stacks used by event tier builders.
 * Expansion happens at build time; runtime receives full definitions.
 */
import type { AnimationLayerDefinition } from "../animationTypes";
import {
  CHOREO_AMOUNT_MS,
  CHOREO_BURST_MS,
  CHOREO_FLASH_MS,
  CHOREO_HEADLINE_MS,
  CHOREO_PARTICLES_MS,
  CHOREO_RING_MS,
  IMPACT_CHOREO_AMOUNT_MS,
  IMPACT_CHOREO_BURST_MS,
  IMPACT_CHOREO_FLASH_MS,
  IMPACT_CHOREO_HEADLINE_MS,
  IMPACT_CHOREO_PARTICLES_MS,
  IMPACT_CHOREO_RADIAL_GLOW_MS,
  IMPACT_CHOREO_RING_MS,
} from "../animationConstants";

export type PresetName =
  | "TIER_0"
  | "TIER_1"
  | "TIER_2"
  | "TIER_3"
  | "TIER_4"
  | "ALL_IN_TIER_4"
  | "POT_TIER_0"
  | "POT_TIER_1"
  | "POT_TIER_2"
  | "POT_TIER_3"
  | "POT_TIER_4"
  | "ATMOSPHERE_SOFT_GLOW"
  | "ATMOSPHERE_WARM_GLOW";

/** Preset name → layer stack. Do not mutate; tier builders spread or append. */
export const PRESETS: Record<PresetName, AnimationLayerDefinition[]> = {
  TIER_0: [
    { type: "TEXT", textRole: "headline", textSize: "medium", durationMs: 800, delayMs: CHOREO_HEADLINE_MS },
  ],
  TIER_1: [
    { type: "FLASH", durationMs: 300, delayMs: CHOREO_FLASH_MS },
    { type: "TEXT", textRole: "headline", textSize: "large", durationMs: 900, delayMs: CHOREO_HEADLINE_MS },
  ],
  TIER_2: [
    { type: "BURST", durationMs: 400, rays: 8, delayMs: CHOREO_BURST_MS },
    { type: "FLASH", durationMs: 350, delayMs: CHOREO_FLASH_MS },
    { type: "TEXT", textRole: "headline", textSize: "large", durationMs: 1000, delayMs: CHOREO_HEADLINE_MS },
  ],
  TIER_3: [
    { type: "BURST", durationMs: 500, rays: 12, delayMs: CHOREO_BURST_MS },
    { type: "PARTICLES", durationMs: 600, particleCount: 12, particleSpread: 50, delayMs: CHOREO_PARTICLES_MS },
    { type: "FLASH", durationMs: 400, delayMs: CHOREO_FLASH_MS },
    { type: "TEXT", textRole: "headline", textSize: "xlarge", textGlow: true, durationMs: 1200, delayMs: CHOREO_HEADLINE_MS },
  ],
  TIER_4: [
    { type: "BURST", durationMs: 600, rays: 16, delayMs: CHOREO_BURST_MS },
    { type: "PARTICLES", durationMs: 800, particleCount: 16, particleSpread: 60, delayMs: CHOREO_PARTICLES_MS },
    { type: "FLASH", durationMs: 500, delayMs: CHOREO_FLASH_MS },
    { type: "TEXT", textRole: "headline", textSize: "xlarge", textGlow: true, durationMs: 1400, delayMs: CHOREO_HEADLINE_MS },
  ],
  ALL_IN_TIER_4: [
    { type: "BURST", durationMs: 600, rays: 16, delayMs: CHOREO_BURST_MS },
    { type: "PARTICLES", durationMs: 700, particleCount: 16, particleSpread: 60, delayMs: CHOREO_PARTICLES_MS },
    { type: "FLASH", durationMs: 450, delayMs: CHOREO_FLASH_MS },
    { type: "STREAK", durationMs: 500, streakCount: 4, streakAngleDeg: 45, delayMs: 80 },
    { type: "TEXT", textRole: "headline", textSize: "xlarge", textGlow: true, durationMs: 1500, delayMs: CHOREO_HEADLINE_MS },
    { type: "PARTICLES", durationMs: 500, particleCount: 8, particleSpread: 28, delayMs: CHOREO_HEADLINE_MS + 10, originOffsetY: 40 },
    { type: "TEXT", textRole: "amount", durationMs: 800, delayMs: CHOREO_AMOUNT_MS },
  ],
  POT_TIER_0: [
    { type: "RING", durationMs: 400, delayMs: CHOREO_RING_MS },
    { type: "TEXT", textRole: "headline", textSize: "small", durationMs: 800, delayMs: CHOREO_HEADLINE_MS },
    { type: "TEXT", textRole: "amount", durationMs: 600, delayMs: CHOREO_AMOUNT_MS },
  ],
  POT_TIER_1: [
    { type: "FLASH", plane: "BACKGROUND", durationMs: 300, delayMs: CHOREO_FLASH_MS },
    { type: "RING", durationMs: 500, delayMs: CHOREO_RING_MS },
    { type: "TEXT", textRole: "headline", textSize: "medium", durationMs: 900, delayMs: CHOREO_HEADLINE_MS },
    { type: "TEXT", textRole: "amount", durationMs: 700, delayMs: CHOREO_AMOUNT_MS },
  ],
  POT_TIER_2: [
    { type: "BURST", preset: "burst", delayMs: CHOREO_BURST_MS },
    { type: "FLASH", plane: "BACKGROUND", durationMs: 350, delayMs: CHOREO_FLASH_MS },
    { type: "RING", durationMs: 600, delayMs: CHOREO_RING_MS },
    { type: "TEXT", textRole: "headline", textSize: "large", durationMs: 1000, delayMs: CHOREO_HEADLINE_MS },
    { type: "TEXT", textRole: "amount", textSize: "medium", durationMs: 800, delayMs: CHOREO_AMOUNT_MS },
  ],
  POT_TIER_3: [
    // Atmosphere (BACKGROUND plane): soft glow behind table. Overlay routes by plane when two-plane stack exists.
    { type: "RADIAL_GLOW", plane: "BACKGROUND", durationMs: 1800, opacity: [0.06, 0.14], delayMs: 0 },
    { type: "FLASH", plane: "BACKGROUND", durationMs: 400, delayMs: CHOREO_FLASH_MS },
    { type: "BURST", durationMs: 500, rays: 12, delayMs: CHOREO_BURST_MS },
    { type: "PARTICLES", durationMs: 600, particleCount: 14, particleSpread: 55, particleShape: "square", delayMs: CHOREO_PARTICLES_MS },
    { type: "RING", durationMs: 700, delayMs: CHOREO_RING_MS },
    { type: "TEXT", textRole: "headline", textSize: "xlarge", durationMs: 1100, delayMs: CHOREO_HEADLINE_MS },
    { type: "TEXT", textRole: "amount", textSize: "large", durationMs: 900, delayMs: CHOREO_AMOUNT_MS },
  ],
  POT_TIER_4: [
    // Atmosphere (BACKGROUND plane): preset supplies duration/opacity; layer supplies plane.
    { type: "RADIAL_GLOW", preset: "ambientGold", plane: "BACKGROUND" },
    { type: "FLASH", plane: "BACKGROUND", durationMs: 500, delayMs: IMPACT_CHOREO_FLASH_MS },
    { type: "BURST", preset: "winBurst" },
    { type: "RADIAL_GLOW", durationMs: 550, delayMs: IMPACT_CHOREO_RADIAL_GLOW_MS },
    { type: "PARTICLES", durationMs: 800, particleCount: 20, particleSpread: 70, particleShape: "square", delayMs: IMPACT_CHOREO_PARTICLES_MS },
    { type: "RING", durationMs: 800, delayMs: IMPACT_CHOREO_RING_MS },
    { type: "TEXT", textRole: "headline", preset: "headlineWin" },
    { type: "TEXT", textRole: "amount", textSize: "large", durationMs: 1000, delayMs: IMPACT_CHOREO_AMOUNT_MS },
    { type: "PARTICLES", durationMs: 500, particleCount: 10, particleSpread: 32, delayMs: IMPACT_CHOREO_AMOUNT_MS + 20, originOffsetY: 72 },
  ],
  // Standalone atmosphere examples (BACKGROUND plane). Use for reactive atmosphere or prepend to event presets.
  ATMOSPHERE_SOFT_GLOW: [
    { type: "RADIAL_GLOW", plane: "BACKGROUND", durationMs: 2000, opacity: [0.05, 0.12], delayMs: 0 },
  ],
  ATMOSPHERE_WARM_GLOW: [
    { type: "RADIAL_GLOW", plane: "BACKGROUND", durationMs: 2500, opacity: [0.07, 0.16], delayMs: 0 },
  ],
};

export function getPresetLayers(name: PresetName, appendLayers?: AnimationLayerDefinition[]): AnimationLayerDefinition[] {
  const base = PRESETS[name];
  if (!appendLayers?.length) return base;
  return [...base, ...appendLayers];
}
