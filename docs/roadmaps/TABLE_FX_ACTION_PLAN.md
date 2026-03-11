# Table FX — MVP Action Plan

Action plan to stand up an MVP with fallbacks and placeholders, plus a solid design pass for **full config-driven stylish FX**. Ordered tasks; each step is shippable or clearly marked as placeholder.

---

## Baseline (already done)

- Event-driven request contract; overlay; collision rules; tier fallback.
- Procedural layers: FLASH, BURST, PARTICLES, RING, TEXT. ASSET stub.
- Registry with POT_WIN / ALL_IN / SHOWDOWN tiers 0–4; validation; sound cues scheduled from `definition.sounds`.
- Mapper: `mapPotWinTier`, `mapAllInTier`. Controller emits request with version, event, tier, payload.

---

## Milestone 1: Animation theme (single source of visual config)

**Goal:** One place that defines colors, sizes, and timing defaults so FX are fully config-driven. No hardcoded hex or magic numbers in layer components for “style.”

**Tasks:**

1. **Add `animationTheme.ts`** in `table/animations/`.
   - Export a **default palette**: e.g. `flash`, `burst`, `ring`, `particle`, `headline`, `headlineGlow`, `amountBg`, `amountText`. All as hex or rgba strings.
   - Export **default timing**: `flashDurationMs`, `burstScale`, `ringScale`, optional `opacityCurve` keys if we want [from, to] per layer type.
   - Export **text scale**: map `small | medium | large | xlarge` → font size (22, 28, 36, 48) so `TextLayer` reads from theme, not a local SIZE_MAP.
   - Optional: **per-event overrides** (e.g. `potWin: { ring: gold }`, `allIn: { burst: red }`) so one registry can drive multiple “skins.”

2. **Extend layer def types** (optional for MVP): allow `colorKey?: string` or `themeVariant?: string` on procedural layers so a definition can say “use all-in burst color” without new layer types. If time-boxed, skip and use a single default palette first.

**Fallback:** If theme is missing a key, layer components fall back to current hardcoded value. Theme is additive.

**Done when:** Theme file exists; at least one layer (e.g. RING or FLASH) reads its color from theme; no behavior change required for existing definitions.

---

## Milestone 2: Wire theme into all procedural layers

**Goal:** Every procedural layer (FLASH, BURST, PARTICLES, RING, TEXT) gets colors and sizes from the animation theme. Remove in-component hex and size constants.

**Tasks:**

1. **FLASH:** Accept optional `color?: string` prop; default from theme. Use in overlay: `theme.flash` (or per-event override).
2. **BURST:** Accept optional `color?: string`; default from theme. Ray stroke uses it.
3. **PARTICLES:** Accept optional `color?: string`; default from theme. Particle fill uses it.
4. **RING:** Accept optional `color?: string`, `strokeWidth?: number`; default from theme.
5. **TEXT:** Accept optional `headlineColor`, `glowColor`, `amountBg`, `amountText`; font sizes from theme text scale. Overlay passes theme (or resolved per-event) into each layer.

**Overlay:** Resolve theme once per request (e.g. `getAnimationTheme(request.event)` or default). Pass resolved theme (or specific keys) into each layer component. No theme = use current defaults inside components (fallback).

**Done when:** All five procedural layer components take style from props that are supplied from theme; swapping theme changes the look without editing layer code.

---

## Milestone 3: Sound cues on definitions (example + doc)

**Goal:** At least one definition uses `sounds` so we validate the pipeline; document authoring pattern.

**Tasks:**

1. **Add sounds to one definition** in `animationRegistry.ts`: e.g. POT_WIN tier 1 or 2 with `sounds: [{ sound: "table.potWin", delayMs: 0 }]`. Ensure `emitSoundEvent` is called (already implemented in overlay).
2. **Document** in TABLE_FX_ROADMAP or a short “Authoring definitions” section: how to add `sounds`, valid `sound` keys (SoundEvent list or link), and that embedded video audio is separate (ASSET `containsAudio`).

**Fallback:** If a cue’s `sound` is not in the sound registry, catch in overlay or in emitSoundEvent and no-op (no crash).

**Done when:** One definition has sounds and plays correctly; doc updated.

---

## Milestone 4: Design pass — default palette and hierarchy

**Goal:** One cohesive “stylish” default that feels intentional: clear hierarchy (headline > amount), readable contrast, and tier scaling that feels good (not jarring).

**Tasks:**

