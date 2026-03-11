# Table FX Roadmap

Purpose: Define a flexible table animation system for Poker Champ supporting procedural effects, Lottie, and transparent video assets with synchronized sound.

---

## 1. Goals

- Event-driven table animations triggered by game events (e.g. POT_WIN, ALL_IN, SHOWDOWN).
- Scalable intensity via tiers (0–4).
- Multi-layer composition with dynamic UI content.
- Support both procedural animations and prefab assets (Lottie / WebM).
- Encapsulate visual + audio behavior inside animation definitions.
- Keep runtime lightweight and mobile-friendly.

---

## 2. Core Concepts

### Animation Event

- Enum identifying animation trigger.
- Examples: POT_WIN, ALL_IN, SHOWDOWN.

### Animation Request

- Emitted by controller when an event occurs.

```ts
{
  version?: 1
  event: TableAnimationEvent
  tier: 0 | 1 | 2 | 3 | 4
  payload?: {
    headline?: string
    amountCents?: number
    potCents?: number
    anchorSeat?: number
  }
}
```

### Animation Definition

- Data-driven description of visuals and sounds.
- **Definitions are uniquely keyed by `(event, tier)`.** The registry must enforce uniqueness; duplicate (event, tier) causes validation failure.

```ts
{
  id: string
  event: TableAnimationEvent
  tier: number
  channel: "TABLE" | "SEAT" | "HERO" | "GLOBAL"
  anchor: "TABLE_CENTER" | "HERO" | "SEAT"
  durationMs: number
  layers: AnimationLayer[]
  sounds?: SoundCue[]
}
```

### Definition resolution (lookup contract)

Resolution is part of the spec; runtime must follow:

1. **Match** `(event, tier)` in the registry.
2. **If not found** → fallback to **closest lower tier** for that event (e.g. tier 4 requested, 4 missing → try 3, then 2, …).
3. **If none found** → **no animation** (overlay does not render; no error).

Devs must not assume strict matching; fallback is normative.

### Animation channels

Animations only compete **within the same channel**. Different channels run **concurrently**.

| Channel | Meaning |
|---------|---------|
| **TABLE** | Table-center effects (pot win, all-in, showdown). |
| **SEAT** | Seat-local effects (e.g. player bust). |
| **HERO** | Hero-specific UI (e.g. hero win glow). |
| **GLOBAL** | Rare full-screen events. |

**Collision rule:** At most **one animation per channel** at a time. If an incoming request has the **same channel** as a running animation: higher tier replaces lower tier; otherwise ignore. If **different channel**: run concurrently. So TABLE (pot win) and SEAT (player bust) can play together.

---

## 3. Layer Types

| Type | Description |
|------|-------------|
| **FLASH** | Screen flash or background glow. |
| **BURST** | Radial rays or burst effect. |
| **PARTICLES** | Spark or chip particle emission. |
| **RING** | Expanding ring / halo effect. |
| **TEXT** | Dynamic text rendered from payload. Roles: headline \| amount. |
| **ASSET** | External media layer (video, Lottie, sprite). *(Optional alias: MEDIA.)* |

### TEXT layer — rendering behavior

- **headline** → display `payload.headline`. If missing → **TEXT layer does not render** (no blank UI).
- **amount** → display formatted `payload.amountCents` (e.g. `$123.45`). If `payload.amountCents` is missing/undefined → **TEXT layer does not render**.

So TEXT layers are conditional on payload; overlay skips rendering that layer when the value is missing.

### ASSET layer

```ts
{
  type: "ASSET"
  assetType: "VIDEO" | "LOTTIE" | "SPRITE"
  source: string
  variant?: string          // optional; theme resolves e.g. coin_burst.gold.webm
  containsAudio?: boolean
  delayMs?: number
  durationMs?: number        // if undefined → use asset intrinsic duration
  preload?: boolean         // when true, overlay can warm asset on mount to avoid first-play hitch
}
```

**ASSET timing rule:** If `durationMs` is **undefined** → use the asset’s **intrinsic duration**. If **defined** → use it (overlay/player trims or stretches as needed). So definition wins when provided; otherwise asset drives length.

Rendering order = layer array order.

---

## 4. Audio Model

Two sound mechanisms supported.

### Embedded Audio

- Used when video asset includes sound.
- `containsAudio: true` on ASSET layer; playback tied to video.

### Sound Cues

- Used for procedural or silent assets.
- Defined on the **definition** (not per layer). Optional `volume` supports tier intensity (e.g. tier1 quiet, tier4 louder) when the sound layer supports it.

```ts
type SoundCue = {
  sound: string    // key into AudioService / sound registry
  delayMs?: number
  volume?: number  // optional; for tier intensity when supported
}
```

Playback delegated to global AudioService (or existing sound registry). Overlay schedules cues when the animation starts.

