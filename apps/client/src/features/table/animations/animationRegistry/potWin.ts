import type { TableAnimationDefinition } from "../animationTypes";
import { FX_EVENT } from "../animationTypes";
import {
  CHOREO_AMOUNT_MS,
  CHOREO_FLASH_MS,
  CHOREO_HEADLINE_MS,
  CHOREO_PARTICLES_MS,
  CHOREO_RING_MS,
  CHOREO_BURST_MS,
} from "../animationConstants";
import { def } from "./shared";

type PotWinTier = 0 | 1 | 2 | 3 | 4;

export function buildPotWinTier(tier: PotWinTier): TableAnimationDefinition {
  const config: Record<
    PotWinTier,
    { durationMs: number; layers: TableAnimationDefinition["layers"]; sounds?: TableAnimationDefinition["sounds"] }
  > = {
    0: {
      durationMs: 1200,
      layers: [
        { type: "RING", durationMs: 400, delayMs: CHOREO_RING_MS },
        { type: "TEXT", textRole: "headline", textSize: "small", durationMs: 800, delayMs: CHOREO_HEADLINE_MS },
        { type: "TEXT", textRole: "amount", durationMs: 600, delayMs: CHOREO_AMOUNT_MS },
      ],
    },
    1: {
      durationMs: 1400,
      layers: [
        { type: "FLASH", durationMs: 300, delayMs: CHOREO_FLASH_MS },
        { type: "RING", durationMs: 500, delayMs: CHOREO_RING_MS },
        { type: "TEXT", textRole: "headline", textSize: "medium", durationMs: 900, delayMs: CHOREO_HEADLINE_MS },
        { type: "TEXT", textRole: "amount", durationMs: 700, delayMs: CHOREO_AMOUNT_MS },
      ],
      sounds: [{ sound: "table.potWin", delayMs: 0 }],
    },
    2: {
      durationMs: 1600,
      layers: [
        { type: "BURST", durationMs: 400, rays: 8, delayMs: CHOREO_BURST_MS },
        { type: "FLASH", durationMs: 350, delayMs: CHOREO_FLASH_MS },
        { type: "RING", durationMs: 600, delayMs: CHOREO_RING_MS },
        { type: "TEXT", textRole: "headline", textSize: "large", durationMs: 1000, delayMs: CHOREO_HEADLINE_MS },
        { type: "TEXT", textRole: "amount", durationMs: 800, delayMs: CHOREO_AMOUNT_MS },
      ],
    },
    3: {
      durationMs: 1800,
      layers: [
        { type: "BURST", durationMs: 500, rays: 12, delayMs: CHOREO_BURST_MS },
        { type: "PARTICLES", durationMs: 600, particleCount: 12, particleSpread: 50, delayMs: CHOREO_PARTICLES_MS },
        { type: "FLASH", durationMs: 400, delayMs: CHOREO_FLASH_MS },
        { type: "RING", durationMs: 700, delayMs: CHOREO_RING_MS },
        { type: "TEXT", textRole: "headline", textSize: "xlarge", durationMs: 1100, delayMs: CHOREO_HEADLINE_MS },
        { type: "TEXT", textRole: "amount", durationMs: 900, delayMs: CHOREO_AMOUNT_MS },
      ],
    },
    4: {
      durationMs: 2200,
      layers: [
        { type: "BURST", durationMs: 600, rays: 16, delayMs: CHOREO_BURST_MS },
        { type: "PARTICLES", durationMs: 800, particleCount: 16, particleSpread: 60, delayMs: CHOREO_PARTICLES_MS },
        { type: "FLASH", durationMs: 500, delayMs: CHOREO_FLASH_MS },
        { type: "RING", durationMs: 800, delayMs: CHOREO_RING_MS },
        { type: "TEXT", textRole: "headline", textSize: "xlarge", textGlow: true, durationMs: 1400, delayMs: CHOREO_HEADLINE_MS },
        { type: "TEXT", textRole: "amount", durationMs: 1000, delayMs: CHOREO_AMOUNT_MS },
      ],
    },
  };
  const c = config[tier];
  return def(FX_EVENT.POT_WIN, tier, c.durationMs, c.layers, c.sounds);
}

export const POT_WIN_TIERS: TableAnimationDefinition[] = [
  buildPotWinTier(0),
  buildPotWinTier(1),
  buildPotWinTier(2),
  buildPotWinTier(3),
  buildPotWinTier(4),
];
