# Table FX System — Review & Top 10 Critiques

Fresh review of the table animation system after planes, presets, anchors (BOARD/SEAT/CARD), board bounds, and reactive atmosphere. Prioritized by impact.

---

## 1. **RADIAL_GLOW ignores layer opacity**

**Issue:** Presets and definitions use `opacity: [0.06, 0.14]` or `[0.08, 0.18]` for atmosphere; `AnimationLayerRadialGlow` does not accept or use `opacity`. It uses fixed in/out fractions (0.2, 0.5), so atmosphere layers cannot be tuned softer.

**Impact:** BACKGROUND-plane RADIAL_GLOW looks the same as foreground; no way to author “soft” vs “punchy” via layer.

**Fix:** Add optional `opacity?: [number, number]` to RADIAL_GLOW props in `renderAnimationLayer` and in `AnimationLayerRadialGlow`; when set, drive animated opacity from those values instead of 0→1→0.

---

## 2. **Reduced-motion filter duplicated in three places**

**Issue:** The same filter (“drop PARTICLES, STREAK, BURST”) is implemented in (a) `layersForDef`, (b) atmosphere `atmosphereForRender`, and (c) conceptually in tier clamp. Changing the rule (e.g. add another type) requires editing multiple spots.

**Impact:** Drift risk; proposal says “single filter in overlay.”

**Fix:** Extract one helper, e.g. `filterLayersForReducedMotion(layers: AnimationLayerDefinition[]): AnimationLayerDefinition[]`, and use it for both event layers and atmosphere. Optionally centralize “skip types” in `animationConstants` (e.g. `REDUCED_MOTION_SKIP_TYPES`).

---

## 3. **Atmosphere uses hardcoded theme and no anchor/plane**

**Issue:** Atmosphere layers are rendered with `getAnimationTheme("POT_WIN")` and no payload; they are always TABLE_CENTER (full overlay). There is no way to (a) theme atmosphere by game state, or (b) use anchored/plane-aware atmosphere layers without putting them in an event def.

**Impact:** Reactive atmosphere is “one global stack” only; no BOARD/HERO atmosphere or event-specific atmosphere theme without more props.

**Fix:** Consider `atmosphereLayers` plus optional `atmosphereTheme?: AnimationTheme` and/or `atmospherePayload` so the host can drive theme and future anchor use. Low priority until you need state-based atmosphere.

---

## 4. **Board bounds are window coordinates; overlay is in table page**

**Issue:** `BoardBoundsReporter` uses `measureInWindow`, so rect is in screen/window space. The overlay sits in the table page and is likely inside a ScrollView or a transformed Surface. If the table scrolls or the page has insets, overlay and board may use different coordinate systems and BOARD-anchored FX can misalign.

**Impact:** BOARD glow may be offset or wrong size on scroll/insets.

**Fix:** Either (a) ensure overlay and board share the same coordinate space (e.g. both use measureInWindow and overlay container is full window), or (b) measure board relative to the overlay’s container and pass relative rects. Document which space anchorBounds use.

---

## 5. **No hero or seat bounds from table page**

**Issue:** Only `reportBoardBounds` is wired. `anchorBounds.hero` and `anchorBounds.seatByIndex` are never set, so POT_WIN’s RING on SEAT (winnerSeat) and any HERO-anchored layer only render when those bounds are provided—and they currently are not.

**Impact:** Winner seat ring and hero-specific FX do not show until the host measures and reports hero + seat rects.

**Fix:** Add `reportHeroBounds(rect)` and `reportSeatBounds(seatIndex, rect)` (or a single `reportAnchorBounds(partial: Partial<AnchorBounds>)`), and wire them from the hero zone and opponent strip in the same way as the board.

---

## 6. **CARD anchor has no data source**

**Issue:** Overlay supports CARD (iterate `anchorBounds.cardSlots`), but nothing measures or passes `cardSlots`. Community card positions are never reported.

**Impact:** CARD-anchored layers (e.g. flashing outline per card) are effectively dead until the host supplies cardSlots.

**Fix:** Add a reporter for community card slots (e.g. measure each card in CommunityBoard and call `reportCardSlot(index, rect)`), or document that CARD is “ready when you add measurement.”

---

## 7. **Definition-level anchor is still the container; per-layer is content**

