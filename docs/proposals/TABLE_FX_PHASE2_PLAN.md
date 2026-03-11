# Table FX — Phase 2 Implementation Plan

Anchored effects (hero aura, seat glow), background streaks, and slider trail. Implementation order and tasks.

---

## 2.1 Anchor resolution API

**Goal:** Effects can be positioned at HERO or at a SEAT, not only at table center.

**Tasks:**
- Add `AnchorBounds` type: `{ hero?: Rect; seatByIndex?: Record<number, Rect> }` with `Rect = { x, y, width, height }` in overlay coordinates.
- Add optional prop `anchorBounds?: AnchorBounds` to `TableAnimationOverlay`.
- When rendering a definition with `anchor !== TABLE_CENTER`: if bounds exist for that anchor (hero or `payload.anchorSeat`), wrap the layer stack in a `View` with `position: 'absolute'`, `left: rect.x`, `top: rect.y`, `width: rect.width`, `height: rect.height`, and clip/scale layers inside. If bounds are missing, render at full screen (fallback) so existing behavior is unchanged.
- Table page / table scene can later pass `anchorBounds` from measured layout (hero zone, seat cells).

---

## 2.2 Hero aura

**Goal:** When the player goes all-in (or wins), a RING + PARTICLES burst at the hero area.

**Tasks:**
- Add a **hero-aura** definition: channel `HERO`, anchor `HERO`, layers RING + PARTICLES, same theme as TABLE for the event. Register it as a companion, not by (event, tier) — e.g. id `HERO_AURA_ALL_IN`, duration ~1200 ms.
- **Companion resolution:** When overlay receives a request with `payload.isHero === true` and `event === 'ALL_IN'` and `tier >= 3`, resolve both the TABLE definition and the hero-aura definition; run TABLE on channel TABLE and hero-aura on channel HERO (concurrent). If `anchorBounds.hero` is provided, position hero layers at hero rect; else fallback to center.
- No server change: single request; overlay derives HERO slot from same request.

---

## 2.3 Seat glow

**Goal:** Glow border at a specific seat (e.g. winner or all-in seat).

**Tasks:**
- Add `AnimationLayerSeatGlow`: simple bordered View (or RING-like) that fits a rect; opacity in/out. Accepts `color` from theme (e.g. `haloColor` or `ring`).
- Add optional SEAT-channel definition keyed by event (e.g. SHOWDOWN winner seat). Resolve when `payload.anchorSeat != null` for that event.
- Overlay: when channel SEAT and anchor SEAT, use `anchorBounds.seatByIndex?.[payload.anchorSeat]` to position. If missing, skip or center fallback.
- Registry: one SEAT definition per event that uses it (e.g. SHOWDOWN), or a shared “seat glow” def with event-agnostic id.

---

## 2.4 Background streaks

**Goal:** Directional streak(s) in the background (no anchor; full screen).

**Tasks:**
- Add layer type `STREAK` (or FLASH variant): a few diagonal/radial lines, opacity 0→1→0, subtle. ProceduralLayerDefinition: `type: 'STREAK'`, optional `streakCount`, `streakAngleDeg`, `durationMs`, `delayMs`.
- Implement `AnimationLayerStreak`: 3–5 lines (or configurable), positioned absolute, diagonal; Animated opacity and optional scale. Use theme `streakColor` when present.
- renderAnimationLayer: handle STREAK; theme: use `palette.streakColor` (already optional).
- Registry: add STREAK layer to ALL_IN tier 4 and optionally POT_WIN tier 4 (one layer per def, delay after FLASH).

---

## 2.5 Slider flame trail

**Goal:** Bet slider thumb trail / flame effect.

**Scope:** UI control animation **outside** the table FX overlay. Implement in the slider/bet control component when that feature is built. No changes to animation registry or overlay. Document here as Phase 2 backlog item only.

---

## Implementation order (Phase 2)

1. **Types:** `AnchorBounds`, `Rect`; optional `anchorBounds` on overlay (and export types).
2. **Overlay:** Accept `anchorBounds`; when `def.anchor === 'HERO'` and `anchorBounds.hero`, wrap layers in positioned View; same for `def.anchor === 'SEAT'` with `anchorBounds.seatByIndex[payload.anchorSeat]`; else full-screen fallback.
3. **Companion resolution:** In overlay, when setting active slots from a request, call `resolveAnimationWithCompanions(request)` → `{ table: def, hero?: def }`. If hero def returned, set both TABLE and HERO slots.
4. **Hero aura def:** Add `resolveHeroAuraDefinition(event, tier)` returning a HERO def when event ALL_IN and tier >= 3; layers RING + PARTICLES. Wire into companion resolution.
5. **STREAK layer:** animationTypes add `STREAK`; AnimationLayerStreak component; renderAnimationLayer; add STREAK to allIn tier 4 (and optionally potWin tier 4).
6. **Seat glow:** AnimationLayerSeatGlow; SEAT def for SHOWDOWN when anchorSeat; resolve companion for SEAT when payload.anchorSeat != null; overlay position by seat bounds.

---

## Files to touch

| Area | Files |
|------|--------|
| Types | `animationTypes.ts` (AnchorBounds, Rect; STREAK) |
| Overlay | `TableAnimationOverlay.tsx` (anchorBounds prop, positioning, companion resolution) |
| Registry | `animationRegistry/index.ts` (resolveAnimationWithCompanions), new `heroAura.ts` or in shared |
| Layers | `AnimationLayerStreak.tsx`, `AnimationLayerSeatGlow.tsx`, `layers/index.ts` |
| Render | `renderAnimationLayer.tsx` (STREAK, SeatGlow) |
| Constants | `animationConstants.ts` (defaults for streak) |
