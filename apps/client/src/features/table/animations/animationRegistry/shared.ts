import type {
  TableAnimationDefinition,
  TableAnimationEvent,
} from "../animationTypes";
import { FX_ANCHOR, FX_CHANNEL } from "../animationTypes";

export type PreloadSource = { source: string; variant?: string };

export const DEFAULT_LAYER_PARAMS = {
  particleCount: 12,
  particleSpread: 50,
  rays: 8,
} as const;

export function buildDefinitionId(event: TableAnimationEvent, tier: number): string {
  return `${event}_TIER_${tier}`;
}

export function def(
  event: TableAnimationEvent,
  tier: number,
  durationMs: number,
  layers: TableAnimationDefinition["layers"],
  sounds?: TableAnimationDefinition["sounds"]
): TableAnimationDefinition {
  return {
    id: buildDefinitionId(event, tier),
    event,
    tier,
    channel: FX_CHANNEL.TABLE,
    anchor: FX_ANCHOR.TABLE_CENTER,
    durationMs,
    layers,
    sounds,
  };
}
