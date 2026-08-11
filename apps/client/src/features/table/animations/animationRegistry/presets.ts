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
  IMPACT_CHOREO_RING_MS,
} from "../animationConstants";

export type PresetName =
  | "TIER_0"
  | "TIER_1"
  | "TIER_2"
  | "TIER_3"
  | "TIER_4"
  | "ALL_IN_TIER_0"
  | "ALL_IN_TIER_1"
  | "ALL_IN_TIER_2"
  | "ALL_IN_TIER_3"
  | "ALL_IN_TIER_4"
  | "POT_TIER_0"
  | "POT_TIER_1"
  | "POT_TIER_2"
  | "POT_TIER_3"
  | "POT_TIER_4"
  | "HAND_START";

/** Preset name → layer stack. Do not mutate; tier builders spread or append. */
const PRESETS: Record<PresetName, AnimationLayerDefinition[]> = {
  // SHOWDOWN only (the only event built from these presets). The headline is anchored ABOVE_BOARD,
  // not the definition's default TABLE_CENTER, so "SHOWDOWN" never flashes directly over the
  // community cards it's revealing — full-screen FLASH/BURST/PARTICLES stay at TABLE_CENTER for
  // the dramatic backdrop, only the text moves.
  TIER_0: [
    { type: "TEXT", textRole: "headline", textSize: "medium", anchor: "ABOVE_BOARD", durationMs: 800, delayMs: CHOREO_HEADLINE_MS },
  ],
  TIER_1: [
    { type: "FLASH", durationMs: 300, delayMs: CHOREO_FLASH_MS },
    { type: "TEXT", textRole: "headline", textSize: "large", anchor: "ABOVE_BOARD", durationMs: 900, delayMs: CHOREO_HEADLINE_MS },
  ],
  TIER_2: [
    { type: "BURST", durationMs: 400, rays: 8, delayMs: CHOREO_BURST_MS },
    { type: "FLASH", durationMs: 350, delayMs: CHOREO_FLASH_MS },
    { type: "TEXT", textRole: "headline", textSize: "large", anchor: "ABOVE_BOARD", durationMs: 1000, delayMs: CHOREO_HEADLINE_MS },
  ],
  TIER_3: [
    { type: "BURST", durationMs: 500, rays: 12, delayMs: CHOREO_BURST_MS },
    { type: "PARTICLES", durationMs: 600, particleCount: 12, particleSpread: 50, delayMs: CHOREO_PARTICLES_MS },
    { type: "FLASH", durationMs: 400, delayMs: CHOREO_FLASH_MS },
    { type: "TEXT", textRole: "headline", textSize: "xlarge", textGlow: true, anchor: "ABOVE_BOARD", durationMs: 1200, delayMs: CHOREO_HEADLINE_MS },
  ],
  TIER_4: [
    { type: "BURST", durationMs: 600, rays: 16, delayMs: CHOREO_BURST_MS },
    { type: "PARTICLES", durationMs: 800, particleCount: 16, particleSpread: 60, delayMs: CHOREO_PARTICLES_MS },
    { type: "FLASH", durationMs: 500, delayMs: CHOREO_FLASH_MS },
    { type: "TEXT", textRole: "headline", textSize: "xlarge", textGlow: true, anchor: "ABOVE_BOARD", durationMs: 1400, delayMs: CHOREO_HEADLINE_MS },
  ],
  // ALL_IN choreography: understated shove at tier 0, escalating to a near-tier-4 spectacle at
  // tier 3. Each tier adds a STREAK (directional "shove" motion) once the bet is meaningfully
  // large, giving ALL_IN a distinct silhouette from the plain TIER_0-3 fallback shapes.
  ALL_IN_TIER_0: [
    { type: "FLASH", durationMs: 250, delayMs: CHOREO_FLASH_MS },
    { type: "TEXT", textRole: "headline", textSize: "small", durationMs: 700, delayMs: CHOREO_HEADLINE_MS },
  ],
  ALL_IN_TIER_1: [
    { type: "FLASH", durationMs: 320, delayMs: CHOREO_FLASH_MS },
    { type: "BURST", durationMs: 350, rays: 6, delayMs: CHOREO_BURST_MS },
    { type: "TEXT", textRole: "headline", textSize: "medium", durationMs: 850, delayMs: CHOREO_HEADLINE_MS },
    { type: "TEXT", textRole: "amount", durationMs: 600, delayMs: CHOREO_AMOUNT_MS },
  ],
  ALL_IN_TIER_2: [
    { type: "BURST", durationMs: 420, rays: 10, delayMs: CHOREO_BURST_MS },
    { type: "FLASH", durationMs: 370, delayMs: CHOREO_FLASH_MS },
    { type: "STREAK", durationMs: 400, streakCount: 2, streakAngleDeg: 45, delayMs: 60 },
    { type: "TEXT", textRole: "headline", textSize: "large", textGlow: true, durationMs: 1000, delayMs: CHOREO_HEADLINE_MS },
    { type: "TEXT", textRole: "amount", durationMs: 700, delayMs: CHOREO_AMOUNT_MS },
  ],
  ALL_IN_TIER_3: [
    { type: "BURST", durationMs: 550, rays: 14, delayMs: CHOREO_BURST_MS },
    { type: "PARTICLES", durationMs: 550, particleCount: 14, particleSpread: 55, delayMs: CHOREO_PARTICLES_MS },
    { type: "FLASH", durationMs: 420, delayMs: CHOREO_FLASH_MS },
    { type: "STREAK", durationMs: 450, streakCount: 3, streakAngleDeg: 45, delayMs: 70 },
    { type: "TEXT", textRole: "headline", textSize: "xlarge", textGlow: true, durationMs: 1300, delayMs: CHOREO_HEADLINE_MS },
    { type: "TEXT", textRole: "amount", textSize: "medium", durationMs: 800, delayMs: CHOREO_AMOUNT_MS },
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
  // POT_WIN fires only for the hero's own win (see resolvePotWinAnimationDecision), right on top
  // of the persistent "X WINS $Y - HAND" status line that's already showing below the board — so
  // the amount TEXT layer here was a redundant, colliding restatement of a number already on
  // screen. Dropped it and moved the headline ABOVE_BOARD (same treatment as SHOWDOWN) so "YOU
  // WIN" never covers the community cards or that status line either.
  POT_TIER_0: [
    { type: "RING", durationMs: 400, delayMs: CHOREO_RING_MS },
    { type: "TEXT", textRole: "headline", textSize: "small", anchor: "ABOVE_BOARD", durationMs: 800, delayMs: CHOREO_HEADLINE_MS },
  ],
  POT_TIER_1: [
    { type: "FLASH", plane: "BACKGROUND", durationMs: 300, delayMs: CHOREO_FLASH_MS },
    { type: "RING", durationMs: 500, delayMs: CHOREO_RING_MS },
    { type: "TEXT", textRole: "headline", textSize: "medium", anchor: "ABOVE_BOARD", durationMs: 900, delayMs: CHOREO_HEADLINE_MS },
  ],
  POT_TIER_2: [
    { type: "BURST", preset: "burst", delayMs: CHOREO_BURST_MS },
    { type: "FLASH", plane: "BACKGROUND", durationMs: 350, delayMs: CHOREO_FLASH_MS },
    { type: "RING", durationMs: 600, delayMs: CHOREO_RING_MS },
    { type: "TEXT", textRole: "headline", textSize: "large", anchor: "ABOVE_BOARD", durationMs: 1000, delayMs: CHOREO_HEADLINE_MS },
  ],
  POT_TIER_3: [
    { type: "FLASH", plane: "BACKGROUND", durationMs: 400, delayMs: CHOREO_FLASH_MS },
    { type: "BURST", durationMs: 500, rays: 12, delayMs: CHOREO_BURST_MS },
    { type: "PARTICLES", durationMs: 600, particleCount: 14, particleSpread: 55, particleShape: "square", delayMs: CHOREO_PARTICLES_MS },
    { type: "RING", durationMs: 700, delayMs: CHOREO_RING_MS },
    { type: "TEXT", textRole: "headline", textSize: "xlarge", anchor: "ABOVE_BOARD", durationMs: 1100, delayMs: CHOREO_HEADLINE_MS },
  ],
  POT_TIER_4: [
    // A generic stock "casino.webm" clip played full-background here and read as a random,
    // out-of-place video flash on the biggest wins -- removed. The procedural layers below
    // (flash/burst/particles/ring/text) already carry the tier-4 celebration on their own.
    { type: "FLASH", plane: "BACKGROUND", durationMs: 500, delayMs: IMPACT_CHOREO_FLASH_MS },
    { type: "BURST", preset: "winBurst" },
    { type: "PARTICLES", durationMs: 800, particleCount: 20, particleSpread: 70, particleShape: "square", delayMs: IMPACT_CHOREO_PARTICLES_MS },
    { type: "RING", durationMs: 800, delayMs: IMPACT_CHOREO_RING_MS },
    { type: "TEXT", textRole: "headline", preset: "headlineWin", anchor: "ABOVE_BOARD" },
  ],
  /** Signal-only: deal sound + haptic (see handStartTrigger.ts / useTablePageController.tsx)
   *  carry the "new hand" cue. No visual layers — a board-anchored flash+ring was tried here and
   *  read as an unwanted gold oval flash across the table on every deal; removed rather than
   *  reskinned, since the felt itself already communicates "new hand" (cards appear, stacks
   *  reset) without needing an animated cue on top of it. */
  HAND_START: [],
};

export function getPresetLayers(name: PresetName, appendLayers?: AnimationLayerDefinition[]): AnimationLayerDefinition[] {
  const base = PRESETS[name];
  if (!appendLayers?.length) return base;
  return [...base, ...appendLayers];
}
