# Table FX — Board / Hero / Seat Accents (Anchor-Based Overlay)

Proposal: add **board glow**, **hero accent**, and **winner-seat accent** so the table feels integrated during POT_WIN / SHOWDOWN / ALL_IN — **without touching any table components**.

**Chosen architecture:** Extend the existing **overlay anchoring system**. Treat these accents as overlay layers anchored to layout bounds. No context in components. No changes to CommunityBoard, HeroZone, or OpponentStripItemView.

---

## Non-negotiable: do not damage or change current UI

- **No layout impact:** FX must not change flex order, size, margin, padding, or position of existing UI.
- **No component changes:** CommunityBoard, HeroZone, OpponentStripItemView remain **untouched**. They stay pure UI with no FX awareness.
- **No new layout nodes in flow:** All new FX are overlay layers (absolute, clipped to anchor rects). See [TABLE_FX_COMPONENT_EFFECTS_RESEARCH.md](./TABLE_FX_COMPONENT_EFFECTS_RESEARCH.md) for layout-neutral patterns.

---

## Core idea: push anchored FX up into the overlay

**Before (rejected):** Components read context and render their own accents → FX logic and lifecycle scattered, component sprawl.

**After (chosen):** Overlay renders all FX, including accents, by **anchoring** them to bounds provided by the host:

```
Game event
    → Animation request (table-page owns, passes to overlay)
    → Overlay (onComplete clears request → single source of truth)
    → Resolve definitions → render layers by plane
    → BACKGROUND plane: TABLE_CENTER | BOARD | HERO | SEAT | CARD (same anchors)
    → Table UI
    → FOREGROUND plane: TABLE_CENTER | BOARD | HERO | SEAT | CARD
```

**Result:** Zero component coupling. All FX logic stays in one place: animationRegistry, overlay, layers, theme.

---

## Lifecycle: driven by overlay, not just request presence

- **Table page** owns `activeFxRequest` (e.g. from renderModel).
- **Table page** passes the same `request` to the overlay and clears it in `onComplete`.
- **Overlay** is the only consumer of the request. There is no separate “context” that components read; the overlay’s active run **is** the FX state.
- Anchored layers (board glow, hero ring, seat halo) are part of the same definition run: they start and end with the overlay. No drift.

So: **context is not used for component FX** — we don’t add one. Any “derived” state (event, theme, highlightBoard, winnerSeatIndex, heroAccent) lives **inside the overlay/registry** to decide which layers to run and how to parameterize them (e.g. which seat index for a RING layer with `anchor: "SEAT"`).

---

## Separate visual layer type from anchor

Avoid mixing visual type with anchor purpose (e.g. BOARD_GLOW, AVATAR_RING, SEAT_HALO). That would multiply layer types as FX grows. Instead:

- **Visual layer types** — GLOW, RING, HALO, PARTICLES, FLASH, ASSET, … (reuse or add as needed). Describe *what* is drawn.
- **Anchor** — TABLE_CENTER, BOARD, HERO, SEAT, CARD. Describe *where* it is drawn.
- **Plane** — `"BACKGROUND" | "FOREGROUND"`; **default: FOREGROUND.** Which stacking plane the layer renders on. Planes are a **property of layers**, not of layer types: particles, bursts, assets, and glows can all render on either plane. This prevents future duplication (e.g. BACKGROUND_PARTICLES vs FOREGROUND_PARTICLES).

A layer definition then combines type + anchor + optional plane + optional payload key (e.g. for SEAT):

**Example:**

```ts
{
  type: "RING",
  anchor: "SEAT",
  plane: "FOREGROUND", // default
  seatIndexFromPayload: "winnerSeat",
  durationMs: 600,
  delayMs: 100,
}
```

Instead of a dedicated `SEAT_HALO` type. Same RING visual can be used with `anchor: "BOARD"` or `anchor: "HERO"` without new layer types.

**Benefits:** Fewer layer types, more composability (e.g. GLOW on BOARD, RING on HERO, HALO on SEAT), same types on either plane; easier to add future FX.

---

## Defaults

Define defaults explicitly so minimal layers are unambiguous. Future contributors see the full picture.

| Property | Default |
|----------|---------|
| `plane` | `"FOREGROUND"` |
| `anchor` | `"TABLE_CENTER"` |
| `clip` | `true` (for anchored layers) |
| `delayMs` | `0` |