**Authoring sound cues:** Add a `sounds` array to a definition, e.g. `sounds: [{ sound: "table.potWin", delayMs: 0 }]`. The `sound` value must be a valid **SoundEvent** (see `apps/client/src/sound/soundEvents.ts` for the full list; table FX typically use `table.potWin`, `table.handReveal`, etc.). If a cue’s `sound` is not in the sound registry, the overlay no-ops that cue (no crash). Embedded video audio is separate: use ASSET `containsAudio: true` for in-asset sound.

---

## 5. Layout

### Default layout: TABLE_CENTER

Layer stack example (back → front):

1. FLASH  
2. ASSET / BURST  
3. PARTICLES  
4. RING  
5. TEXT (headline)  
6. TEXT (amount)  

### Future layouts

- **SEAT** — e.g. player bust; effect anchored to seat position. **Overlay is responsible for resolving anchor position** from `payload.anchorSeat` using table layout (e.g. seat bounds or center).
- **HERO** — hero-only effects (e.g. hero win glow).

---

## 6. Asset Strategy

System supports three asset types:

| Type | Use |
|------|-----|
| **Procedural** | Implemented with React Native Animated; no external file. |
| **Lottie** | Vector motion graphics; JSON source. |
| **Video (WebM with alpha)** | Cinematic effects (e.g. coin explosion). |

**Design guidelines for assets:**

- Use transparent background.
- Keep center safe area for dynamic text (headline / amount).
- Duration: 0.8–1.6 seconds for prefab clips.

---

## 7. Tier Scaling

| Tier | Typical content |
|------|------------------|
| **0** | Minimal: ring + text. |
| **1** | Flash + text. |
| **2** | Burst + flash + text. |
| **3** | Asset burst + particles + text. |
| **4** | Full stack; larger visuals; stronger audio. |

Tier is chosen by mapper from context (pot size, hand strength, etc.); definitions are keyed by event + tier.

**Default palette and hierarchy:** A single default palette and text scale live in `animationTheme.ts` (flash, burst, ring, particle, headline, headlineGlow, amountBg, amountText; text scale small → xlarge). All procedural layers read from the theme; headline is primary (white + shadow/glow), amount is secondary (contrast bg + light text). Swapping the theme changes the look without editing layer code.

---

## 8. Runtime Behavior

### Animation lifetime

- **Animation starts** when overlay resolves a definition (after lookup and fallback).
- **Animation ends** when **definition’s `durationMs`** expires; overlay then **clears layers** and cleans up (timeouts, sound cues, asset playback).
- Prevents dangling layers: one timer per animation; on expiry, clear that channel’s stack.

### Step sequence

1. Overlay receives animation request.
2. **Resolve** definition from registry per **definition resolution** rule (match → fallback to closest lower tier → else no animation).
3. **Channel:** If same channel has an active animation, apply collision (higher tier replaces). If different channel, run concurrently.
4. **Render** layers in order (procedural or ASSET). TEXT layers with missing payload value do not render.
5. **Schedule** sound cues from definition.
6. **Play** asset media when ASSET layer is active (respect `containsAudio` for embedded sound).

### ASSET preloading

**ASSET sources should be preloaded or cached by the overlay before first playback.** Otherwise video and Lottie will stutter on first play. Overlay (or a dedicated loader) preloads by `source` (and optional `variant`) when the app or table mounts, or on first use with cache.

### Collision rule (per channel)

- At most **one animation per channel** at a time.
- **Same channel:** If no animation running → run incoming. If running and **incoming tier > current tier** → replace. Otherwise → ignore.
- **Different channel:** Run **concurrently** (e.g. TABLE + SEAT both active).

### Settings

- Overlay respects `AnimationSettings.enabled` (kill switch) and optional `reducedMotion`.

---

## 9. Implementation Structure

```
table/animations/
  animationTypes.ts
  animationRegistry/           # Event-grouped registry + tier builders
    shared.ts                  # def(), buildDefinitionId(), DEFAULT_LAYER_PARAMS
    potWin.ts                  # buildPotWinTier(tier), POT_WIN_TIERS
    allIn.ts
    showdown.ts
    index.ts                   # TABLE_ANIMATIONS[event], resolveAnimation, validation
  animationMapper.ts
  TableAnimationOverlay.tsx
  layers/
    FlashLayer.tsx
    BurstLayer.tsx
    ParticleLayer.tsx
    RingLayer.tsx
    TextLayer.tsx
    AssetLayer.tsx      # VIDEO | LOTTIE | SPRITE
```

**Registry structure:** Definitions are grouped by event; each event has a tier builder (e.g. `buildPotWinTier(tier)`) and exports an array of tiers 0–4. `TABLE_ANIMATIONS` is `Record<event, Definition[]>`; resolver stays `resolveAnimation(event, tier)` with fallback. Adding a new event = new file + one entry in registry index.

