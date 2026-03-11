import type { TableAnimationDefinition, TableAnimationRequest } from "../animationTypes";
import { FX_ANCHOR, FX_CHANNEL, FX_EVENT } from "../animationTypes";
import { CHOREO_PARTICLES_MS, CHOREO_RING_MS } from "../animationConstants";

/** Hero-area aura when player goes all-in (companion to TABLE ALL_IN). Runs on HERO channel. */
export const HERO_AURA_ALL_IN: TableAnimationDefinition = {
  id: "HERO_AURA_ALL_IN",
  event: FX_EVENT.ALL_IN,
  tier: 3,
  channel: FX_CHANNEL.HERO,
  anchor: FX_ANCHOR.HERO,
  durationMs: 1200,
  layers: [
    { type: "RING", durationMs: 500, delayMs: CHOREO_RING_MS },
    { type: "PARTICLES", durationMs: 600, particleCount: 10, particleSpread: 40, delayMs: CHOREO_PARTICLES_MS },
  ],
};

export function getHeroAuraDefinition(
  event: TableAnimationRequest["event"],
  tier: number,
  payload?: TableAnimationRequest["payload"]
): TableAnimationDefinition | undefined {
  if (event !== FX_EVENT.ALL_IN || tier < 3 || !payload?.isHero) return undefined;
  return HERO_AURA_ALL_IN;
}