So a minimal layer:

```ts
{ type: "FLASH" }
```

means:

```ts
{
  type: "FLASH",
  plane: "FOREGROUND",
  anchor: "TABLE_CENTER",
  clip: true,
  delayMs: 0,
}
```

Apply these when resolving layers (before render). Prevents ambiguity later.

---

## Anchors

### Current + BOARD

- **AnimationAnchor:** `"TABLE_CENTER" | "HERO" | "SEAT" | "BOARD" | "CARD"` (CARD for per-slot community card effects; see below).
- **AnchorBounds:** `hero?`, `seatByIndex?`, `board?: Rect`, and for CARD e.g. `cardSlots?: Rect[]` (indices 0..4). Host measures board and card slots and passes bounds.

### Overlay resolution

- **Per-layer anchor:** A layer in a definition can specify `anchor` (and for SEAT, `seatIndexFromPayload` e.g. `"winnerSeat"` or `"anchorSeat"`). Overlay resolves the rect via `getAnchorRect(layer, payload, anchorBounds)` (or equivalent: anchor + payload → rect).
- Extend resolution: `anchor === BOARD` → `anchorBounds.board`; SEAT → `seatByIndex[payload[seatIndexFromPayload]]`; CARD → for per-slot effects, overlay iterates `anchorBounds.cardSlots` and renders one layer per slot (e.g. RING clipped to each card rect).

**Anchor resolution order** (guarantees all anchored layers behave identically; prevents one-off logic):

1. Resolve anchor rect.
2. Clip container (to that rect).
3. Render layer (inside the clipped container).

Pseudocode:

```ts
const rect = getAnchorRect(layer, payload, anchorBounds);
if (!rect) return null;
renderAnchoredFx(rect, renderLayer(layer));
```

**Anchor fallback when resolution fails:** If layout bounds are missing or invalid, avoid runtime weirdness by skipping the layer (do not render at origin or full-screen).

- **SEAT** → skip layer if `seatByIndex` or payload index missing.
- **HERO** → skip layer if `anchorBounds.hero` missing.
- **BOARD** → skip layer if `anchorBounds.board` missing.
- **CARD** → skip layer (or per-slot) if `anchorBounds.cardSlots` missing.
- **TABLE_CENTER** → always valid (full overlay or center rect; no bounds required).

### Anchor: CARD (per-card effects, e.g. flashing outline)

For effects like a **flashing outline on each community card**, keep FX in the overlay and target position, not the component.

**Option A — Per-card anchors (best long-term)**

- Add anchor type **CARD** (or CARD_SLOT).
- **AnchorBounds:** e.g. `cardSlots?: Rect[]` or `cardSlotByIndex?: Record<number, Rect>` for indices 0..4 (flop1, flop2, flop3, turn, river).
- Overlay renders one layer per slot (e.g. RING or a small CARD_RING-style visual) clipped to each rect. Gives maximum flexibility: winning card highlight, river explosion, card sparkles later.

**Option B — Board mask / grid (simpler MVP)**

- Use one overlay layer with **anchor: BOARD**.
- Render a repeating grid or outline boxes inside the board rect, aligned to known card positions (layout-derived). Single layer, one rect.
- Pros: very easy. Cons: less flexible than per-slot anchors.

Recommendation: add CARD + `anchorBounds.cardSlots` when you implement flashing outline; use Option B only if you want the smallest MVP and can align a single board layer to card positions.

---

## Derived FX state (internal to overlay/registry)

Components do **not** consume this. The overlay (or a small helper used when building definitions) can derive:

- **event** — from request.event
- **theme** — `getAnimationTheme(request.event)`
- **highlightBoard** — e.g. event === POT_WIN || event === SHOWDOWN
- **heroAccent** — e.g. event === ALL_IN && payload?.isHero, or POT_WIN winner is hero
- **winnerSeatIndex** — payload.winnerSeat (or equivalent)

Use this to:

- Decide which **companion** definitions to run (e.g. TABLE + GLOW on BOARD + RING on SEAT for POT_WIN), or
- Attach the right layers to the main definition with the right `type`, `anchor`, and payload keys (e.g. `seatIndexFromPayload: "winnerSeat"`).

So: one place derives “should we show board glow / hero ring / seat halo and for which seat.” No duplication in components.

---

## Channel rule

