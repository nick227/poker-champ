import type {
  TableAnimationDefinition,
  TableAnimationEvent,
  AnimationLayerDefinition,
} from "../animationTypes";
import {
  ERROR_ASSET_REQUIRES_SOURCE,
  ERROR_DUPLICATE_DEFINITION,
  ERROR_DURATION_POSITIVE,
  ERROR_EMPTY_LAYERS,
  ERROR_TEXT_REQUIRES_ROLE,
  FX_DEBUG_PREFIX,
} from "../animationConstants";
import { SOUND_EVENT_MAP } from "@/sound/soundEventMap";
import { buildDefinitionId, DEFAULT_LAYER_PARAMS, type PreloadSource } from "./shared";
import { POT_WIN_TIERS } from "./potWin";
import { ALL_IN_TIERS } from "./allIn";
import { SHOWDOWN_TIERS } from "./showdown";

/** Event-grouped registry. Tiers 0–4 per event. Resolver uses fallback to closest lower tier. */
export const TABLE_ANIMATIONS: Record<TableAnimationEvent, TableAnimationDefinition[]> = {
  POT_WIN: POT_WIN_TIERS,
  ALL_IN: ALL_IN_TIERS,
  SHOWDOWN: SHOWDOWN_TIERS,
};

export { buildDefinitionId, DEFAULT_LAYER_PARAMS, type PreloadSource };

function getAllDefinitions(): TableAnimationDefinition[] {
  return (Object.values(TABLE_ANIMATIONS) as TableAnimationDefinition[][]).flat();
}

const BY_EVENT_TIER = new Map<TableAnimationEvent, Map<number, TableAnimationDefinition>>();
for (const event of Object.keys(TABLE_ANIMATIONS) as TableAnimationEvent[]) {
  const tierMap = new Map<number, TableAnimationDefinition>();
  for (const d of TABLE_ANIMATIONS[event]) tierMap.set(d.tier, d);
  BY_EVENT_TIER.set(event, tierMap);
}

function buildPreloadSources(): PreloadSource[] {
  const out: PreloadSource[] = [];
  const seen = new Set<string>();
  for (const d of getAllDefinitions()) {
    for (const layer of d.layers) {
      if (layer.type !== "ASSET" || !layer.preload || !layer.source?.trim()) continue;
      const key = `${layer.source}:${layer.variant ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ source: layer.source, variant: layer.variant });
    }
  }
  return out;
}

const PRELOAD_SOURCES = buildPreloadSources();

export function getPreloadSources(): PreloadSource[] {
  return PRELOAD_SOURCES;
}

/** Resolve by event and tier; fall back to closest lower tier if exact missing. O(1) lookup. */
export function resolveAnimation(
  event: TableAnimationEvent,
  tier: number
): TableAnimationDefinition | undefined {
  const clamped = Math.max(0, Math.min(4, Math.floor(tier))) as 0 | 1 | 2 | 3 | 4;
  const tierMap = BY_EVENT_TIER.get(event);
  if (!tierMap) return undefined;
  if (tierMap.has(clamped)) return tierMap.get(clamped);
  for (let t = clamped - 1; t >= 0; t--) {
    if (tierMap.has(t)) return tierMap.get(t);
  }
  return undefined;
}

function validateLayer(layer: AnimationLayerDefinition, event: string, tier: number): void {
  if (layer.type === "TEXT" && layer.textRole == null) {
    throw new Error(`Animation ${event} tier ${tier}: ${ERROR_TEXT_REQUIRES_ROLE}`);
  }
  if (layer.type === "ASSET") {
    if (!layer.source) throw new Error(`Animation ${event} tier ${tier}: ${ERROR_ASSET_REQUIRES_SOURCE}`);
  }
}

/** Validates registry at startup. Throws if invalid. Logs dev warnings for unknown sound keys. */
export function validateDefinitions(definitions: TableAnimationDefinition[]): void {
  const seen = new Set<string>();
  const validSounds = new Set(Object.keys(SOUND_EVENT_MAP));
  for (const d of definitions) {
    const key = `${d.event}:${d.tier}`;
    if (seen.has(key)) throw new Error(`${ERROR_DUPLICATE_DEFINITION}: ${key}`);
    seen.add(key);
    if (d.layers.length === 0) throw new Error(`Animation ${d.id}: ${ERROR_EMPTY_LAYERS}`);
    if (d.durationMs <= 0) throw new Error(`Animation ${d.id}: ${ERROR_DURATION_POSITIVE}`);
    if (d.durationMs < 150 || d.durationMs > 4000) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn(`${FX_DEBUG_PREFIX} ${d.id}: durationMs ${d.durationMs} outside recommended band 150–4000ms`);
      }
    }
    for (const layer of d.layers) validateLayer(layer, d.event, d.tier);
    if (d.sounds?.length) {
      for (const cue of d.sounds) {
        if (!validSounds.has(cue.sound)) {
          if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.warn(`${FX_DEBUG_PREFIX} ${d.id}: unknown sound key "${cue.sound}" (use SoundEvent from soundEvents.ts)`);
          }
        }
      }
    }
  }
}

validateDefinitions(getAllDefinitions());
