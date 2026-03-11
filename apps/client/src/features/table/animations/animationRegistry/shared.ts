import type {
  TableAnimationDefinition,
  TableAnimationEvent,
  AnimationLayerDefinition,
} from "../animationTypes";
import { FX_ANCHOR, FX_CHANNEL } from "../animationTypes";
import { getPresetLayers, type PresetName } from "./presets";

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

/** Build a definition from a preset (and optional appendLayers). Expansion at build time; runtime unchanged. */
export function defFromPreset(
  event: TableAnimationEvent,
  tier: number,
  presetName: PresetName,
  durationMs: number,
  options?: { sounds?: TableAnimationDefinition["sounds"]; appendLayers?: AnimationLayerDefinition[] }
): TableAnimationDefinition {
  const layers = getPresetLayers(presetName, options?.appendLayers);
  return def(event, tier, durationMs, layers, options?.sounds);
}