- **Table components** are not reacting to anything; they are unchanged.
- **Overlay** continues to respect channels (TABLE, HERO, SEAT). For “component-like” accents (board, hero, seat), recommend:
  - Table-wide moments (POT_WIN, SHOWDOWN): run GLOW on BOARD (and RING on SEAT for winner) as part of the **TABLE** channel definition (or as companions), so they start/end with the main table FX.
  - ALL_IN hero aura: already has HERO channel; add RING (or HALO) with `anchor: "HERO"` there.
- So: board/hero/seat accents are **layers inside existing (or extended) definitions**, not a new channel. Optionally document that “anchored board/seat effects follow TABLE channel semantics” so we don’t light the board for HERO-only or SEAT-only effects unless intended.

---

## Definition composition

FX definitions are composed of **three categories of layers**: background atmosphere, moment impact, and localized accents. This mental model makes authoring easier.

**Example POT_WIN:**

```ts
layers: [
  { type: "GLOW", plane: "BACKGROUND" },
  { type: "FLASH" },
  { type: "BURST" },
  { type: "PARTICLES" },
  { type: "TEXT" },
  { type: "GLOW", anchor: "BOARD" },
  { type: "RING", anchor: "SEAT", seatIndexFromPayload: "winnerSeat" },
]
```

(Defaults: layers without `plane` are FOREGROUND; without `anchor` are TABLE_CENTER.)

**Layer ordering:** Layers render in **array order within each plane**. Order matters when stacking effects (e.g. glow under flash under text). Same rule for both event and ambient definitions.

Example — this order is respected:

```ts
layers: [
  { type: "GLOW", plane: "BACKGROUND" },
  { type: "FLASH" },
  { type: "BURST" },
  { type: "PARTICLES" },
  { type: "TEXT" },
]
```

---

## Layer presets (optional)

Add an optional **preset** property to layer definitions so designers reference named visual patterns instead of repeating parameters everywhere. Reduces copy-paste, parameter drift, and makes global tuning trivial.

**Concept:** Reusable layer configurations (e.g. `particleBurst`, `softGlow`, `seatHalo`, `boardPulse`). A layer specifies `preset: "burst"` and the system merges preset defaults with the layer at resolution time.

**Resolution:**

```ts
resolvedLayer = { ...FX_PRESETS[layer.preset], ...layer }
```

So layer wins over preset when both set a property. Example:

```ts
{ type: "PARTICLES", preset: "burst", delayMs: 100 }
```

expands to (assuming preset defines count, spread, velocity):

```ts
{ type: "PARTICLES", count: 12, spread: 50, velocity: 200, delayMs: 100 }
```

**Example preset registry (visual defaults only):**

```ts
const FX_PRESETS = {
  burst: { particleCount: 12, particleSpread: 50 },
  ambientDrift: { particleCount: 8, opacity: [0.2, 0.25] },
  halo: { /* strokeWidth, pulse, etc. */ },
  winBurst: { rays: 16, durationMs: 600 },
  headlineWin: { textSize: "hero", textGlow: true },
};
```

**Important rule:** Presets define **visual defaults only**, not behavior. Allowed: color, spread, velocity, opacity, strokeWidth, durationMs, etc. **Not allowed in presets:** anchor, plane, seatIndexFromPayload (or any payload mapping). Those remain explicit on the layer so placement and behavior stay clear.

**POT_WIN with presets (readable, easy to tune):**

```ts
layers: [
  { type: "GLOW", preset: "ambientGold", plane: "BACKGROUND" },
  { type: "FLASH", preset: "impact" },
  { type: "BURST", preset: "winBurst" },
  { type: "PARTICLES", preset: "goldBurst" },
  { type: "TEXT", preset: "headlineWin" },
  { type: "RING", preset: "seatHalo", anchor: "SEAT", seatIndexFromPayload: "winnerSeat" },
]
```

Authoring becomes: **layer type + preset + anchor + plane** instead of long parameter blocks. Minimal implementation: add optional `preset?: string` to layer definitions; merge during resolution (build time or at overlay entry). No changes to runtime architecture.

---

## MVP behavior (first release)

