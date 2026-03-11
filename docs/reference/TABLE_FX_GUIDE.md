# Table FX System — New Dev Guide

Short intro to the table animation (FX) system. Enough to know what it is and where to look.

---

## Getting started (one-pass overview)

To add or tweak table FX, start by deciding **which event** you care about (`POT_WIN`, `ALL_IN`, or `SHOWDOWN`) and **how loud** it should feel (tier 0–4), then open the matching tier builder in `animations/animationRegistry` and confirm which **preset** name that tier uses in `presets.ts`; from there, you can adjust the visual recipe by editing the preset’s layer stack (BURST, FLASH, RING, TEXT, PARTICLES, RADIAL_GLOW, etc.) and, if you need seat/hero-specific accents, append anchored layers in the tier builder (e.g. BOARD glow, winner SEAT ring, HERO aura) using the correct **channel** (`TABLE`, `HERO`, `SEAT`) and **anchor** (`TABLE_CENTER`, `BOARD`, `HERO`, `SEAT`, `CARD`). Once the definition looks right, make sure the **table page** is sending a `TableAnimationRequest` with the right `event`, `tier`, and `payload` (e.g. `winnerSeat`, `anchorSeat`, `isHero`) into `TableAnimationOverlay`, and that layout code reports accurate **anchor bounds** (`board`, `hero`, `seatByIndex`, `cardSlots`) in overlay coordinates so anchored layers can actually render. Finally, run the table, trigger the event in a dev build, and, if something looks off, turn on `FX_DEBUG_ANCHORS` to see measured rects and `ANIMATION_DEBUG` to log which definition and layers ran; adjust the preset or append layers until what you see on screen matches the mental model for that event and tier.

---

## What it is

Event-driven table animations: **pot win**, **all-in**, **showdown**. When something happens, the game sends a **request** (event + tier). The overlay picks a **definition**, resolves **layers** (flash, burst, particles, ring, text, etc.), and draws them on top of the table. No game logic lives in the FX code—it only reacts to requests and host-provided **anchor bounds**.

---

## Mental model

1. **Request** — e.g. “POT_WIN, tier 3”. Comes from the table page when a hand result is shown.
2. **Definition** — Chosen by event + tier from the registry. Contains layers, duration, optional sound.
3. **Layers** — Ordered list of effects (flash, burst, particles, ring, text…). Each can have delay, anchor, plane.
4. **Overlay** — Renders layers in two planes (background / foreground), using **anchor bounds** from the host so effects line up with board, hero, seats, or card slots.

So: **request → definition → layers → overlay render**. All data-driven; no hardcoded “when pot win do X” in components.

---

## Main concepts

- **Events & tiers** — POT_WIN, ALL_IN, SHOWDOWN. Tier 0 = minimal, 4 = max. Lookup falls back to the closest lower tier if exact tier is missing.
- **Channels** — TABLE, SEAT, HERO, GLOBAL. One animation per channel at a time; different channels can run together.
- **Anchors** — Where an effect is drawn: TABLE_CENTER (full overlay), BOARD, HERO, SEAT (e.g. winner), CARD (per card slot). Host supplies rects via `anchorBounds`.
- **Planes** — BACKGROUND (behind table) or FOREGROUND (default). Used for atmosphere vs punchy effects.
- **Presets** — Named layer stacks (e.g. POT_TIER_2). Definitions reference presets; presets are merged at resolution time. Visual-only (no anchor in presets).

---

## Channels (how to use them)

- **TABLE**  
  - Used by all POT_WIN / ALL_IN / SHOWDOWN definitions built in `potWin.ts`, `allIn.ts`, `showdown.ts`.  
  - Only **one TABLE animation** runs at a time; a new request replaces the old one after a small minimum display time.
- **HERO**  
  - Used by `HERO_AURA_ALL_IN` in `heroAura.ts`.  
  - Triggered only when: `event === ALL_IN`, `tier ≥ 3`, and `payload.isHero === true`.  
  - **To make a hero-only FX**: set `channel: "HERO"` and `anchor: "HERO"` on the definition.
- **SEAT**  
  - Used by `SEAT_GLOW_SHOWDOWN` in `seatGlow.ts`.  
  - Triggered only when: `event === SHOWDOWN` and `payload.anchorSeat` is set.  
  - **To highlight a seat**: set `channel: "SEAT"`, `anchor: "SEAT"`, and pass a payload key like `winnerSeat` / `anchorSeat`.
- **GLOBAL**  
  - Reserved for full-table / non-seat-specific effects that should not compete with TABLE, HERO, or SEAT. Currently unused.

