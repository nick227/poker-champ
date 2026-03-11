# Table FX System — Summary for Developers & Designers

One-page overview of the table animation system: what exists today and where to propose changes.

---

## What It Is

Event-driven table animations (pot win, all-in, showdown) with **tiers** (0–4) for intensity. Definitions are **data-driven** (registry keyed by event + tier). **Procedural layers** (flash, burst, particles, ring, text) are implemented; **ASSET** (Lottie/WebM) is defined but playback is placeholder. One animation per **channel** at a time; TABLE, SEAT, HERO, GLOBAL can run in parallel.

---

## Inventory (Current State)

### Events & Tiers

| Event     | Tiers | Notes                          |
|----------|-------|---------------------------------|
| POT_WIN  | 0–4   | Headline + amount; sound on 1+  |
| ALL_IN   | 0–4   | Headline; amount on tier 4      |
| SHOWDOWN | 0–4   | Headline only                   |

**Lookup:** Request `(event, tier)` → exact match or **closest lower tier**; no match → no animation.

### Layer Types

| Type      | Status   | Description                          |
|-----------|----------|--------------------------------------|
| FLASH     | Done     | Screen flash / background glow       |
| BURST     | Done     | Radial rays                          |
| PARTICLES | Done     | Spark / chip particles               |
| RING      | Done     | Expanding ring / halo                |
| TEXT      | Done     | Headline or amount (from payload)    |
| ASSET     | Placeholder | Video / Lottie / sprite (no playback yet) |

Render order = array order (back to front). TEXT does not render if payload value is missing.

### Code Layout

```
apps/client/src/features/table/animations/
  animationTypes.ts      # Events, channels, anchors, layer types, request/definition types
  animationConstants.ts  # Default headlines, durations, validation messages, text roles
  animationTheme.ts      # Single default palette + timing + text scale
  animationRegistry/     # Event-grouped registry + tier builders
    shared.ts            # def(), defFromPreset(), buildDefinitionId(), DEFAULT_LAYER_PARAMS
    presets.ts           # PRESETS (TIER_0..4, ALL_IN_TIER_4, POT_TIER_0..4), getPresetLayers()
    potWin.ts            # buildPotWinTier(tier), POT_WIN_TIERS
    allIn.ts             # buildAllInTier(tier), ALL_IN_TIERS
    showdown.ts          # buildShowdownTier(tier), SHOWDOWN_TIERS
    index.ts             # TABLE_ANIMATIONS[event], resolveAnimation, validateDefinitions
  animationMapper.ts     # mapPotWinTier, mapAllInTier (context → tier)
  TableAnimationOverlay.tsx
  renderAnimationLayer.tsx   # Layer-type switch → component
  layers/
    AnimationLayerFlash.tsx
    AnimationLayerBurst.tsx
    AnimationLayerParticles.tsx
    AnimationLayerRing.tsx
    TextLayer.tsx
    AssetLayer.tsx           # Placeholder (no media playback)
```

**Registry:** `TABLE_ANIMATIONS` is `Record<event, Definition[]>` (tiers 0–4 per event). Tier builders (`buildPotWinTier`, etc.) centralize per-event structure; adding an event = new file + one entry in `animationRegistry/index.ts`.

**Public API:** `table/animations/index.ts` exports overlay, resolver, mapper, types, constants, `renderAnimationLayer`, `getPreloadSources`, `buildDefinitionId`.

### Definitions and presets

- **15 definitions** (3 events × 5 tiers). All use channel TABLE, anchor TABLE_CENTER.
- **Presets:** Tier builders reference reusable presets (TIER_0..TIER_4, ALL_IN_TIER_4, POT_TIER_0..POT_TIER_4). `defFromPreset` expands preset → layers at build time; runtime unchanged. See `animationRegistry/presets.ts` and TABLE_FX_PRESETS.md.
- **IDs:** `POT_WIN_TIER_0` … `SHOWDOWN_TIER_4` (from `buildDefinitionId(event, tier)`).
- **Sound:** POT_WIN tier 1+ uses `table.potWin` cue; others optional per def.
- **Validation** at import: unique (event, tier), non-empty layers, durationMs > 0, TEXT role, ASSET source.

### Theme

- **Single default theme** in `animationTheme.ts`: palette (flash, burst, ring, particle, headline, headlineGlow, amountBg, amountText), timing (flashDurationMs, burstScale, ringScale), textScale (small → xlarge).
- **No per-event or per-tier overrides yet.** `getAnimationTheme(event)` returns the default.

### Motion & polish

- **Shared easing** in `animationEasing.ts`: `EASING_OPACITY_IN` / `EASING_OPACITY_OUT` (cubic), `EASING_SCALE` (out cubic), `EASING_OPACITY_IN_SOFT` (ambient layers). All layers use these so motion feels consistent.
- **Hold at peak:** `HOLD_AT_PEAK_FRACTION` (6% of duration) — Flash and Ring hold full opacity briefly before fading so the hit reads; then fade-out uses the shared out curve for a soft tail.