- **POT_WIN** → TABLE layers (flash/burst/text/…) + **GLOW** with `anchor: "BOARD"` + **RING** with `anchor: "SEAT"` and `seatIndexFromPayload: "winnerSeat"`.
- **SHOWDOWN** → TABLE layers + **GLOW** with `anchor: "BOARD"` only (no seat ring in MVP if not needed).
- **ALL_IN** → TABLE layers + **RING** (or HALO) with `anchor: "HERO"` when desired (e.g. when payload.isHero). Keep existing hero aura if present.

Keeps behavior understandable and avoids duplicate animation engines.

---

## ASSET anchoring (prefab / webm / Lottie)

Complex animations (e.g. board glow prefab, hero win webm or Lottie) stay in the overlay: **anchor + ASSET layer**, clipped to resolved rect. No FX in components.

**ASSET layers obey the same anchor + plane rules as procedural layers.** Same resolution order (resolve rect → clip container → render); same `plane: "BACKGROUND" | "FOREGROUND"` (default FOREGROUND).

**Examples**

- Hero win (foreground, anchored to hero):

```ts
{ type: "ASSET", source: "hero-win.webm", anchor: "HERO", plane: "FOREGROUND" }
```

- Background ambience (no anchor, table-wide):

```ts
{ type: "ASSET", source: "gold-sweep.webm", plane: "BACKGROUND" }
```

- Prefab over board: `{ type: "ASSET", anchor: "BOARD", source: "board-glow.webm" }` — clipped to `anchorBounds.board`. Overlay resolves rect via `getAnchorRect`, then renders the asset inside that rect. Theme and channels apply as for GLOW/RING.

---

## Keep PotWinRing; add overlay accent path

- **Do not** replace PotWinRing in components immediately.
- Add the new theme-driven accents as **overlay-only** layers: RING (or HALO) with `anchor: "HERO"` and `anchor: "SEAT"` + `seatIndexFromPayload: "winnerSeat"`.
- Once stable, we can optionally merge/replace PotWinRing with overlay-driven accent so winner readability stays high without duplicating logic.

---

## Component FX ownership rule

- Accents are **event-reactive** and **theme-reactive**.
- They do **not** get separate per-component registry definitions; they are **layers in existing event/tier definitions**, with visual type (GLOW, RING, HALO) + anchor (BOARD, HERO, SEAT) and optional payload key (e.g. `seatIndexFromPayload: "winnerSeat"`).
- No bespoke timing in components: overlay owns start/stop; layer components use simple opacity/scale and theme color, and can share a small util (e.g. `useFxPulse()`) inside the overlay layer layer code only.

---

## Reduced motion compatibility

Since more FX (including anchored GLOW/RING) are being introduced, reduced-motion behavior is defined **now** and applied **centrally in the overlay**.

**Rule when `settings.reducedMotion` is true:**

- **Skip** PARTICLES (and STREAK).
- **Skip** burst scaling: do not run BURST layer (or run it with no scale animation; simplest is to drop the layer).
- **Keep** only glow and text: FLASH, RADIAL_GLOW, RING, GLOW, HALO, TEXT. These are low-motion (opacity/soft glow) or essential (headline/amount).

**Pseudocode (overlay):**

```ts
if (settings.reducedMotion) {
  // Already: tier clamped to min(tier, 1)
  layers = def.layers.filter((l) =>
    l.type !== "PARTICLES" &&
    l.type !== "STREAK" &&
    l.type !== "BURST"
  );
  return layers.length > 0 ? layers : def.layers;
}
```

**Handled centrally in the overlay** — no per-layer or per-component logic. New anchored layers (GLOW, RING, HALO) are kept in reduced motion since they are glow-like and low-motion.

---

## Implementation summary

| Area | Change |
|------|--------|
| **animationTypes** | Add anchor `BOARD` (and reserve CARD_SLOT for later). Extend `AnchorBounds` with `board?: Rect`. Layer definitions: add optional `anchor` per layer and `seatIndexFromPayload` for SEAT. Reuse or add visual types GLOW, RING, HALO as needed (no compound types like BOARD_GLOW). |
| **TableAnimationOverlay** | Resolve rect per layer from `anchor` + payload + `anchorBounds` (extend for BOARD; SEAT uses `seatIndexFromPayload`). Pass rect into layer renderer for anchored layers. **Reduced motion:** filter out PARTICLES, STREAK, BURST; keep FLASH, RADIAL_GLOW, RING, GLOW, HALO, TEXT. No context API. |
| **renderAnimationLayer** | For layers with `anchor` !== TABLE_CENTER: render existing RING/FLASH/… (or new GLOW/HALO) clipped to the resolved rect; simple opacity/scale + theme color. |
| **animationRegistry / definitions** | Add layers with `type: "GLOW"|"RING"|…`, `anchor: "BOARD"|"HERO"|"SEAT"`, and `seatIndexFromPayload` where needed; use derived state in one place when building or resolving definitions. |
| **Table layout / table page** | Measure board bounds and pass `anchorBounds.board` along with `hero` and `seatByIndex`. |
| **CommunityBoard, HeroZone, OpponentStripItemView** | **No changes.** |