**Rule of thumb:** pick the **narrowest channel** that matches what you want (SEAT or HERO for local accents; TABLE for main pot/all-in FX).

---

## Planes (background vs foreground)

- **FOREGROUND (default)**  
  - All layers without an explicit `plane` render here.  
  - Use this for **headline, amount text, ring, flash, burst, particles, streaks**.
- **BACKGROUND**  
  - Must be set per-layer: `plane: "BACKGROUND"`.  
  - Used for **soft atmosphere** that sits behind the table content.  
  - Examples today:
    - `POT_TIER_3`: `RADIAL_GLOW` with `plane: "BACKGROUND"` (soft glow behind the table).
    - `POT_TIER_4`: `RADIAL_GLOW` with `preset: "ambientGold", plane: "BACKGROUND"`.
    - `ATMOSPHERE_SOFT_GLOW` and `ATMOSPHERE_WARM_GLOW`.

**When composing presets or definitions:**  
- Put **subtle ambience** (glows, sweeps) on BACKGROUND.  
- Keep **information and impact** (headline, amount, bursts, rings) on FOREGROUND.

---

## Anchors (where things draw)

- **TABLE_CENTER**  
  - Full overlay. Used when the effect should cover the whole table area.  
  - No bounds required; overlay falls back to its full rect.
- **BOARD**  
  - Centered on community cards. Requires `anchorBounds.board`.  
  - Example: `POT_WIN` adds a `RADIAL_GLOW` anchored on BOARD for higher tiers.
- **HERO**  
  - Centered on the hero area. Requires `anchorBounds.hero`.  
  - Example: `HERO_AURA_ALL_IN` (HERO channel).
- **SEAT**  
  - One rect per seat index via `anchorBounds.seatByIndex`.  
  - Definitions can set `seatIndexFromPayload` to pick which seat (e.g. `"winnerSeat"` or `"anchorSeat"`).
  - Example: `POT_WIN` adds a `RING` anchored on `SEAT` with `seatIndexFromPayload: "winnerSeat"`.
- **CARD**  
  - One rect per card slot via `anchorBounds.cardSlots[0..4]`.  
  - Used when a layer should repeat for each card (not wired in current presets, but supported by the overlay).

**If the required rect is missing, that anchored layer is skipped.**  
To debug missing anchors, enable `FX_DEBUG_ANCHORS` so you can see which rects the overlay has.

---

## Events and tiers (what to send)

- **POT_WIN**  
  - Sent when the hand pot is awarded.  
  - Built in `potWin.ts` via `buildPotWinTier(tier)` using `POT_TIER_0`–`POT_TIER_4`.  
  - Adds **anchored layers** for tiers ≥1:
    - `RADIAL_GLOW` on BOARD.
    - `RING` on SEAT (winner), driven by `payload.winnerSeat`.
  - Adds a `table.potWin` sound for tiers ≥1.
- **ALL_IN**  
  - Sent when a player goes all-in.  
  - Built in `allIn.ts` via `buildAllInTier(tier)` using `TIER_0`–`TIER_3` and `ALL_IN_TIER_4`.  
  - For tiers ≥3 and when `payload.isHero === true`, it also triggers `HERO_AURA_ALL_IN` on HERO channel.
- **SHOWDOWN**  
  - Sent when cards are shown down at the end of the hand.  
  - Built in `showdown.ts` via `buildShowdownTier(tier)` using `TIER_0`–`TIER_4`.  
  - When `payload.anchorSeat` is set, it also triggers `SEAT_GLOW_SHOWDOWN` on SEAT channel.

**Reduced motion rules:**  
- If `settings.reducedMotion` is true, the overlay clamps the tier down to at most 1 before resolving the definition, and also filters some layers out. Send the same event and tier; the runtime will tone it down.

---

## Presets (how they work)

- **Where they live** — `animations/animationRegistry/presets.ts`.
- **What they are** — Named arrays of `AnimationLayerDefinition[]`:
  - e.g. `"POT_TIER_3"` → `[RADIAL_GLOW (BACKGROUND), BURST, PARTICLES, FLASH, RING, TEXT headline, TEXT amount]`.
- **How they are used**:
  - Tier builders (`potWin.ts`, `allIn.ts`, `showdown.ts`) call `defFromPreset(event, tier, presetName, durationMs, options?)`.
  - The registry expands the preset into a full **definition.layers` array` at build time.
- **What presets do NOT set**:
  - No **channel** or **event** or **tier**.
  - No **anchor** for the whole animation; that lives on the definition.