**Issue:** Channel container is positioned by `getAnchorRect(def, ...)` (def.anchor). So TABLE defs get full overlay; HERO/SEAT defs get a clipped container. Per-layer anchor then positions *within* that. For TABLE defs with mixed BOARD/SEAT layers, the container is full screen and per-layer rects are correct. For a hypothetical “SEAT-only” def, the container would be one seat rect and all layers would be clipped to it—correct. But the mental model (def = container, layer = optional override) could be clearer in comments.

**Impact:** Minor; behavior is correct. Risk of confusion when adding new defs (e.g. “BOARD-only” def).

**Fix:** One-line comment above `getAnchorRect` and in the proposal: “Def anchor sets the channel’s container; per-layer anchor sets each layer’s rect (or TABLE_CENTER = use container).”

---

## 8. **ASSET layers do not receive theme or anchor in render path**

**Issue:** `renderAnimationLayer` for ASSET passes source/variant/duration but not theme (for tint/overlay) or any anchor. Anchored ASSETs are positioned by the overlay via `renderAnchoredFx`, but the ASSET component itself doesn’t get theme. If you add “hero win” webm, you might want theme-driven tint or opacity.

**Impact:** Low until ASSET is used heavily; then you may want theme and/or opacity on ASSET.

**Fix:** When ASSET is used with anchor/plane, ensure overlay passes theme into the layer if you add theme-driven ASSET options later.

---

## 9. **Preset resolution can overwrite type with a bad merge**

**Issue:** `resolveLayerWithPreset` does `{ ...defaults, ...layer }`. If a preset accidentally included `type` (e.g. from a copy-paste), it would be overwritten by layer.type. Type is excluded from `LayerPresetDefaults`, so this is safe at the type level, but at runtime a hand-written preset object could still have `type`. Not a bug today; defensive consideration.

**Impact:** Very low; TypeScript and discipline prevent it.

**Fix:** Optional: when merging, explicitly omit `type` from preset side, e.g. `const { type: _t, ...presetRest } = defaults; return { ...presetRest, ...layer }`.

---

## 10. **Overlay file size and single responsibility**

**Issue:** `TableAnimationOverlay.tsx` handles: request lifecycle, channel slots, sound scheduling, anchor resolution (def + layer + CARD), reduced motion, preset resolution, two-plane split, atmosphere, and render loop. It’s the single place that “knows” everything. Over ~380 lines it stays readable but is doing a lot.

**Impact:** Harder to test in isolation; changes to anchor or plane logic touch the same file as timing and cleanup.

**Fix:** Optionally extract (a) `resolveAnchorToRect` + `getAnchorRectForLayer` + `getCardSlotRects` into `anchorResolution.ts`, and (b) reduced-motion + preset resolution into a small `resolveLayersForRender(def, settings)` helper. Overlay then orchestrates with thinner functions.

---

## Summary table

| # | Critique | Area | Severity |
|---|----------|------|----------|
| 1 | RADIAL_GLOW ignores layer opacity | Layers | P2 |
| 2 | Reduced-motion filter duplicated | Overlay | P2 |
| 3 | Atmosphere hardcoded theme, no anchor | Overlay | P3 |
| 4 | Board bounds coordinate space unclear | Layout | P2 |
| 5 | Hero/seat bounds not reported | Integration | P1 |
| 6 | CARD has no cardSlots source | Integration | P1 |
| 7 | Def vs layer anchor mental model | Docs | P3 |
| 8 | ASSET no theme in render | Layers | P3 |
| 9 | Preset merge could theoretically overwrite type | Presets | P3 |
| 10 | Overlay does too much in one file | Structure | P2 |

---

## What’s working well

- **Single overlay, no FX in components** — Clear separation; BOARD/SEAT/HERO/CARD stay in overlay.
- **Planes + anchors** — Same types on BACKGROUND/FOREGROUND; resolution order (rect → clip → render) is consistent.
- **Presets** — Layer presets reduce duplication; type excludes anchor/seatIndexFromPayload.
- **Board bounds wired** — reportBoardBounds + BoardBoundsReporter give BOARD-anchored FX a path to work.
- **CARD and atmosphere** — CARD iterate and atmosphere prop are implemented; only measurement and wiring remain for full use.