AssetLayer: single playback surface for ASSET layers where possible (swap source by layer); preload/cache by source. **ASSET is a placeholder until Phase 2:** definitions can include ASSET layers with a placeholder or real `source`; when source is empty or not yet implemented, the layer renders nothing and does not crash. Optional `onReady` / `onEnd` props support Phase 2 media sync.

---

## 9b. Definition validation

Basic validation rules (run at registry load or startup):

- **`(event, tier)` unique** — no duplicate keys.
- **`layers` array must not be empty.**
- **`durationMs` > 0.**
- **TEXT layers** — `textRole` must be present and valid (`headline` \| `amount`).
- **ASSET layers** — `source` must be defined (non-empty).

Prevents broken animations. See implementation in `animationRegistry.ts` (`validateDefinitions`). In dev, unknown `sounds[].sound` keys log a warning; `durationMs` outside **150–4000 ms** (recommended band) logs a warning so jackpots/long effects are still allowed.

**Authoring checklist:** (1) Copy an existing definition; change `event`, `tier`, and `id`. (2) Order layers back → front (array order). (3) TEXT layers need `textRole`; ASSET layers need `source`; `sounds` entries must use valid SoundEvent keys (see `soundEvents.ts`). (4) Keep total and per-layer timing consistent with theme. (5) Toggle `ANIMATION_DEBUG` to verify definition id, layers, duration, and sounds at runtime.

---

## 10. Initial Milestones

| Phase | Scope |
|-------|--------|
| **Phase 1** | Implement procedural POT_WIN tiers 0–2. *(Current: 0–4 done.)* |
| **Phase 2** | Add ASSET layer and WebM support (transparent video). |
| **Phase 3** | Integrate sound cues (definition.sounds → AudioService). |
| **Phase 4** | Introduce designer assets (Lottie / video) into registry. |
| **Phase 5** | Add SEAT-anchor animations (e.g. player bust). |

**Result:** Flexible, data-driven FX system supporting both runtime and prefab animations without changing core logic.

---

## Action plan (MVP + design pass)

Concrete tasks, fallbacks, and order: [TABLE_FX_ACTION_PLAN.md](./TABLE_FX_ACTION_PLAN.md).

**Loop, memory, and control-flow:** [TABLE_FX_OPTIMIZATION_ANALYSIS.md](./TABLE_FX_OPTIMIZATION_ANALYSIS.md) — traversals, allocations, applied optimizations (precomputed preload, single theme path, single-pass lifecycle), and future options.

**Developer experience:** Magic strings and overloaded logic are reduced via:
- **animationConstants.ts** — `FX_DEBUG_PREFIX`, `DEFAULT_HEADLINES`, `LAYER_DURATION_DEFAULT_MS`, `ASSET_DURATION_DEFAULT_MS`, `TEXT_ROLE_*`, `TEXT_SIZE_DEFAULT`, validation `ERROR_*` messages.
- **animationTypes.ts** — `FX_EVENT`, `FX_CHANNEL`, `FX_ANCHOR` for event/channel/anchor literals; use in registry and tests.
- **Registry** — `buildDefinitionId(event, tier)`; defs use `FX_EVENT.*`, `FX_CHANNEL.TABLE`, `FX_ANCHOR.TABLE_CENTER`; validation uses shared error constants.
- **renderAnimationLayer.tsx** — Layer-type switch and default durations moved out of the overlay; overlay focuses on state and lifecycle.
- **Mapper** — `BIG_BET_CENTS_THRESHOLD` exported for tuning and tests.
- **TextLayer** — Named constants for fallback colors and layout (e.g. `AMOUNT_FONT_SIZE_DEFAULT`, `GLOW_TEXT_SHADOW_RADIUS`).

**Final review (cleanup):** Registry uses only needed validation/prefix constants (unused `DEFAULT_CHANNEL`/`DEFAULT_ANCHOR` imports removed). Overlay consolidates type imports; `onPreloadAssets` typed as `(sources: PreloadSource[]) => void`. Layer renderer uses `TEXT_ROLE_AMOUNT` for amount role. Typecheck and full client test suite passing.

---

## Implementation notes

- **Theme:** `AnimationTheme` has a `version` field (e.g. `1`) so new palette/timing fields can be added safely. `getAnimationTheme(event)` returns the default theme (no cache until per-event overrides exist).
- **Debug:** When `ANIMATION_DEBUG` is true, logs include an **instance id** (e.g. `fx#104`) per animation start to trace collisions and race conditions.
- **Preload:** ASSET layers with `preload: true` are collected by `getPreloadSources()`; the overlay calls optional `onPreloadAssets(sources)` on mount so the app can warm assets before first playback.
- **Future:** An on-screen debug overlay (current channel, layer stack, remaining time) could build on `ANIMATION_DEBUG`. Naming: `fxTheme` / `getFxTheme` can be used later to distinguish from UI themes.