**Rule of thumb:** presets are **visual recipes**; definitions decide **where** and **for whom** they play.

---

## Where bounds come from

The **host** (table page / layout) measures the board, hero zone, each seat, and each card slot. It reports those rects with `reportBoardBounds`, `reportHeroBounds`, `reportSeatBounds`, `reportCardSlotBounds`. The overlay receives them as `anchorBounds` and uses them only for positioning. **Coordinate space:** rects should be in **overlay coordinate space** (e.g. `measureLayout(overlayRef)` when available; `measureInWindow` is the current fallback). The overlay does not measure—it only consumes.

---

## Adding a new FX (checklist)

1. **New event?** Add it to the event type and registry, and a tier builder (see `potWin.ts` / `allIn.ts` / `showdown.ts`).
2. **New layer type?** Add the type, a layer component in `layers/`, and a branch in `renderAnimationLayer` (or the procedural renderer map).
3. **New preset?** Add to `presets.ts` and reference it from a tier builder or definition.
4. **Trigger from game?** Table page (or equivalent) creates a request `{ event, tier, payload }` and passes it to the overlay; the overlay resolves the definition and runs.

---

## Debugging

- **Anchor boxes** — Set `FX_DEBUG_ANCHORS` to `true` in `animationConstants.ts` (dev only). The overlay draws rects for BOARD (green), HERO (blue), SEAT (gold), CARD (purple) with labels. Use this to see why an effect is in the wrong place.
- **Animation log** — Set `ANIMATION_DEBUG` to `true` in `TableAnimationOverlay.tsx` to log each animation start (event, tier, layers, duration).
- **“No FX”** — Check: (1) request is passed to the overlay, (2) definition exists for that event + tier, (3) `anchorBounds` is set if the definition uses BOARD/HERO/SEAT/CARD anchors, (4) reduced motion isn’t stripping the layers you expect.

---

## Current presets and what they look like

These live in `presets.ts` as `PRESETS`:

- **TIER_0**  
  - **Layers:** headline text only (`TEXT` medium).  
  - **Feel:** simple announce with no flash or particles.
- **TIER_1**  
  - **Layers:** quick `FLASH` + big headline text.  
  - **Feel:** small punch, no particles yet.
- **TIER_2**  
  - **Layers:** `BURST` + `FLASH` + large headline.  
  - **Feel:** clear “moment” with a radial burst behind the text.
- **TIER_3**  
  - **Layers:** `BURST` (more rays) + `PARTICLES` + `FLASH` + xlarge glowing headline.  
  - **Feel:** big impact, confetti-style particles, very visible announce.
- **TIER_4**  
  - **Layers:** even bigger `BURST`, more `PARTICLES`, `FLASH`, and long-living xlarge glowing headline.  
  - **Feel:** “max” generic win effect before we specialize it for specific events.

- **ALL_IN_TIER_4**  
  - **Layers:**  
    - Big `BURST` + `PARTICLES` + `FLASH`.  
    - `STREAK` layer (diagonal streaks) for speed.  
    - Glowing xlarge headline (`TEXT`, `textGlow: true`) + extra `PARTICLES` under the amount.  
    - Amount text (`TEXT` amount).  
  - **Feel:** loud, “you just shoved” energy with streaks and extra confetti.

- **POT_TIER_0**  
  - **Layers:** `RING` + small headline + amount text.  
  - **Feel:** modest pot ring with minimal light.
- **POT_TIER_1**  
  - **Layers:** `FLASH` + `RING` + medium headline + amount text.  
  - **Feel:** low–mid pot, slightly brighter with a flash.
- **POT_TIER_2**  
  - **Layers:** `BURST` (using a burst preset) + `FLASH` + `RING` + large headline + medium amount text.  
  - **Feel:** clearly “good” pot; burst + ring + text.
- **POT_TIER_3**  
  - **Layers:**  
    - BACKGROUND `RADIAL_GLOW` under the table.  
    - `BURST` + `PARTICLES` (square) + `FLASH` + `RING`.  
    - Xlarge headline + large amount text.  
  - **Feel:** big win with soft glowing table plus confetti and strong text.
- **POT_TIER_4**  
  - **Layers:**  
    - BACKGROUND `RADIAL_GLOW` using `preset: "ambientGold"`.  
    - `BURST` using `preset: "winBurst"`.  
    - Extra `RADIAL_GLOW`, `PARTICLES` (more, wider), `FLASH`, `RING`.  
    - Headline using `preset: "headlineWin"` + large amount text + trailing `PARTICLES`.  
  - **Feel:** “jackpot” pot; brightest and busiest preset we have.