---

## Why this is better

1. **Zero component coupling** — No FX logic or context in table UI.
2. **Single FX system** — Same overlay, same lifecycle, same theme; only anchors and layer types expand.
3. **No layout impact** — All new nodes are overlay layers clipped to bounds.
4. **Easier to extend** — Future effects (seat explosions, card highlights, chip bursts) = new overlay layers + anchors; table UI stays untouched.
5. **Aligned with common practice** — Many games keep FX in one overlay engine and anchor it to UI elements; UI stays clean.

---

## Anchor FX renderer pattern

**Problem:** As anchored effects grow (GLOW on BOARD, RING on SEAT/HERO, later CARD_HIGHLIGHT, CHIP_BURST), `renderAnimationLayer()` could become a large switch with repeated rect/clipping/positioning logic. **Solution:** One reusable renderer for all anchored FX.

**Concept:** layer → resolve anchor rect (from layer.anchor + payload + anchorBounds) → render inside clipped container via `renderAnchoredFx({ rect, children })`. All clipping and absolute positioning live in the helper; layer renderers only draw the visual.

**Example helper:**
```ts
function renderAnchoredFx({ rect, children, clip = true }: { rect: Rect | undefined; children: React.ReactNode; clip?: boolean }) {
  if (!rect) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.width, height: rect.height, overflow: clip ? "hidden" : "visible" }}>
      {children}
    </View>
  );
}
```
When a layer has `anchor` set: resolve rect, then `renderAnchoredFx({ rect, children: <GlowLayer /> })` or `<RingLayer />`. No per-type clipping. **Benefits:** overlay stays tiny; clipping centralized; new FX = new layer renderer + definition; enforces layout-neutral rule. **Optional:** per-layer `clip: true` (default) or `clip: false`; helper sets `overflow` accordingly. **Overlay structure:** Overlay → resolve layer and anchor rect → if anchored use renderAnchoredFx(rect, content), else default container → layer renderer. With **CARD** anchor, effects like flashing outline per card, winning card highlight, or river glow stay "more layers + bounds"; the FX system stays small and stable.

---

## Background and foreground planes

**Core rule:** Every FX layer can render on either plane. Same renderer, same lifecycle, same theme, same anchors. The only difference is where it sits in the stack and how designers tend to use it.

**Render stack**

```
Background FX container
Table UI
Foreground FX container
```

- **Layer property:** `plane: "BACKGROUND" | "FOREGROUND"` (default FOREGROUND if omitted for backward compatibility).
- **Anchors** (TABLE_CENTER, BOARD, HERO, SEAT, CARD) work on **both** planes.

**Practical usage**

| Plane | Typical use | Tend to be |
|-------|-------------|------------|
| BACKGROUND | Atmosphere | Slower, larger, softer, lower opacity. Usually 0–2 layers (e.g. felt glow, ambient gold drift, color wash). |
| FOREGROUND | Moment impact | Short, bright, focused. Usually 3–6 layers (burst, flash, particles, text, seat halo, card glow). |

**Intentional pairing:** Occasionally pair layers across planes for depth (e.g. POT_WIN: background gold sweep + foreground burst/text). Do **not** mirror the same effect on both planes (e.g. burst on background and foreground).

**Implementation:** One additional concept — `plane`. Overlay renders two containers (background, foreground); each layer is placed in the correct container by `plane`. Everything else (definitions, resolution, anchors, reduced motion) stays identical.

---

## Event FX vs ambient FX (two sources)

The overlay renders layers from **two sources** feeding the same renderer:

1. **Event FX** — Short-lived animation definitions triggered by game events (POT_WIN, ALL_IN, SHOWDOWN). Start and end with the event; cleared on completion.
2. **Ambient FX** — Persistent atmosphere definitions (reactive table atmosphere). Driven by game state or time; can transition when state changes.