---

## Backlog, maintainability, and time-to-market

### Still on the todo / wishlist

| Area | Item | Source |
|------|------|--------|
| **ASSET** | Real playback (Lottie / WebM); shared canvas for clips; preload wired to loader | Roadmap Phase 2, Action plan post-MVP |
| **Layout** | SEAT anchor: overlay resolves position from `payload.anchorSeat` + table layout | Roadmap §5, Phase 5 |
| **Layout** | HERO anchor and hero-only effects | Roadmap §5 |
| **Theme** | Per-event or per-tier theme overrides (e.g. potWin ring gold, allIn burst red) | Action plan M1 optional, Optimization “per-event overrides” |
| **Theme** | `colorKey` / `themeVariant` on procedural layers (optional) | Action plan M1 |
| **Sound** | Wire `SoundEventMeta.volume` through to playback when sound layer supports it | Types exist; playSound does not use volume yet |
| **Debug** | On-screen debug overlay (channel, layer stack, remaining time) | Roadmap Implementation notes |
| **Naming** | Optional `fxTheme` / `getFxTheme` to distinguish from UI themes | Roadmap Implementation notes |

MVP action plan milestones 1–6 are **done**. Post-MVP and Phase 2+ items above are the remaining backlog.

### Maintainability

- **Event-grouped registry:** Definitions live in `animationRegistry/<event>.ts`; each event has a tier builder and exports tiers 0–4. `TABLE_ANIMATIONS` is keyed by event; new event = new file + one entry in `animationRegistry/index.ts`. Use `def()` and `FX_EVENT.*` in builders.
- **Constants over literals:** Use `animationConstants.ts` and `FX_EVENT` / `FX_CHANNEL` / `FX_ANCHOR` so renames and new values are type-safe and grep-friendly.
- **Layer renderer isolated:** `renderAnimationLayer.tsx` owns the layer-type switch; new layer types = one new case + one new component in `layers/`.
- **Validation at load:** `validateDefinitions(TABLE_ANIMATIONS)` runs at import; broken defs fail fast with clear error constants.
- **Authoring checklist:** Roadmap §9b documents copy-def, layer order, TEXT/ASSET/sounds rules, and ANIMATION_DEBUG. Keep it updated when you add layer types or validation.
- **Docs in one place:** Roadmap = spec + structure; action plan = MVP steps; optimization doc = data paths and allocations. Link from roadmap; avoid scattering FX decisions elsewhere.

### Reducing time-to-market for future features

- **New event:** Add to `TableAnimationEvent` and `FX_EVENT`; add `def(FX_EVENT.NEW_EVENT, tier, ...)` entries; add mapper if tier is context-driven; add default headline in `DEFAULT_HEADLINES`. No overlay changes.
- **New tier:** Add more `def(event, newTier, ...)`; resolution fallback already supports any tier 0–4. Optional: extend mapper to return the new tier.
- **New procedural layer type:** Add type in `animationTypes`; implement component in `layers/`; add case in `renderAnimationLayer`; wire theme if needed. Overlay unchanged.
- **SEAT / HERO layout:** Implement anchor resolution (payload + layout → position); overlay renders one stack per channel and positions by anchor. Contract already has `anchor` and `payload.anchorSeat`.
- **Real ASSET playback:** Implement in `AssetLayer` (or dedicated player); keep `onReady` / `onEnd`; wire `onPreloadAssets` to a real preloader. Definition shape and overlay API stay the same.
- **Per-event theme:** In `getAnimationTheme(event)` return overrides when present else default; optionally reintroduce a small cache keyed by event. Theme version and palette shape already support it.

Keeping definitions data-driven, the overlay generic, and the layer switch in one file keeps most new work to “add data + optional mapper + optional layer,” without refactoring the pipeline.

---

## Related docs

- [TABLE_FX_SUMMARY.md](./TABLE_FX_SUMMARY.md) — One-page summary for developers and designers (inventory + future proposals).
- [TABLE_ANIMATION_SYSTEM.md](../proposals/TABLE_ANIMATION_SYSTEM.md) — Contract, collision, anchors.
- [TABLE_ANIMATION_DEFINITIONS.md](../proposals/TABLE_ANIMATION_DEFINITIONS.md) — Registry, lookup, validation.
- [TABLE_ANIMATION_REUSABLE_LAYERS.md](../proposals/TABLE_ANIMATION_REUSABLE_LAYERS.md) — Reusable clips, registry, shared canvas.
- [TABLE_ANIMATION_CONTROLS_AND_ASSETS.md](../proposals/TABLE_ANIMATION_CONTROLS_AND_ASSETS.md) — How devs control size/position/speed; designer asset list.