- **ATMOSPHERE_SOFT_GLOW**  
  - **Layers:** BACKGROUND `RADIAL_GLOW` with low opacity.  
  - **Feel:** subtle ambient glow behind the table.
- **ATMOSPHERE_WARM_GLOW**  
  - **Layers:** BACKGROUND `RADIAL_GLOW` slightly stronger than soft glow.  
  - **Feel:** warm, cozy ambience; can be combined with event FX.

**To reuse a preset for a new definition:** pick a `PresetName` from `presets.ts` and call `defFromPreset(event, tier, presetName, durationMs, options?)` in your tier builder.

---

## Composing animations (step by step)

**Goal:** “Make POT_WIN tier 3 feel bigger without touching game logic.”

1. **Open the tier builder**  
   - File: `animations/animationRegistry/potWin.ts`.  
   - Find `buildPotWinTier` and `PRESET_BY_TIER`.
2. **Confirm which preset is used**  
   - Tier 3 maps to `"POT_TIER_3"` in `PRESET_BY_TIER`.  
   - That preset is defined in `presets.ts` (see sections above).
3. **Decide what to change**  
   - If you want **more atmosphere**, add or tweak BACKGROUND `RADIAL_GLOW` layers in `POT_TIER_3`.  
   - If you want **more impact**, add `PARTICLES` or bigger `BURST` layers in the same preset.
4. **Edit the preset, not the tier builder (usually)**  
   - In `presets.ts`, update `POT_TIER_3`’s layer list.  
   - Keep it as a small, readable stack: 5–8 layers max.
5. **Only use append layers when you need anchors**  
   - In `potWin.ts`, `POT_WIN_ANCHORED_LAYERS` adds BOARD glow + winner SEAT ring for tiers ≥1.  
   - If you need more anchored accents (e.g. hero-only ring), add them to `appendLayers` in `buildPotWinTier`, not inside the generic preset.

**General recipe for any new FX:**

1. Pick or create a **preset** in `presets.ts` with the visual stack you want.  
2. In the relevant tier builder (`potWin.ts`, `allIn.ts`, `showdown.ts`), call `defFromPreset` with:
   - `event` (POT_WIN / ALL_IN / SHOWDOWN),
   - `tier` (0–4),
   - `presetName`,
   - `durationMs`,
   - optional `sounds` and `appendLayers`.
3. Set `channel`, `anchor`, and any `seatIndexFromPayload` on append layers when you need seat/hero-specific accents.  
4. Wire the **request** from game code: send `{ event, tier, payload }` to `TableAnimationOverlay`.

If you follow these steps in order, you can change FX behavior without touching overlay or game logic.

---

## Registry behavior (why it feels consistent)

- **Single source of truth**  
  - `TABLE_ANIMATIONS` in `animationRegistry/index.ts` holds all table-level definitions for each event.  
  - **Companion definitions** (hero aura, seat glow) live alongside but are registered separately.
- **Fast lookup with fallback**  
  - `resolveAnimation(event, tier)` builds an O(1) map and falls back to **the closest lower tier** if the exact tier is missing.  
  - Example: if tier 4 is missing, tier 3 is used.
- **Companions from one request**  
  - `resolveAnimationWithCompanions(request)` returns `{ table, hero, seat }` based on:
    - `event`, `tier`, and `payload` keys (`isHero`, `anchorSeat`, etc.).
- **Validation and freezing**  
  - On module init, it:
    - Validates: no duplicates, no empty layers, reasonable durations, valid sounds.  
    - Freezes definitions so runtime code can’t accidentally mutate configs.
- **Preload hints**  
  - `getPreloadSources()` scans all definitions for `ASSET` layers with `preload: true`.  
  - The overlay asks you to preload them (via `onPreloadAssets`) to avoid first-play hitches.

---

## Where to look in code

| What you need | File(s) |
|---------------|--------|
| Types (events, anchors, layers, request/definition) | `animations/animationTypes.ts` |
| Constants (durations, cascade timing, debug flags) | `animations/animationConstants.ts` |
| Registry (event → definitions, resolve, validate, freeze) | `animations/animationRegistry/index.ts` |
| Presets (named layer stacks) | `animations/animationRegistry/presets.ts` |
| Tier builders (e.g. POT_WIN) | `animations/animationRegistry/potWin.ts`, `allIn.ts`, `showdown.ts` |
| Companion FX (hero aura, seat glow) | `animations/animationRegistry/heroAura.ts`, `seatGlow.ts` |
| Overlay (request → def → layers → render) | `animations/TableAnimationOverlay.tsx` |
| Layer → component (renderer map) | `animations/renderAnimationLayer.tsx` |
| Anchor → rect (no layout, just math) | `animations/anchorResolution.ts` |

