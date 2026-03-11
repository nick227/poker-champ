## Extending the Table FX System (Channels, Planes, Anchors, Events, Tiers, Presets)

This is a **how-to** for adding new FX building blocks. Read `TABLE_FX_GUIDE.md` first, then follow the steps here when you need to extend the system.

---

## 1. Adding a new event

**Goal:** support a new event like `BONUS`, `TIMEBANK`, etc.

1. **Add the event type**
   - File: `apps/client/src/features/table/animations/animationTypes.ts`
   - Update `TableAnimationEvent`:
     - Add your key (e.g. `"BONUS"`) to the union.
     - Add it to `FX_EVENT` as a new entry.
2. **Create a tier builder**
   - Create `apps/client/src/features/table/animations/animationRegistry/bonus.ts` (or similar).
   - Pattern:
     - Define your tier type: `type BonusTier = 0 | 1 | 2 | 3 | 4;`
     - Set `DURATIONS_MS` per tier.
     - Map tiers to presets with `PRESET_BY_TIER` (using `PresetName` from `presets.ts`).
     - Implement `buildBonusTier(tier: BonusTier): TableAnimationDefinition` using `defFromPreset(...)`.
     - Export `BONUS_TIERS: TableAnimationDefinition[]` with `buildBonusTier(0..4)`.
3. **Register the event in the registry**
   - File: `apps/client/src/features/table/animations/animationRegistry/index.ts`
   - Import your tier array (e.g. `BONUS_TIERS`).
   - Add your event to `TABLE_ANIMATIONS`:
     - `BONUS: BONUS_TIERS,`
4. **Trigger it from game code**
   - Wherever table events are emitted, send a `TableAnimationRequest`:
     - `event: FX_EVENT.BONUS`
     - `tier: 0..4`
     - `payload` with whatever fields your layers need (e.g. `headline`, `amountCents`).

**Checklist before you run it:**
- Types compile (`TableAnimationEvent` updated).
- `TABLE_ANIMATIONS` includes the new event.
- There is exactly one definition per `(event, tier)` for the TABLE channel.

---

## 2. Adding a new preset

**Goal:** new reusable visual recipe, like `BONUS_TIER_3` or `ATMOSPHERE_COOL_BLUE`.

1. **Add a name to `PresetName`**
   - File: `apps/client/src/features/table/animations/animationRegistry/presets.ts`
   - Add your preset key to `PresetName` (e.g. `"BONUS_TIER_3"`).
2. **Define the layer stack in `PRESETS`**
   - In the same file, add an entry to `PRESETS`:
     - Example shape:
       - `FLASH`, `BURST`, `RING`, `TEXT` (headline/amount), `RADIAL_GLOW`, `PARTICLES`, `STREAK`, etc.
     - Keep it small and clear (5–8 layers max).
     - Use `plane: "BACKGROUND"` for ambience only.
3. **Use the preset in a tier builder**
   - In your event tier file (e.g. `bonus.ts`):
     - Map the tier to `"BONUS_TIER_3"` in your `PRESET_BY_TIER`.
     - Call `defFromPreset(event, tier, presetName, durationMs, options?)`.
4. **Avoid logic in presets**
   - Do **not** set `event`, `tier`, or `channel` in the preset.
   - Use presets purely as visual recipes; let definitions decide anchor/channel and sounds.

**Rule:** if you want the same visual stack for multiple events/tier combos, make a preset; if it’s unique to one tier of one event, you can either still use a preset or inline the layers in a dedicated def.

---

## 3. Adding or changing channels

**Adding a new channel** is rare; you usually just use existing ones.

1. **Use an existing channel when possible**
   - TABLE: main pot/all-in/showdown FX.
   - HERO: hero-specific auras.
   - SEAT: seat-specific glows/highlights.
   - GLOBAL: table-wide atmospherics that should not fight TABLE.