**Render order** (avoids ambiguity when both exist):

```
ambient background layers
event background layers
table UI
event foreground layers
```

Same planes, same anchors, same resolution; only the source of the definition differs.

---

## Reactive table atmosphere

The same architecture unlocks **continuous ambient FX** almost for free: instead of FX only playing on events, the table can have **persistent ambient states that respond to gameplay**.

Because we already have:

- background and foreground planes  
- anchors (TABLE_CENTER, BOARD, HERO, SEAT, CARD)  
- themes  
- event system  

we can add a **persistent FX state layer** alongside event-triggered definitions.

**What this means**

- The table can **subtly change mood** based on game state (e.g. pre-flop calm, showdown tension, post-win warmth).
- Ambient layers (soft glows, slow particles, color washes) can run continuously and transition when state changes — same overlay, same planes, same anchors; only the active “atmosphere” definition (or blend) changes.
- Optionally: schedule **slow transitions based on time** (e.g. day vs night) for a living-table feel.

Event FX remain short and punchy; atmosphere stays on the background plane, low-opacity and slow. No new systems — just another source of definitions (game state or time) feeding the same render pipeline.

---

## Summary

| Item | Description |
|------|-------------|
| **Approach** | Extend overlay anchoring (BOARD, HERO, SEAT, CARD). Separate **visual type** (GLOW, RING, HALO, ASSET, …) from **anchor**. Layer = type + anchor + optional seatIndexFromPayload + optional `plane` + optional `preset`. |
| **Defaults** | `plane`: FOREGROUND; `anchor`: TABLE_CENTER; `clip`: true; `delayMs`: 0. Apply when resolving; minimal `{ type: "FLASH" }` expands accordingly. |
| **Planes** | `plane: "BACKGROUND" \| "FOREGROUND"`. Stack: Background FX → Table UI → Foreground FX. Same system for both; background fewer/softer; foreground impact. Don't mirror same effect on both planes. |
| **Event vs ambient** | Two sources: (1) Event FX (short-lived), (2) Ambient FX (persistent atmosphere). Render order: ambient bg → event bg → table UI → event fg. |
| **Anchor fallback** | If resolution fails: SEAT, HERO, BOARD, CARD → skip layer; TABLE_CENTER → always valid. |
| **Layer ordering** | Layers render in array order within each plane. Order matters for composition. |
| **Presets** | Optional `preset?: string`; merge preset visual defaults with layer at resolution. Presets = visual only (no anchor, plane, payload). |
| **Lifecycle** | Table page owns request, passes to overlay, overlay onComplete clears; no context for components. |
| **Derived state** | event, theme, highlightBoard, heroAccent, winnerSeatIndex live in overlay/registry only; used to choose/parameterize layers. |
| **Components** | No changes. CommunityBoard, HeroZone, OpponentStripItemView stay unaware. |
| **MVP** | POT_WIN → GLOW on BOARD + RING on SEAT (winnerSeat); SHOWDOWN → GLOW on BOARD; ALL_IN → RING on HERO when desired. |
| **CARD anchor** | Per-card effects (e.g. flashing outline): Option A — CARD + `anchorBounds.cardSlots[0..4]`; Option B — BOARD with grid aligned to card positions (simpler MVP). |
| **ASSET anchoring** | Prefab/webm/Lottie: `type: "ASSET"`, anchor BOARD or HERO, `source`; clipped to resolved rect. |
| **PotWinRing** | Keep; add overlay-driven theme accent in parallel; merge/replace later if desired. |
| **Reduced motion** | Centrally in overlay: if `reducedMotion` → skip PARTICLES, STREAK, BURST; keep only glow/text (FLASH, RADIAL_GLOW, RING, GLOW, HALO, TEXT). |
| **Anchor FX renderer** | One helper `renderAnchoredFx({ rect, children, clip? })` for all anchored layers; overlay resolves rect then wraps layer content. Keeps overlay small, clipping centralized, new FX trivial; optional per-layer `clip`. |
| **Reactive atmosphere** | Same pipeline supports persistent ambient FX: game-state or time-driven definitions (e.g. mood by phase, day/night) on the background plane; no new systems, just another input to the overlay. |

This keeps the feature clean, reusable, and minimal: one place for FX, no component sprawl, no layout damage.
