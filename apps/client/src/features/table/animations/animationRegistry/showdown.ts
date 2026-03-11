import type { TableAnimationDefinition } from "../animationTypes";
import { FX_EVENT } from "../animationTypes";
import {
  CHOREO_FLASH_MS,
  CHOREO_HEADLINE_MS,
  CHOREO_PARTICLES_MS,
  CHOREO_BURST_MS,
} from "../animationConstants";
import { def } from "./shared";

type ShowdownTier = 0 | 1 | 2 | 3 | 4;

export function buildShowdownTier(tier: ShowdownTier): TableAnimationDefinition {
  const config: Record<
    ShowdownTier,
    { durationMs: number; layers: TableAnimationDefinition["layers"] }
  > = {
    0: {
      durationMs: 1000,
      layers: [{ type: "TEXT", textRole: "headline", textSize: "medium", durationMs: 800, delayMs: CHOREO_HEADLINE_MS }],
    },
    1: {
      durationMs: 1200,
      layers: [
        { type: "FLASH", durationMs: 300, delayMs: CHOREO_FLASH_MS },
        { type: "TEXT", textRole: "headline", textSize: "large", durationMs: 900, delayMs: CHOREO_HEADLINE_MS },
      ],
    },
    2: {
      durationMs: 1500,
      layers: [
        { type: "BURST", durationMs: 400, rays: 8, delayMs: CHOREO_BURST_MS },
        { type: "FLASH", durationMs: 350, delayMs: CHOREO_FLASH_MS },
        { type: "TEXT", textRole: "headline", textSize: "large", durationMs: 1000, delayMs: CHOREO_HEADLINE_MS },
      ],
    },
    3: {
      durationMs: 1800,
      layers: [
        { type: "BURST", durationMs: 500, rays: 12, delayMs: CHOREO_BURST_MS },
        { type: "PARTICLES", durationMs: 600, particleCount: 12, particleSpread: 50, delayMs: CHOREO_PARTICLES_MS },
        { type: "FLASH", durationMs: 400, delayMs: CHOREO_FLASH_MS },
        { type: "TEXT", textRole: "headline", textSize: "xlarge", textGlow: true, durationMs: 1200, delayMs: CHOREO_HEADLINE_MS },
      ],
    },
    4: {
      durationMs: 2200,
      layers: [
        { type: "BURST", durationMs: 600, rays: 16, delayMs: CHOREO_BURST_MS },
        { type: "PARTICLES", durationMs: 800, particleCount: 16, particleSpread: 60, delayMs: CHOREO_PARTICLES_MS },
        { type: "FLASH", durationMs: 500, delayMs: CHOREO_FLASH_MS },
        { type: "TEXT", textRole: "headline", textSize: "xlarge", textGlow: true, durationMs: 1400, delayMs: CHOREO_HEADLINE_MS },
      ],
    },
  };
  const c = config[tier];
  return def(FX_EVENT.SHOWDOWN, tier, c.durationMs, c.layers);
}

export const SHOWDOWN_TIERS: TableAnimationDefinition[] = [
  buildShowdownTier(0),
  buildShowdownTier(1),
  buildShowdownTier(2),
  buildShowdownTier(3),
  buildShowdownTier(4),
];