2. **If you truly need a new channel (e.g. `DEALER`)**
   - File: `apps/client/src/features/table/animations/animationTypes.ts`
     - Add `"DEALER"` to `AnimationChannel`.
     - Add an entry to `FX_CHANNEL`.
   - File: `apps/client/src/features/table/animations/animationRegistry/shared.ts`
     - When you call `def(...)` directly, set `channel` to your new channel if the default TABLE is wrong.
   - File: `apps/client/src/features/table/animations/TableAnimationOverlay.tsx`
     - Overlay already handles channels generically via `Record<AnimationChannel, ActiveSlot>`.
     - No extra wiring should be needed unless you need special behavior.

**Guideline:** prefer TABLE / HERO / SEAT / GLOBAL; only introduce a new channel when there’s a clear concurrency or layering need.

---

## 4. Adding or changing planes

**Planes** are simple: `"FOREGROUND"` (default) or `"BACKGROUND"`.

1. **Use FOREGROUND for impact**
   - Default; no change needed.
   - Use for headline, amount, bursts, rings, particles, streaks.
2. **Use BACKGROUND for ambience**
   - Set `plane: "BACKGROUND"` on any `AnimationLayerDefinition`:
     - `RADIAL_GLOW`, atmospheric `ASSET`s, very soft particles.
   - Examples in `presets.ts`:
     - `POT_TIER_3`, `POT_TIER_4`, `ATMOSPHERE_SOFT_GLOW`, `ATMOSPHERE_WARM_GLOW`.

You generally **do not** need to “add” new planes—just tag layers with the existing values and let the overlay’s `partitionLayersByPlane` function route them.

---

## 5. Adding a new anchor type

Most features only need existing anchors, but if we ever expand:

1. **Add the anchor enum value**
   - File: `apps/client/src/features/table/animations/animationTypes.ts`
     - Add your key (e.g. `"DEALER"`) to `AnimationAnchor`.
     - Add it to `FX_ANCHOR`.
2. **Extend anchor bounds**
   - File: `apps/client/src/features/table/animations/animationTypes.ts`
     - Add a field to `AnchorBounds` for your new rect (e.g. `dealer?: Rect;`).
3. **Add resolution logic**
   - File: `apps/client/src/features/table/animations/anchorResolution.ts`
     - Update `getAnchorRect` and `getAnchorRectForLayer` to handle your new anchor type and read from `AnchorBounds`.
4. **Update host reporting**
   - Wherever we currently report:
     - `reportBoardBounds`, `reportHeroBounds`, `reportSeatBounds`, `reportCardSlotBounds`
   - Add a similar function for your anchor (e.g. `reportDealerBounds`) and feed that into `anchorBounds`.
5. **Use the new anchor in a definition**
   - Either:
     - Set `anchor` on the definition, or
     - Set `anchor` on specific layers that should use the new rect.

**Remember:** if the new anchor’s rect is missing at runtime, those layers will be skipped. Use `FX_DEBUG_ANCHORS` to verify it’s wired.

---

## 6. Adding tiers or changing tier behavior

The system assumes tiers `0..4`. Changing that globally is a bigger refactor; usually you just **change how each tier feels**.

1. **Adjust durations per tier**
   - In your event tier builder file (`potWin.ts`, `allIn.ts`, etc.):
     - Edit `DURATIONS_MS` to change how long each tier runs.
2. **Change which preset a tier uses**
   - In the same file, update `PRESET_BY_TIER` to point to a different preset.
3. **Add or remove anchored append layers by tier**
   - Use a pattern like `POT_WIN_ANCHORED_LAYERS` + a check in `buildXxxTier`:
     - For example, only append board/seat accents for tiers ≥1 or ≥2.
4. **If you must add more tiers (e.g. 0..5)**
   - Update:
     - `TableAnimationRequest.tier` union.
     - Any tier types in tier builder files (`PotWinTier`, etc.).
     - `DURATIONS_MS` and `PRESET_BY_TIER` maps.
     - `resolveAnimation` clamps (currently 0–4).
   - This is not recommended unless we have a strong reason.

