import type { TableAnimationDefinition } from "../animationTypes";
import { FX_EVENT } from "../animationTypes";
import {
  CHOREO_AMOUNT_MS,
  CHOREO_FLASH_MS,
  CHOREO_HEADLINE_MS,
  CHOREO_PARTICLES_MS,
  CHOREO_BURST_MS,
} from "../animationConstants";
import { def } from "./shared";

type AllInTier = 0 | 1 | 2 | 3 | 4;

export function buildAllInTier(tier: AllInTier): TableAnimationDefinition {
  const config: Record<
    AllInTier,
    { durationMs: number; layers: TableAnimationDefinition["layers"] }
  > = {
    0: {
      durationMs: 1000,
      layers: [{ type: "TEXT", textRole: "headline", textSize: "medium", durationMs: 700, delayMs: CHOREO_HEADLINE_MS }],
    },
    1: {
      durationMs: 1200,
      layers: [
        { type: "FLASH", durationMs: 250, delayMs: CHOREO_FLASH_MS },
        { type: "TEXT", textRole: "headline", textSize: "large", durationMs: 900, delayMs: CHOREO_HEADLINE_MS },
      ],
    },
    2: {
      durationMs: 1500,
      layers: [
        { type: "BURST", durationMs: 400, rays: 6, delayMs: CHOREO_BURST_MS },
        { type: "FLASH", durationMs: 300, delayMs: CHOREO_FLASH_MS },
        { type: "TEXT", textRole: "headline", textSize: "large", durationMs: 1000, delayMs: CHOREO_HEADLINE_MS },
      ],
    },
    3: {
      durationMs: 1800,
      layers: [
        { type: "BURST", durationMs: 500, rays: 10, delayMs: CHOREO_BURST_MS },
        { type: "PARTICLES", durationMs: 500, particleCount: 12, particleSpread: 50, delayMs: CHOREO_PARTICLES_MS },
        { type: "FLASH", durationMs: 350, delayMs: CHOREO_FLASH_MS },
        { type: "TEXT", textRole: "headline", textSize: "xlarge", textGlow: true, durationMs: 1200, delayMs: CHOREO_HEADLINE_MS },
      ],
    },
    4: {
      durationMs: 2200,
      layers: [
        { type: "BURST", durationMs: 600, rays: 16, delayMs: CHOREO_BURST_MS },
        { type: "PARTICLES", durationMs: 700, particleCount: 16, particleSpread: 60, delayMs: CHOREO_PARTICLES_MS },
        { type: "FLASH", durationMs: 450, delayMs: CHOREO_FLASH_MS },
        { type: "TEXT", textRole: "headline", textSize: "xlarge", textGlow: true, durationMs: 1500, delayMs: CHOREO_HEADLINE_MS },
        { type: "PARTICLES", durationMs: 500, particleCount: 8, particleSpread: 28, delayMs: CHOREO_HEADLINE_MS + 10, originOffsetY: 40 },
        { type: "TEXT", textRole: "amount", durationMs: 800, delayMs: CHOREO_AMOUNT_MS },
      ],
    },
  };
  const c = config[tier];
  return def(FX_EVENT.ALL_IN, tier, c.durationMs, c.layers);
}

export const ALL_IN_TIERS: TableAnimationDefinition[] = [
  buildAllInTier(0),
  buildAllInTier(1),
  buildAllInTier(2),
  buildAllInTier(3),
  buildAllInTier(4),
];