### Settings & Debug

- **AnimationSettings:** `enabled` (kill switch), `reducedMotion` (cap tier to 1, skip PARTICLES/STREAK layers).
- **ANIMATION_DEBUG:** when true, logs instance id (e.g. `fx#104`) and definition id for collision tracing.

### Trigger matrix

| Event   | Trigger (current)                    | Payload used              | Companions / notes                          |
|---------|--------------------------------------|---------------------------|---------------------------------------------|
| POT_WIN | Hand result (useTablePageController) | headline, amountCents, potCents | —                                       |
| ALL_IN  | lastAction === ALL_IN                | headline, amountCents, potCents | HERO when `payload.isHero` and tier ≥ 3 |
| SHOWDOWN| Not triggered (no effect in controller) | —                    | SEAT when `payload.anchorSeat` set          |

**Companions:** Hero aura runs on HERO channel when ALL_IN request has `payload.isHero === true`. Seat glow runs on SEAT channel when SHOWDOWN request has `payload.anchorSeat`. Both require the host to pass `anchorBounds` for positioned rendering.

---

## Where to Propose Changes

### Backlog (from roadmap)

Planned but not implemented; see **TABLE_FX_ROADMAP.md** § “Backlog, maintainability, and time-to-market”:

- **ASSET:** Real Lottie/WebM playback, shared canvas, preload wired to loader.
- **Layout:** SEAT anchor (position from `payload.anchorSeat` + table layout); HERO anchor.
- **Theme:** Per-event or per-tier overrides; optional `colorKey` / `themeVariant` on layers.
- **Sound:** Wire `volume` through to playback where supported.
- **Debug:** On-screen overlay (channel, layer stack, remaining time).
- **Naming:** Optional `fxTheme` / `getFxTheme` to distinguish from UI themes.

### Future proposals

- **New ideas:** Add a short proposal under `docs/proposals/` (e.g. `TABLE_ANIMATION_*.md`) and link it from this section or from TABLE_FX_ROADMAP.md “Related docs”.
- **New event:** Add `animationRegistry/<event>.ts` with `build<Event>Tier(tier)` and `<EVENT>_TIERS`; add one key to `TABLE_ANIMATIONS` in `animationRegistry/index.ts`; extend `TableAnimationEvent` and mapper; no overlay change.
- **New procedural layer:** Add type, component in `layers/`, case in `renderAnimationLayer.tsx`; optional theme keys.
- **Designer assets:** Prefab list and naming conventions live in TABLE_ANIMATION_CONTROLS_AND_ASSETS.md; asset pipeline and ASSET wiring in roadmap Phase 2.

---

## Related Docs

| Doc | Purpose |
|-----|---------|
| [TABLE_FX_ROADMAP.md](./TABLE_FX_ROADMAP.md) | Full spec: concepts, layers, audio, layout, backlog, maintainability, TtM. |
| [TABLE_FX_ACTION_PLAN.md](./TABLE_FX_ACTION_PLAN.md) | MVP task list and order. |
| [TABLE_FX_OPTIMIZATION_ANALYSIS.md](./TABLE_FX_OPTIMIZATION_ANALYSIS.md) | Data paths, allocations, optimizations. |
| [TABLE_ANIMATION_SYSTEM.md](../proposals/TABLE_ANIMATION_SYSTEM.md) | Contract, collision, anchors. |
| [TABLE_ANIMATION_DEFINITIONS.md](../proposals/TABLE_ANIMATION_DEFINITIONS.md) | Registry, lookup, validation. |
| [TABLE_ANIMATION_CONTROLS_AND_ASSETS.md](../proposals/TABLE_ANIMATION_CONTROLS_AND_ASSETS.md) | Designer controls and asset list. |
| [TABLE_FX_PRO_DESIGN.md](../proposals/TABLE_FX_PRO_DESIGN.md) | Pro design plan: zones, config levers, per-event look, layer upgrades. |
| [TABLE_FX_PRO_DESIGN_TASKS.md](./TABLE_FX_PRO_DESIGN_TASKS.md) | High-level task list to implement pro design (phases A–G). |
| [TABLE_FX_DESIGN_PASS.md](../proposals/TABLE_FX_DESIGN_PASS.md) | Design pass: critiques, easing, theme timing, headline/glow tweaks. |
| [TABLE_FX_CODE_QUALITY_REVIEW.md](../proposals/TABLE_FX_CODE_QUALITY_REVIEW.md) | Code quality: performance, consistency, theme cache, overlay deps. |
| [TABLE_FX_STAGING_CHECKLIST.md](./TABLE_FX_STAGING_CHECKLIST.md) | Pre-push verification and staging smoke test. |
| [TABLE_FX_FINAL_REVIEW.md](./TABLE_FX_FINAL_REVIEW.md) | Final review: correctness, integration, risks, verification. |
