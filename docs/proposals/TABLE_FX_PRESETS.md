# Table FX Presets — Recommendation

**Question:** Introduce reusable FX presets so definitions reference a preset name (e.g. SMALL_WIN, BIG_WIN) that expands to a layer stack, instead of spelling out layers in every definition?

**Verdict: Yes, with a minimal first step.** The mental model is right; the runtime stays unchanged; only registry authoring changes.

---

## Why it fits

1. **Duplication today** — Tier 2 across POT_WIN, ALL_IN, SHOWDOWN is almost the same (BURST, FLASH, TEXT; POT_WIN adds RING + amount). Tier 3 adds PARTICLES; tier 4 is “max stack” with event-specific extras (ALL_IN: STREAK, second PARTICLES with originOffsetY). So there is a repeated “intensity ladder” with small per-event differences.

2. **Single place to tune** — Changing “what tier 3 looks like” today means editing three configs. With presets, one preset (e.g. `TIER_3` or `BIG_WIN`) drives all events that use it; global tuning in one place.

3. **Runtime unchanged** — Presets are an authoring concern. At registry build time, “definition with preset + overrides” is expanded to a full definition with a `layers` array. The pipeline event → request → definition → overlay → layers is unchanged; only how definitions are built changes.

4. **Designer-friendly** — Non-devs can think in terms of “use BIG_WIN preset, longer duration” instead of editing raw layer arrays. Future tooling (e.g. a config UI) can expose preset names and overrides.

---

## Minimal design

- **Presets** = a named layer stack: `Record<PresetName, AnimationLayerDefinition[]>` (or a function that returns layers). Example: `TIER_0`, `TIER_1`, … `TIER_4` or semantic names `MINIMAL`, `SMALL_WIN`, `MEDIUM_WIN`, `BIG_WIN`, `MAX`.
- **Definition authoring** = reference preset + overrides:
  - `preset: "BIG_WIN"`
  - `durationMs`, `sounds` (per-definition as now)
  - Optional: `appendLayers` (e.g. ALL_IN tier 4 appends the headline-origin PARTICLES + amount TEXT) or `layerOverrides` (replace/merge specific indices) so event-specific bits don’t require a new preset per edge case.
- **Expansion** = one place (e.g. in `shared.ts` or a small `presets.ts`): `resolveDefinition(presetRef, overrides) => full TableAnimationDefinition` with `layers = [...presetLayers, ...(overrides.appendLayers ?? [])]`. Tier builders then call `def(event, tier, durationMs, resolveLayers(preset, appendLayers), sounds)` instead of inlining layer arrays.

**Don’t over-engineer v1:** No preset parameters (e.g. `preset("BIG_WIN", { particleCount: 16 })`) yet. Start with preset = name → layers; definition = preset + durationMs + sounds + optional appendLayers. Params can be added later if we need them.

---

## Caveat

Some definitions are genuinely one-off (e.g. ALL_IN tier 4: STREAK + second PARTICLES with originOffsetY + amount). Presets still help for the “base” stack; `appendLayers` (or a single “ALL_IN_TIER_4” preset) covers the rest. So we keep flexibility without forcing every definition into a preset that doesn’t quite fit.

---

## Summary

- **Adopt the preset mental model:** definitions reference reusable presets; presets expand to layer stacks at build time.
- **Keep the runtime as-is:** overlay, renderer, channels, themes, sound unchanged.
- **Implement minimally:** presets map (name → layers), expand in registry build; allow per-definition durationMs, sounds, and appendLayers (or one-off preset names) for edge cases.
- **Iterate later:** preset params and fancier overrides only if authoring pain justifies them.

This improves flexibility, reusability, and iteration speed without touching the engine.

---

## Implemented (current)

- **presets.ts:** `PRESETS` map (TIER_0..TIER_4, ALL_IN_TIER_4, POT_TIER_0..POT_TIER_4); `getPresetLayers(name, appendLayers?)`.
- **shared.ts:** `defFromPreset(event, tier, presetName, durationMs, options?: { sounds?, appendLayers? })` expands preset to layers and returns full definition.
- **showdown.ts:** Uses TIER_0..TIER_4 + per-tier duration; no inline layer arrays.
- **allIn.ts:** Uses TIER_0..TIER_3 and ALL_IN_TIER_4 for tier 4; per-tier duration.
- **potWin.ts:** Uses POT_TIER_0..POT_TIER_4 + sounds for tier 1+; per-tier duration.

Runtime (overlay, renderer, channels, themes) unchanged. Tuning a tier’s look is now done in one preset.

---

## Optional later: generic vs event presets

Right now presets mix generic (TIER_0..4) and event-specific (POT_TIER_0..4, ALL_IN_TIER_4). Cleaner separation would be:

- **presets/basePresets.ts** — generic only (TIER_0..4).
- **presets/potWinPresets.ts** — POT_TIER_0..4 (or build from base + RING/amount).
- **presets/allInPresets.ts** — ALL_IN_TIER_4 (or tier 4 append).

Not urgent; current single-file presets are fine. Refactor when adding more events or FX moments.

---

## Visual tuning: ALL_IN tier 2–3 rays

After presets, ALL_IN tier 2 uses TIER_2 (rays: 8) and tier 3 uses TIER_3 (rays: 12). Previously they were 6 and 10. **Decision:** accept the new visuals (Option A). No override layer-params in presets for now.

---

## What this unlocks

- **FX moments** — e.g. SMALL_WIN, BIG_WIN, JACKPOT, ALL_IN_DRAMA as preset names; definitions reference them without rewriting stacks.
- **Global tuning** — change TIER_3 (or one event preset) and all animations that use it update.
- **Asset layers later** — when VIDEO/LOTTIE/SPRITE exist, presets can mix them with procedural layers.

---

## Status

No further architectural changes needed right now. Next useful steps when ready: ASSET playback, seat anchor wiring; reducedMotion is already implemented.
