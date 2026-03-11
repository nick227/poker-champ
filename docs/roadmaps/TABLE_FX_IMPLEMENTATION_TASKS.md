# Table FX — Implementation Task List (New Concepts)

Ordered implementation tasks for all concepts in [TABLE_FX_COMPONENT_EFFECTS.md](../proposals/TABLE_FX_COMPONENT_EFFECTS.md). No component changes (CommunityBoard, HeroZone, OpponentStripItemView untouched).

---

## 1. Types and contracts

| # | Task | Details |
|---|------|---------|
| 1.1 | **Add `plane` to layer definitions** | Optional `plane?: "BACKGROUND" \| "FOREGROUND"` on every layer type (procedural + ASSET). Default FOREGROUND when omitted. |
| 1.2 | **Add `BOARD` and `CARD` to AnimationAnchor** | `AnimationAnchor = "TABLE_CENTER" \| "HERO" \| "SEAT" \| "BOARD" \| "CARD"`. Update FX_ANCHOR map. |
| 1.3 | **Extend AnchorBounds** | Add `board?: Rect`. Add `cardSlots?: Rect[]` (indices 0..4) or `cardSlotByIndex?: Record<number, Rect>` for CARD anchor. |
| 1.4 | **Per-layer anchor and payload** | Layers get optional `anchor?: AnimationAnchor` and, for SEAT, `seatIndexFromPayload?: keyof payload` (e.g. `"winnerSeat"`). Definition-level `anchor` can remain as default for layers that omit it. |
| 1.5 | **ASSET layer: anchor + plane** | Ensure AssetLayerDefinition can carry optional `anchor` and `plane` (same as procedural). Already has `source`; no type change if anchor/plane live on a shared base or are optional on both procedural and asset defs. |

---

## 2. Anchor resolution

| # | Task | Details |
|---|------|---------|
| 2.1 | **Implement / extend getAnchorRect** | Input: layer (with anchor, seatIndexFromPayload), payload, anchorBounds. Return Rect or undefined. TABLE_CENTER → full overlay area or center rect; HERO → anchorBounds.hero; SEAT → seatByIndex[payload[seatIndexFromPayload]]; BOARD → anchorBounds.board; CARD → not a single rect (see 2.2). |
| 2.2 | **CARD anchor: multi-rect resolution** | For anchor === CARD, resolution returns multiple rects (one per slot) or overlay iterates anchorBounds.cardSlots and calls getAnchorRect per slot. Document: Option A = one layer instance per card slot; Option B = single BOARD layer with grid (no CARD rects). |
| 2.3 | **Enforce resolution order** | Every anchored layer: (1) resolve anchor rect(s), (2) if no rect, return null / skip layer, (3) clip container to rect, (4) render layer inside. Single code path; no one-off branches. |

---

## 3. Anchor FX renderer

| # | Task | Details |
|---|------|---------|
| 3.1 | **Add renderAnchoredFx helper** | `renderAnchoredFx({ rect, children, clip?: boolean })`: position absolute to rect, overflow hidden when clip true. Used for every anchored layer. |
| 3.2 | **Wire overlay to helper** | For each layer with anchor set: rect = getAnchorRect(...); if !rect return null; renderAnchoredFx(rect, renderLayer(layer)). Replace any duplicated rect/clip logic. |

---

## 4. Background and foreground planes

| # | Task | Details |
|---|------|---------|
| 4.1 | **Two-plane overlay structure** | Overlay renders two FX containers: background (behind table UI), foreground (in front). Table UI sits between them. |
| 4.2 | **Route layers by plane** | For each layer, read `plane ?? "FOREGROUND"`. Push layer output into background or foreground container. Same render path; only container differs. |
| 4.3 | **Z-order / stacking** | Ensure background container is behind table, foreground in front. No change to layer renderers; they stay unaware of plane. |

---

## 5. Table page / layout: provide bounds

| # | Task | Details |
|---|------|---------|
| 5.1 | **Measure and pass board bounds** | Table page (or layout wrapper) measures the community board area and passes `anchorBounds.board`, `hero`, `seatByIndex`, and optionally `cardSlots`. |
| 5.2 | **Coordinate space** | `anchorBounds` must be in **overlay coordinate space**. Prefer `measureLayout(overlayRef)` over `measureInWindow` when the overlay ref is available. |

---

## 6. Reduced motion

| # | Task | Details |
|---|------|---------|
| 6.1 | **Filter BURST in overlay** | When `settings.reducedMotion`, filter out layers with type BURST (in addition to existing PARTICLES and STREAK). Keep FLASH, RADIAL_GLOW, RING, GLOW, HALO, TEXT. Single filter in overlay; no per-layer logic. |

---

## 7. ASSET layer: anchor + plane behavior

