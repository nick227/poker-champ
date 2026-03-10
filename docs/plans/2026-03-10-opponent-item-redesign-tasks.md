# Opponent Item Redesign — Implementation Task List

**Date:** 2026-03-10  
**Design:** [2026-03-10-opponent-item-redesign-design.md](./2026-03-10-opponent-item-redesign-design.md)  
**Scope:** Implement the redesign; keep all layout and spacing tunable in one place for future changes.

---

## Principles for future changes

- **Single layout module:** All sizes, gaps, and derived values (e.g. content width) live in `opponent-item/layout.ts`. No magic numbers in components or styles.
- **Styles consume constants only:** StyleSheet values come from the layout module (or tokens). Changing a constant is the only edit needed to tweak spacing/size.
- **No meta clipping:** Meta block never uses `overflow: hidden` or a mask; cards overlap avatar only.
- **Fixed meta rows:** Name, stack, and footer rows use `META_ROW_HEIGHT` so they never collapse when content changes.
- **Reserved dealer space:** Name row always reserves space for the dealer button so layout is stable when dealer changes.

---

## Phase 1: Layout module (single source of truth)

- [ ] **1.1** Add `opponent-item/layout.ts` (or extend opponent-strip layout with an OPPONENT_ITEM section).
- [ ] **1.2** Define and export frozen constants:
  - [ ] `AVATAR.SIZE` = 84
  - [ ] `CARD_FAN_ANGLE_DEG` = 15
  - [ ] `CARD_FAN_GAP` (tunable, e.g. 12)
  - [ ] `CARDS_AVATAR_OVERLAP_PX` (tunable)
  - [ ] `AVATAR_META_GAP` (tunable)
  - [ ] `META_ROW_HEIGHT` (tunable; same for name, stack, footer)
  - [ ] `META_PADDING_H`, `META_PADDING_V` (tunable)
  - [ ] `DEALER_BUTTON_RESERVED_WIDTH` (min-width for dealer slot in name row)
- [ ] **1.3** Add `getOpponentItemContentWidth(cardScale?: number): number` (or equivalent) using design §5 formula: `CARD_FAN_GAP + (cardWidth*cos(15°)+cardHeight*sin(15°))`, with card dimensions from tokens/layout. Export for use in styles and positioning.
- [ ] **1.4** Document in the file that future spacing/size tweaks should only change this module (and optionally styles that reference it).

---

## Phase 2: Styles driven by layout

- [ ] **2.1** Add or move opponent-item styles to a file that imports only from `./layout` (and shared tokens). No hardcoded sizes for avatar, meta, or cards.
- [ ] **2.2** Tile/shell: use `contentWidth` from layout for width (or 100% of parent if strip controls width); no overflow/mask on meta block.
- [ ] **2.3** Cards layer: position absolute; bottom overlap with avatar top by `CARDS_AVATAR_OVERLAP_PX` only; z-index above avatar.
- [ ] **2.4** Avatar block: width = content width, height/alignment from layout; avatar circle diameter = `AVATAR.SIZE`.
- [ ] **2.5** Meta block: width = content width; padding from `META_PADDING_*`; no `overflow: hidden` or mask.
- [ ] **2.6** Name row, stack row, footer row: fixed height = `META_ROW_HEIGHT` (minHeight + height or explicit height so they don’t collapse).
- [ ] **2.7** Name row: reserve dealer space with `minWidth` or fixed width = `DEALER_BUTTON_RESERVED_WIDTH` for the dealer slot.
- [ ] **2.8** Turn bar, pressable, active state: keep behavior; sizes/positions from layout where applicable.

---

## Phase 3: Card fan (rotation + overlap)

- [ ] **3.1** Update card layout logic (in `useOpponentCardsLayout` or equivalent) to use ±`CARD_FAN_ANGLE_DEG` and `CARD_FAN_GAP` from layout.
- [ ] **3.2** Apply rotation: left card −15°, right card +15° (read from `CARD_FAN_ANGLE_DEG`).
- [ ] **3.3** Position cards layer so it overlaps the top of the avatar by `CARDS_AVATAR_OVERLAP_PX` only; ensure it never extends into the meta block (positioning/layout math only, no meta clipping).
- [ ] **3.4** Scale: use a single scale from layout or from `getOpponentItemContentWidth` so fan math stays simple and tunable.

---

## Phase 4: View structure (stack + inventory)

- [ ] **4.1** OpponentStripItemView: change structure to a single column (stack): cards layer → avatar block → meta block. Remove the current horizontal content row (avatar | meta).
- [ ] **4.2** Cards layer: render as first child, absolutely positioned over the avatar; contain only the two player cards (fan); no cards dock in meta.
- [ ] **4.3** Avatar block: second in stack; centered in content width; only avatar image inside.
- [ ] **4.4** Meta block: third in stack; three rows only — name row (name + reserved dealer slot), stack row, footer row (action dock only). All rows fixed height per layout.
- [ ] **4.5** Dealer button: render inside the reserved dealer slot; slot always exists with fixed/min width so layout doesn’t shift.
- [ ] **4.6** Turn bar: unchanged; at bottom of tile.
- [ ] **4.7** Pot win ring: unchanged; overlays tile when winner.

---

## Phase 5: Integration and verification

- [ ] **5.1** OpponentStrip (or parent) still passes same props to OpponentStripItem; no API change.
- [ ] **5.2** Verify content width drives both avatar and meta width (alignment matches design).
- [ ] **5.3** Verify meta block has no overflow/mask and cards never clip into meta.
- [ ] **5.4** Verify dealer button space is always reserved (no layout shift when dealer changes).
- [ ] **5.5** Quick visual pass: avatar 50% larger, cards fanned ±15°, overlap avatar top only, meta rows stable.

---

## Future-change checklist (when tweaking later)

When changing sizes or spacing later:

1. Prefer editing only `opponent-item/layout.ts` (constants and `getOpponentItemContentWidth`).
2. If adding a new spacing/size concept, add it to the layout module and reference it in styles.
3. Do not add `overflow: hidden` or a mask to the meta block to “fix” overlap.
4. Keep meta row heights fixed via `META_ROW_HEIGHT`; adjust the constant if row height needs to change.
5. Keep dealer button space reserved; change `DEALER_BUTTON_RESERVED_WIDTH` if the button size changes.