More detail: `docs/roadmaps/TABLE_FX_SUMMARY.md` and `docs/proposals/TABLE_FX_COMPONENT_EFFECTS.md`.

---

## Appendix: key script paths

- **Core types and contracts**
  - `apps/client/src/features/table/animations/animationTypes.ts`
  - `apps/client/src/features/table/animations/animationConstants.ts`

- **Registry and presets**
  - `apps/client/src/features/table/animations/animationRegistry/index.ts`
  - `apps/client/src/features/table/animations/animationRegistry/presets.ts`
  - `apps/client/src/features/table/animations/animationRegistry/layerPresets.ts`
  - `apps/client/src/features/table/animations/animationRegistry/shared.ts`

- **Event tier builders**
  - `apps/client/src/features/table/animations/animationRegistry/potWin.ts`
  - `apps/client/src/features/table/animations/animationRegistry/allIn.ts`
  - `apps/client/src/features/table/animations/animationRegistry/showdown.ts`

- **Companion FX**
  - `apps/client/src/features/table/animations/animationRegistry/heroAura.ts`
  - `apps/client/src/features/table/animations/animationRegistry/seatGlow.ts`

- **Overlay runtime and layout**
  - `apps/client/src/features/table/animations/TableAnimationOverlay.tsx`
  - `apps/client/src/features/table/animations/anchorResolution.ts`
  - `apps/client/src/features/table/animations/overlayRenderable.ts`
  - `apps/client/src/features/table/animations/renderAnimationLayer.tsx`
  - `apps/client/src/features/table/animations/animationTheme.ts`

- **Layer implementations**
  - `apps/client/src/features/table/animations/layers/AnimationLayerFlash.tsx`
  - `apps/client/src/features/table/animations/layers/AnimationLayerBurst.tsx`
  - `apps/client/src/features/table/animations/layers/AnimationLayerRing.tsx`
  - `apps/client/src/features/table/animations/layers/AnimationLayerRadialGlow.tsx`
  - `apps/client/src/features/table/animations/layers/AnimationLayerText.tsx`
  - `apps/client/src/features/table/animations/layers/AnimationLayerParticles.tsx`
  - `apps/client/src/features/table/animations/layers/AnimationLayerStreak.tsx`
  - `apps/client/src/features/table/animations/layers/AnimationLayerSeatGlow.tsx`

- **Sound wiring**
  - `apps/client/src/features/table/animations/animationRegistry/index.ts` (validation)
  - `apps/client/src/features/table/animations/TableAnimationOverlay.tsx` (sound cues)
  - `apps/client/src/features/table/sound/emitSoundEvent.ts` and `soundEventMap.ts`

---

## What you should see on screen today

This assumes **FX enabled** and **normal motion** (not reduced).

- **Pot win (POT_WIN)**  
  - **Tier 0:** simple ring and small text over the pot; no flash or particles.  
  - **Tier 1–2:** front-of-table burst/flash + ring, headline, and amount; low-to-mid impact.  
  - **Tier 3–4:**  
    - Background glow under the table (from `POT_TIER_3` / `POT_TIER_4`).  
    - Big burst + particles + flash + ring + large headline + large amount.  
    - Extra anchored accent:
      - BOARD glow (BOARD anchor).  
      - Winner SEAT ring (SEAT anchor, `winnerSeat` from payload).  
    - A short pot-win **sound** for tiers ≥1.

- **All-in (ALL_IN)**  
  - **Tier 0–3:** generic `TIER_0`–`TIER_3` stack (flash, burst, text, particles at higher tiers).  
  - **Tier 4:** uses `ALL_IN_TIER_4`, which adds streaks and extra particles around the headline/amount.  
  - If the player going all-in is **hero** and tier ≥3:  
    - HERO channel aura: ring + particles around the hero zone (`HERO_AURA_ALL_IN`).

- **Showdown (SHOWDOWN)**  
  - Uses `TIER_0`–`TIER_4` stacks similar to ALL_IN but without all-in specific extras.  
  - If `payload.anchorSeat` is set:  
    - SEAT channel glow (`SEAT_GLOW_SHOWDOWN`) around the winning seat.

If what you see does **not** match this, check the event + tier you are sending, the payload fields (`winnerSeat`, `anchorSeat`, `isHero`), and that the relevant anchor bounds are reported.
