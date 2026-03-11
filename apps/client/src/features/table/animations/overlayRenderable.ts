/**
 * Resolves which layers to render for a definition (reduced motion + preset).
 * Used by both event and atmosphere pipelines in the overlay.
 */
import { resolveLayerWithPreset } from "./animationRegistry";
import { filterReducedMotionLayers } from "./animationConstants";
import type { TableAnimationDefinition, AnimationSettings, AnimationLayerDefinition } from "./animationTypes";

/** Layers ready to render: reduced-motion filtered and preset-resolved. */
export function resolveRenderableLayers(
  def: TableAnimationDefinition,
  settings: AnimationSettings
): AnimationLayerDefinition[] {
  const raw = settings.reducedMotion ? filterReducedMotionLayers(def.layers) : def.layers;
  return raw.map((layer) => resolveLayerWithPreset(layer));
}
