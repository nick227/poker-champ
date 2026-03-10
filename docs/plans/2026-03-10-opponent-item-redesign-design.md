# Opponent Item Redesign — Design

**Date:** 2026-03-10  
**Status:** Draft for approval  
**Scope:** Single opponent tile in the strip (avatar + meta + cards); layout and spacing only.

---

## 1. Goals

- **Layout:** Stack avatar above meta (no side-by-side row). Cards sit on top of the avatar; they overlap the avatar’s top only and never clip into the meta block.
- **Avatar:** 50% larger than current (56 → 84px).
- **Cards:** Rotate ±15° away from each other, tightened; content width derived from the horizontal span of the card tips after transform; that width drives avatar and meta width for alignment.
- **Quality:** AAA-style alignment and hierarchy; all key spacing values in one place for easy tuning.

---

## 2. Inventory & flat layout diagram

**Inventory (all items in visual order):**

*Player’s cards = only items 2–4 (Cards layer). There is no separate “cards dock” in the meta block in this redesign.*

| # | Item | Notes |
|---|------|--------|
| 1 | Tile (shell) | Outer container; active state, data attrs |
| 2 | Cards layer | Absolute; holds the two player cards (fan); z above avatar |
| 3 | Left card | Player’s left card; rotated −15° |
| 4 | Right card | Player’s right card; rotated +15° |
| 5 | Avatar block | Centered in content width |
| 6 | Avatar image | Circle, AVATAR.SIZE |
| 7 | Meta block | Same width as content width |
| 8 | Name row | Name + dealer button |
| 9 | Name text | Opponent name (+ [BOT]) |
| 10 | Dealer button | Optional; space always reserved in name row |
| 11 | Stack row | Stack amount |
| 12 | Stack text | Formatted cents |
| 13 | Footer row | Action dock only (no cards dock in redesign) |
| 14 | Action dock | Status/action label |
| 15 | Action text | Fold / All in / etc. |
| 16 | Turn bar track | Optional; at bottom of tile |
| 17 | Turn bar fill | Progress width 0–100% |
| 18 | Pot win ring | Optional; when winner |
| 19 | Pressable / View | Wrapper for tap or static |

**Flat layout diagram (stack, top → bottom):**

```
┌─ Tile ─────────────────────────────────────┐
│  ┌─ Cards layer (absolute, over avatar) ──┐  │
│  │   left card (−15°)    right card (+15°)│  │
│  └────────────────────────────────────────┘  │
│  ┌─ Avatar block ─────────────────────────┐  │
│  │           [ Avatar image ]             │  │
│  └────────────────────────────────────────┘  │
│  ┌─ Meta block ──────────────────────────┐  │
│  │  Name row:    [ Name text ] [ Dealer ] │  │
│  │  Stack row:   [ Stack text ]           │  │
│  │  Footer row:  [ Action dock ]           │  │
│  └────────────────────────────────────────┘  │
│  ┌─ Turn bar (optional) ──────────────────┐  │
│  │  [ Turn bar fill ]                     │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
     Pot win ring (optional, overlays tile)
```

---

## 3. Layout structure (stack)

**Visual order (top → bottom):**

1. **Cards layer** — Absolutely positioned over the avatar. Cards overlap the avatar’s top only (see `CARDS_AVATAR_OVERLAP_PX`); they never extend into or get clipped by the meta block. Z-index above avatar.
2. **Avatar block** — Centered circle; width/height = new avatar size (84px). Same width as content width (see §5).
3. **Meta block** — Name row, stack, action text. Same content width as avatar; directly below avatar with a small, tunable gap. No `overflow: hidden` or mask on the meta block.

**Content width** is the single source of truth: it is the computed horizontal span of the two rotated cards plus a tunable gap (§5). Avatar and meta both use this width so everything aligns.

---

## 4. Card fan (rotation + tightening)

- **Rotation:** Left card −15°, right card +15° (fan “away” from each other).
- **Tightening:** Reduce horizontal gap between card centers (e.g. `CARD_FAN_GAP` in layout) so the pair reads as one hand; value tuned in layout constants.
- **Positioning:** Cards layer overlaps the top of the avatar only; the overlap amount is `CARDS_AVATAR_OVERLAP_PX`. Cards never clip into the meta block.
- **Scale:** Cards can keep current scale logic (fit in viewport) or use a single scale derived from content width; recommend one scale constant for this item so the fan math stays simple.