**Safer approach:** keep `0..4`, just adjust presets, durations, and append layers.

---

## Media / assets (video, audio, animation) and timing control

### Are any of our FX referencing media today (video/audio/animation)?

- **Audio (yes)**  
  - FX definitions can include `sounds`, and the overlay schedules them with `setTimeout`.  
  - Example today: `POT_WIN` tiers ≥1 add `{ sound: "table.potWin", delayMs: 40 }` in `apps/client/src/features/table/animations/animationRegistry/potWin.ts`.  
  - Validation: in dev/CI, sound keys are validated against `SOUND_EVENT_MAP`.

- **Video / Lottie / sprite assets (type exists; real playback not wired yet)**  
  - The layer system supports an `ASSET` layer:
    - `assetType: "VIDEO" | "LOTTIE" | "SPRITE"`
    - `source`, `variant?`, `containsAudio?`, `delayMs?`, `durationMs?`, `preload?`, plus optional `anchor` and `plane`
  - **Important:** the current `AssetLayer` implementation is a stub that renders an empty placeholder view and ends by timeout. It does not play real media yet.  
  - Today’s presets/tier builders do **not** include any `type: "ASSET"` layers, so no video/Lottie is visible on screen right now.

### How do we control a plane / background behavior or fade-in behavior?

- **Plane selection (BACKGROUND vs FOREGROUND)**  
  - Set per-layer: `plane: "BACKGROUND"` renders behind; omit (or set `"FOREGROUND"`) renders normally.  
  - The overlay partitions layers by plane and renders BACKGROUND in a separate pass with a lower z-index.

- **Fade-in / fade-out behavior**  
  - Procedural layers handle fade internally (each layer component owns its own animation curve).  
  - Asset fade is not implemented yet because asset playback is stubbed; once we wire real playback, fade will live inside `AssetLayer` (or inside the specific video/lottie renderer).

### How do we add a video to a channel and to a plane?

**Channel is picked on the definition. Plane is picked on the layer.** An `ASSET` is just another layer in the stack.

1. **Choose the channel**
   - TABLE for the main event, HERO for hero-only, SEAT for seat-only, GLOBAL for “ambient always-on”.
2. **Add an `ASSET` layer (VIDEO)**
   - Put it in a preset (`presets.ts`) or in `appendLayers` in a tier builder.
   - Minimal shape:
     - `type: "ASSET"`
     - `assetType: "VIDEO"`
     - `source: "<asset id/path>"`
     - `plane: "BACKGROUND"` (optional; omit for foreground)
     - `delayMs`, `durationMs`
     - `preload: true` (optional; exposes it through `onPreloadAssets`)
     - `anchor` (optional; defaults to the definition’s anchor)
3. **Ensure anchor bounds exist if anchored**
   - If you anchor to BOARD/HERO/SEAT/CARD, the host must report those rects or the layer will be skipped.

**Note:** until Phase 2, this proves wiring/timing only; it won’t render an actual video.

### Concrete examples: add a Lottie + a webm

**Example A: Add a Lottie to POT_WIN tier 4 (foreground)**

1. **Decide your asset IDs**
   - Assume the client can load a Lottie by `source: "fx/potWinTier4"` and variant `"default"`.
2. **Add an ASSET layer to a preset**
   - File: `apps/client/src/features/table/animations/animationRegistry/presets.ts`
   - In `POT_TIER_4`, add a new layer near the top of the stack:
     - `{ type: "ASSET", assetType: "LOTTIE", source: "fx/potWinTier4", variant: "default", delayMs: 0, durationMs: 1600, preload: true }`
   - Keep `plane` omitted so it renders on FOREGROUND with the other impact layers.
3. **Ensure duration matches the definition**
   - Check `DURATIONS_MS[4]` in `potWin.ts` and make sure `delayMs + durationMs <= DORATIONS_MS[4]` (or increase the tier 4 duration).