| # | Task | Details |
|---|------|---------|
| 7.1 | **ASSET uses same resolution** | When rendering ASSET layer: use same getAnchorRect and renderAnchoredFx. If anchor set, clip asset (video/Lottie) to resolved rect; if TABLE_CENTER, full area. |
| 7.2 | **ASSET respects plane** | ASSET layers go to background or foreground container by layer.plane (default FOREGROUND). No special case. |

---

## 8. Registry and presets (MVP behavior)

| # | Task | Details |
|---|------|---------|
| 8.1 | **POT_WIN: BOARD glow + SEAT ring** | Add layers: GLOW with `anchor: "BOARD"`; RING with `anchor: "SEAT"`, `seatIndexFromPayload: "winnerSeat"`. Optionally one GLOW with `plane: "BACKGROUND"` for atmosphere. |
| 8.2 | **SHOWDOWN: BOARD glow** | Add GLOW with `anchor: "BOARD"`. No seat ring unless desired. |
| 8.3 | **ALL_IN: HERO ring** | Add RING with `anchor: "HERO"` when payload.isHero (or via derived state in registry). |
| 8.4 | **Definition composition** | Author definitions with three categories in mind: background atmosphere (plane BACKGROUND), moment impact (FLASH, BURST, PARTICLES, TEXT), localized accents (GLOW/ RING with anchor BOARD/HERO/SEAT). |

---

## 9. CARD anchor and flashing outline (optional order)

| # | Task | Details |
|---|------|---------|
| 9.1 | **Option A: CARD anchor** | Implement CARD in getAnchorRect (return one rect per slot or iterate in overlay). For each card slot, render one layer (e.g. RING or small outline) clipped to slot rect. Enables flashing outline per community card, later winning-card highlight. |
| 9.2 | **Option B: BOARD grid** | Single layer with anchor BOARD; draw repeating outline/grid aligned to card positions from layout. Simpler; less flexible. |
| 9.3 | **Flashing outline asset or procedural** | Define a short “card outline” effect (procedural RING or ASSET) and attach to CARD slots (Option A) or BOARD grid (Option B). |

---

## 10. Reactive table atmosphere (later)

| # | Task | Details |
|---|------|---------|
| 10.1 | **Persistent FX state input** | Add a second source of “active definition” or “atmosphere definition” alongside event-triggered request (e.g. from game phase or time). Overlay can run one event definition + one atmosphere definition (or blend). |
| 10.2 | **Atmosphere on background plane** | Atmosphere definitions use only BACKGROUND plane, low opacity, slow/long duration. Event FX remain FOREGROUND, short. |
| 10.3 | **Game state → atmosphere** | Map game state (e.g. pre-flop, post-flop, showdown, post-win) to an atmosphere definition id or preset. Optional: time-of-day for day/night transition. |

---

## Dependency order (suggested)

1. **Types (1.x)** → **Anchor resolution (2.x)** → **renderAnchoredFx (3.x)** → **Overlay planes (4.x)** → **Table page bounds (5.1)** → **Reduced motion (6.1)** → **ASSET behavior (7.x)** → **Registry MVP (8.x)**.  
2. **CARD (9.x)** after BOARD and overlay are in place; **Reactive atmosphere (10.x)** after planes and registry are stable.

---

## Progress (implemented)

- **1.1–1.4** Types: plane, BOARD/CARD anchor, AnchorBounds.board/cardSlots, per-layer anchor + seatIndexFromPayload.
- **2.1, 2.3** getAnchorRect extended for BOARD; getAnchorRectForLayer(layer, def, payload, anchorBounds) with per-layer anchor and fallback; TABLE_CENTER → undefined; SEAT/HERO/BOARD → skip when no rect.
- **3.1–3.2** renderAnchoredFx(rect, children, clip); overlay uses it for layers with resolved rect.
- **4.1–4.3** Two-plane overlay: background (zIndex 99) and foreground; layers split by plane ?? "FOREGROUND".
- **5.1** Done: table page has anchorBounds state, reportBoardBounds(rect), BoardBoundsReporter measures board via measureInWindow; overlay receives renderModel.anchorBounds.
- **6.1** Reduced motion: BURST filtered in overlay.
- **7.x** ASSET uses same layer types; no special-case needed (anchor/plane on layer).
- **8.1** POT_WIN: appendLayers with RADIAL_GLOW anchor BOARD + RING anchor SEAT seatIndexFromPayload "winnerSeat" (tiers 1–4).
- **9.1** CARD anchor: getCardSlotRects(anchorBounds); overlay renders layer once per cardSlots[] when effectiveAnchor === CARD.
- **10.x** Reactive atmosphere: overlay accepts optional atmosphereLayers prop; renders on background plane (zIndex 99) with reduced-motion filter; theme defaults to POT_WIN.

---

## Non-tasks (explicitly out of scope)

- **No changes** to CommunityBoard, HeroZone, OpponentStripItemView (no FX logic, no layout change).
- **No new context** for components; overlay remains sole consumer of request and atmosphere state.
