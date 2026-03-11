/**
 * Layer presets: named visual defaults merged into layer definitions at resolution.
 * Presets define visual params only (duration, opacity, rays, particleCount, etc.).
 * Anchor, plane, and payload mapping stay on the layer.
 */
import type { AnimationLayerDefinition, ProceduralLayerDefinition } from "../animationTypes";
import {
  CHOREO_FLASH_MS,
  IMPACT_CHOREO_BURST_MS,
  IMPACT_CHOREO_HEADLINE_MS,
  IMPACT_CHOREO_PARTICLES_MS,
  IMPACT_CHOREO_RING_MS,
} from "../animationConstants";

/** Visual-only defaults. Excludes type, preset, anchor, seatIndexFromPayload so presets cannot override placement. */
export type LayerPresetDefaults = Partial<
  Omit<ProceduralLayerDefinition, "type" | "preset" | "anchor" | "seatIndexFromPayload">
>;

export const LAYER_PRESETS: Record<string, LayerPresetDefaults> = {
  impact: { durationMs: 500, delayMs: CHOREO_FLASH_MS },
  winBurst: { durationMs: 600, rays: 16, delayMs: IMPACT_CHOREO_BURST_MS },
  goldBurst: { durationMs: 800, particleCount: 20, particleSpread: 70, delayMs: IMPACT_CHOREO_PARTICLES_MS },
  headlineWin: { durationMs: 1400, textSize: "hero", textGlow: true, delayMs: IMPACT_CHOREO_HEADLINE_MS },
  seatHalo: { durationMs: 800, delayMs: IMPACT_CHOREO_RING_MS },
  ambientGold: { durationMs: 2200, opacity: [0.08, 0.18], delayMs: 0 },
  burst: { durationMs: 400, rays: 8 },
  ambientDrift: { durationMs: 1200, particleCount: 8, particleSpread: 40, opacity: [0.2, 0.25] },
};

/**
 * Merges preset defaults with layer. Layer wins when both set a property.
 * If layer has no preset or preset is unknown, returns layer as-is.
 * Strips type from preset before merge so preset cannot accidentally override layer type.
 */
export function resolveLayerWithPreset(
  layer: AnimationLayerDefinition,
  presetRegistry: Record<string, LayerPresetDefaults> = LAYER_PRESETS
): AnimationLayerDefinition {
  const presetKey = "preset" in layer ? layer.preset : undefined;
  if (!presetKey || !presetRegistry[presetKey]) return layer;
  const preset = presetRegistry[presetKey] as Record<string, unknown>;
  const { type: _ignore, ...presetProps } = preset;
  return { ...presetProps, ...layer } as AnimationLayerDefinition;
}