4. **Wire actual Lottie playback later**
   - When we implement real media, update `AssetLayer` to render a `LottieView` when `assetType === "LOTTIE"` and use `source`/`variant` to pick the animation.

**Example B: Add a webm video as a soft background to ALL_IN tier 4**

1. **Decide your asset IDs**
   - Assume the client can load a webm by `source: "fx/allInBg"` and variant `"goldSweep"`.
2. **Add an ASSET background layer**
   - File: `apps/client/src/features/table/animations/animationRegistry/presets.ts`
   - In `ALL_IN_TIER_4`, prepend:
     - `{ type: "ASSET", assetType: "VIDEO", source: "fx/allInBg", variant: "goldSweep", plane: "BACKGROUND", delayMs: 0, durationMs: 2200, preload: true }`
   - This places the video in the BACKGROUND plane, under the rest of the tier 4 layers.
3. **Keep definition duration in sync**
   - In `allIn.ts`, make sure `DURATIONS_MS[4]` is at least `2200` so the video is not cut off early.
4. **Hook up real webm playback in AssetLayer**
   - Extend `AssetLayer` so that when `assetType === "VIDEO"` it mounts a video component (e.g. React Native Video / web `<video>`) that:
     - Respects `delayMs` and `durationMs` (or intrinsic media duration).
     - Calls `onReady` when loaded and `onEnd` when finished.

### How do we control duration and visibility of an asset and an effect?

- **Procedural effects**
  - **Visibility window** is \(delayMs \rightarrow delayMs + durationMs\).  
  - Set:
    - `layer.delayMs` (defaults to 0)
    - `layer.durationMs` (defaults to `LAYER_DURATION_DEFAULT_MS` when omitted)

- **Assets (`ASSET` layers)**
  - **Visibility window** is \(delayMs \rightarrow delayMs + durationMs\).  
  - Set:
    - `layer.delayMs`
    - `layer.durationMs` (defaults to `ASSET_DURATION_DEFAULT_MS` when omitted)

- **Definition duration cuts everything off**
  - The overlay clears a channel after `def.durationMs`.  
  - Make sure your longest layer finishes inside the definition:

    \[
    \max_i((delayMs_i \\, + \\, durationMs_i)) \le def.durationMs
    \]

  - If you see effects “getting cut”, increase the definition duration in the tier builder (`DURATIONS_MS`), or shorten the layers.

---

## 7. Putting it all together (example: new BONUS event)

1. **Add event to types**
   - `TableAnimationEvent` += `"BONUS"`.
   - `FX_EVENT.BONUS = "BONUS"`.
2. **Create BONUS presets**
   - In `presets.ts`:
     - Add `"BONUS_TIER_0"`..`"BONUS_TIER_4"` to `PresetName`.
     - Define each stack in `PRESETS` (starting from existing `TIER_*` as templates).
3. **Create `bonus.ts` tier builder**
   - `DURATIONS_MS` for each tier.
   - `PRESET_BY_TIER` mapping tiers to your new presets.
   - `buildBonusTier` using `defFromPreset(FX_EVENT.BONUS, tier, PRESET_BY_TIER[tier], DURATIONS_MS[tier])`.
   - Export `BONUS_TIERS` array.
4. **Register in the registry**
   - `TABLE_ANIMATIONS.BONUS = BONUS_TIERS`.
5. **Wire up game event**
   - When a bonus triggers, send:
     - `event: FX_EVENT.BONUS`
     - `tier: 0..4` based on bonus size
     - `payload` with `headline`, `amountCents`, etc.
6. **Verify**
   - Enable `ANIMATION_DEBUG` to confirm `BONUS_TIER_X` is running.
   - Adjust presets / append layers until it feels right.

If you’re ever unsure which file to touch, go back to `TABLE_FX_GUIDE.md` for the overview, then use this document as a concrete checklist for extending the system.