1. **Define default palette** in theme (design pass):
   - Flash: soft warm or neutral (e.g. rgba white/gold, low opacity).
   - Burst/ring: one accent (e.g. gold for wins, red for all-in) with consistent stroke/glow.
   - Particles: same accent or slightly lighter.
   - Headline: white + shadow or outline for legibility; glow color for high tiers.
   - Amount: dark bg + light text or inverse; matches app chip/money styling if possible.
2. **Tier scaling in theme (optional):** e.g. tier 0 = smaller text scale, tier 4 = larger + glow. Either in theme (tier → scale) or keep tier → definition → layer params (current). Prefer keeping tier in registry and theme as “defaults”; definition can still override.
3. **Duration curve:** Ensure total `durationMs` and per-layer `durationMs` / `delayMs` in registry feel snappy (not sluggish). Typical: 1.0–1.6 s total for mid tiers; 0.8–1.2 for low. Tweak in registry only.

**Done when:** Default theme is applied; one pass of “pot win” and “all-in” at 2–3 tiers looks and feels consistent and readable.

---

## Milestone 5: ASSET layer — graceful fallback and pipeline hook

**Goal:** ASSET layer never breaks the overlay; when source is missing or not yet implemented, fail gracefully. Prepare for real media later.

**Tasks:**

1. **Overlay:** When rendering ASSET layer, if `source` is empty or asset fails to load, render nothing (already safe if AssetLayer returns empty View). Optional: log in dev once so we know when we’re in “placeholder” mode.
2. **AssetLayer stub:** Keep current stub. Add a single optional prop, e.g. `onReady?: () => void` / `onEnd?: () => void`, so when we add real video/Lottie we can sync duration or completion without changing the overlay contract.
3. **Doc:** In TABLE_FX_ROADMAP or REUSABLE_LAYERS, state that ASSET is “placeholder until Phase 2”; definitions can include ASSET layers but source can be a placeholder URI that no-ops.

**Done when:** Adding an ASSET layer to a definition doesn’t break; stub is documented; hooks for Phase 2 are in place.

---

## Milestone 6: Definition authoring checklist and validation

**Goal:** Anyone can add or edit a definition confidently; validation catches mistakes early.

**Tasks:**

1. **Validation:** Already require ASSET `source` and TEXT `textRole`. Add: if `sounds` present, each `sound` must be a known SoundEvent (or log warning in dev). Optional: validate `durationMs` in band (e.g. 200–3000) per definition.
2. **Authoring checklist** (short doc or section in TABLE_FX_ROADMAP):
   - Copy an existing definition; change event/tier and id.
   - Layers in desired order (back → front).
   - TEXT layers have textRole; ASSET layers have source; sounds use valid keys.
   - Total duration and per-layer timing feel consistent with theme.
3. **ANIMATION_DEBUG:** Ensure toggling it logs definition id, layers, duration, and (if present) sounds, so we can verify config at runtime.

**Done when:** Checklist is written; validation runs at load; debug flag helps verify config.

---

## Order of execution (recommended)

| Order | Milestone | Depends on |
|-------|-----------|------------|
| 1 | **Milestone 1** — Animation theme | — |
| 2 | **Milestone 2** — Wire theme into layers | 1 |
| 3 | **Milestone 4** — Design pass (palette, hierarchy) | 2 |
| 4 | **Milestone 3** — Sound cues example + doc | — (already implemented) |
| 5 | **Milestone 5** — ASSET fallback and hooks | — |
| 6 | **Milestone 6** — Authoring checklist and validation | 1–5 |

Milestone 3 can be done in parallel with 1–2 (add one `sounds` definition and doc). Milestone 5 is independent. Milestone 6 last so it reflects the final config surface.

---

## MVP “done” criteria

- POT_WIN and ALL_IN run for tiers 0–4 with **no hardcoded colors or sizes** in layer components; all style from **animation theme**.
- At least one definition uses **sound cues** and plays correctly.
- **One design pass** applied: default palette and text hierarchy look intentional and readable.
- **ASSET** layers are safe (stub; no crash if source missing); hooks for future media are documented.
- **Authoring checklist** exists; validation and ANIMATION_DEBUG make config-driven FX easy to tune and extend.

---

## Post-MVP (out of scope for this plan)

- Real ASSET playback (Lottie / WebM); shared canvas for clips.
- SEAT / HERO anchor and layout.
- Per-event or per-tier theme variants (beyond a single default).
- Volume on SoundCue (if not already supported by emit path).
