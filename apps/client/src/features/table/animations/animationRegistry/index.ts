/**
 * Animation registry build pipeline.
 *
 * Responsibilities:
 * - define the canonical event→tier definitions
 * - validate at startup (fail fast in dev/CI)
 * - build O(1) lookup indexes for runtime
 * - freeze configs to prevent accidental mutation
 *
 * Build pipeline:
 * base definitions
 *   → expand companions
 *   → validate
 *   → freeze
 *   → build lookup indexes
 */

// Imports
import type {
  TableAnimationDefinition,
  TableAnimationEvent,
  TableAnimationRequest,
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
import { getHeroAuraDefinition, HERO_AURA_ALL_IN } from "./heroAura";
import { getSeatGlowDefinition, SEAT_GLOW_SHOWDOWN } from "./seatGlow";

// Constants
/** Event-grouped registry. Tiers 0–4 per event. Resolver uses fallback to closest lower tier. */
export const TABLE_ANIMATIONS: Record<TableAnimationEvent, TableAnimationDefinition[]> = {
  POT_WIN: POT_WIN_TIERS,
  ALL_IN: ALL_IN_TIERS,
  SHOWDOWN: SHOWDOWN_TIERS,
};

export { buildDefinitionId, DEFAULT_LAYER_PARAMS, type PreloadSource };
export { resolveLayerWithPreset, LAYER_PRESETS, type LayerPresetDefaults } from "./layerPresets";

// Helpers
function getAllDefinitions(): TableAnimationDefinition[] {
  return (Object.values(TABLE_ANIMATIONS) as TableAnimationDefinition[][]).flat();
}

function buildTierIndex(
  tableAnimations: Record<TableAnimationEvent, TableAnimationDefinition[]>
): Map<TableAnimationEvent, Map<number, TableAnimationDefinition>> {
  const out = new Map<TableAnimationEvent, Map<number, TableAnimationDefinition>>();
  for (const event of Object.keys(tableAnimations) as TableAnimationEvent[]) {
    const tierMap = new Map<number, TableAnimationDefinition>();
    for (const d of tableAnimations[event]) tierMap.set(d.tier, d);
    out.set(event, tierMap);
  }
  return out;
}

function buildPreloadSources(definitions: TableAnimationDefinition[]): PreloadSource[] {
  const out: PreloadSource[] = [];
  const seen = new Set<string>();
  for (const d of definitions) {
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

function freezeDefinitions(defs: TableAnimationDefinition[]): void {
  Object.freeze(defs);
  for (const def of defs) {
    Object.freeze(def.layers);
    for (const layer of def.layers) Object.freeze(layer);
    Object.freeze(def);
  }
}

// Build step (module init)
const ALL_DEFINITIONS = getAllDefinitions();
const BY_EVENT_TIER = buildTierIndex(TABLE_ANIMATIONS);
const PRELOAD_SOURCES = buildPreloadSources(ALL_DEFINITIONS);

validateDefinitions(ALL_DEFINITIONS);
validateCompanionDefinitions([HERO_AURA_ALL_IN, SEAT_GLOW_SHOWDOWN]);
freezeDefinitions(ALL_DEFINITIONS);
freezeDefinitions([HERO_AURA_ALL_IN, SEAT_GLOW_SHOWDOWN]);

// Public API
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

export type ResolvedCompanions = {
  table: TableAnimationDefinition | undefined;
  hero: TableAnimationDefinition | undefined;
  seat: TableAnimationDefinition | undefined;
};

/** Resolve TABLE definition plus optional HERO and SEAT companions from one request. */
export function resolveAnimationWithCompanions(
  request: TableAnimationRequest
): ResolvedCompanions {
  const table = resolveAnimation(request.event, request.tier);
  const hero = getHeroAuraDefinition(
    request.event,
    request.tier,
    request.payload
  );
  const seat = getSeatGlowDefinition(request.event, request.payload);
  return { table, hero, seat };
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
            throw new Error(`${FX_DEBUG_PREFIX} ${d.id}: invalid sound key "${cue.sound}" (must be in SOUND_EVENT_MAP)`);
          }
        }
      }
    }
  }
}

function validateCompanionDefinitions(definitions: TableAnimationDefinition[]): void {
  const validSounds = new Set(Object.keys(SOUND_EVENT_MAP));
  for (const d of definitions) {
    if (d.layers.length === 0) throw new Error(`Animation ${d.id}: ${ERROR_EMPTY_LAYERS}`);
    if (d.durationMs <= 0) throw new Error(`Animation ${d.id}: ${ERROR_DURATION_POSITIVE}`);
    for (const layer of d.layers) validateLayer(layer, d.event, d.tier);
    if (d.sounds?.length) {
      for (const cue of d.sounds) {
        if (!validSounds.has(cue.sound) && typeof __DEV__ !== "undefined" && __DEV__) {
          throw new Error(`${FX_DEBUG_PREFIX} ${d.id}: invalid sound key "${cue.sound}"`);
        }
      }
    }
  }
}

// Dev / debug
// (validation + freeze already run at module init above)