---

## 5. Content width (card tips → avatar & meta)

- **Formula:** For one card of width `W`, height `H`, rotated by angle `θ` (radians), the horizontal projection is  
  `W * |cos θ| + H * |sin θ|`.  
  For ±15° and two cards with center gap `G`, the total horizontal span is  
  `contentWidth = G + (W * cos(15°) + H * sin(15°))`  
  (using the same projection for both cards).
- **Constants:** `W` and `H` come from the card dimensions used in this item (e.g. from `getCardDimensions(scale)`). `G` = `CARD_FAN_GAP` (tunable). So:
  - `contentWidth = CARD_FAN_GAP + (cardWidth * cos(15°) + cardHeight * sin(15°))`
- **Usage:**
  - **Avatar:** Container width = `contentWidth`; avatar circle diameter = `AVATAR.SIZE` (84). Avatar is centered in the `contentWidth` column.
  - **Meta:** Width = `contentWidth`; content (name, stack, action) laid out within that width.
- **Developer tuning:** Export `contentWidth` (or a `getOpponentItemContentWidth()` helper) from the opponent-item layout module so avatar and meta styles/sizes can use it. All magic numbers (15°, gap, overlap, avatar size) live in one layout file.

---

## 6. Layout constants (developer-friendly)

Single module (e.g. `opponent-item/layout.ts` or a dedicated section in `opponent-strip/layout.ts`) with frozen constants, for example:

| Constant | Purpose | Example |
|----------|--------|--------|
| `AVATAR.SIZE` | Circle diameter (50% up from 56) | 84 |
| `CARD_FAN_ANGLE_DEG` | Rotation per card (degrees) | 15 |
| `CARD_FAN_GAP` | Horizontal gap between card centers | tunable (e.g. 8–16) |
| `CARDS_AVATAR_OVERLAP_PX` | How far the cards layer overlaps the top of the avatar (avatar only; never into meta) | tunable |
| `AVATAR_META_GAP` | Vertical gap between avatar and meta block | tunable |
| `META_ROW_HEIGHT` | Fixed height for each of the three meta rows (name, stack, footer); rows never collapse | tunable |
| `META_PADDING_H`, `META_PADDING_V` | Meta block padding | tunable |

**Rules:**

- **Dealer button space always reserved:** Space for the dealer button in the name row is always reserved (fixed width or min-width), whether or not the opponent is dealer, so layout does not shift when the button appears or disappears.

Derived:

- `contentWidth` from card dimensions + `CARD_FAN_GAP` + fan angle (see §5).
- Avatar and meta both use `contentWidth` for alignment.

Styles (opponent-strip or opponent-item) reference these constants only, so changing spacing or size is a one-place edit.

---

## 7. Component / file impact

- **OpponentStripItemView:** Structure becomes a column: cards layer (absolute) → avatar block → meta block. No `contentRow`; avatar and meta are full-width within `contentWidth`.
- **OpponentCardsView (or new cards slot):** Receives layout that applies ±15° rotation and tightened gap; positioning so the cards layer overlaps the avatar top only (`CARDS_AVATAR_OVERLAP_PX`), never into meta.
- **Layout:** New or extended layout module with constants above and `getOpponentItemContentWidth()` (or equivalent) so styles stay DRY and tunable.
- **Styles:** Replace current row/column flex and fixed sizes with layout-driven values (content width, avatar size, gaps). Keep turn bar, pressable, and active state behavior; only layout and spacing change.

---

## 8. Out of scope (this design)

- Copy or content changes.
- New props or view model fields (except any needed for layout).
- Strip-level scroll/layout (CONTAINER, ROW in opponent-strip unchanged unless we need different item height).
- Animation or motion design (can be added later).

---

## 9. Approval checkpoint

If this structure (stack order, 50% avatar, ±15° fan, content width from card tips, single layout constants file) matches what you want, we can lock this as the design and move to an implementation plan (tasks, file-by-file steps, and tests). Any section you’d like to change (e.g. rotation angle, where constants live, or recess behavior)?
