# Table Page Layout and Heights

This document describes the vertical layout and height design of the poker table UI (`TableLayout.tsx` and its child components). Heights are fixed and additive so the layout stays **aligned across game states** (e.g. active vs waiting) and **nothing is clipped** (no reliance on `overflow: hidden`).

---

## Design principles

1. **Fixed heights for all sections**  
   Every section has an explicit height. Only one **flex middle** region uses `flex: 1` and wraps the game area; the game area itself has fixed height and is centered inside that flex. That keeps the same vertical rhythm whether it’s “your turn” or “waiting for your turn”.

2. **Heights add up**  
   Section heights are derived from their content (padding, rows, gaps). Constants are named and reused so the layout is predictable and easy to adjust.

3. **No clipping**  
   We avoid `overflow: hidden` on the table. Strip and action bar heights are chosen so two rows of opponents and the full action bar fit; for 7–9 opponents, the opponent strip scrolls inside its fixed height.

4. **Single source of truth**  
   All layout constants live in `apps/client/src/components/domain/table/constants/`. `layoutHeights.ts` re-exports section heights and defines `TOTAL_FIXED_HEIGHT` so TableLayout can compute `remaining = usableHeight - TOTAL_FIXED_HEIGHT` and degrade gracefully on small viewports.

5. **Safe area**  
   `useSafeAreaInsets()` is used so top/bottom insets don’t break the math: `usableHeight = windowHeight - insets.top - insets.bottom`. Root has `paddingTop: insets.top`; the ActionBar container has `paddingBottom: insets.bottom`.

6. **No vertical auto-layout inside fixed blocks**  
   Inside any fixed-height section we avoid `flex: 1` and `justify-between`; we use rows with explicit heights and gaps so layout stays deterministic.

---

## TableLayout vertical stack

From top to bottom:

| Section            | Height (px) | Source / notes                          |
|--------------------|------------:|----------------------------------------|
| Title block        | 80          | `LAYOUT_TITLE_HEIGHT` (TableLayout)    |
| Top bar (balance)  | 52          | `LAYOUT_TOP_BAR_HEIGHT`                |
| Opponent strip     | 340         | `OPPONENT_STRIP_HEIGHT` (from OpponentStrip) |
| **Flex middle**   | flex: 1      | Single flex region; no dual spacers    |
| Game area         | 210         | `GAME_AREA_HEIGHT`, centered in flex   |
| Hero zone          | 200         | `HERO_ZONE_HEIGHT` (from HeroZone)     |
| Action bar         | 224         | `ACTION_BAR_HEIGHT` (from ActionBar)   |

**Total fixed height** (excluding flex middle):  
80 + 52 + 340 + 210 + 200 + 224 = **1106 px**

The two Spacers share the remaining viewport height equally (or by flex), so the middle “game” area stays centered and sections don’t drift when content changes.

---

## Section breakdown

### 1. Title block — 80 px

- **Constant:** `LAYOUT_TITLE_HEIGHT = 80` (TableLayout)
- **Content:** Table name (single line), then a row for blinds and “X / Y players”.
- **Layout:** Fixed-height container with `justify-center`; content is vertically centered within 80 px.

### 2. Top bar (TableTopBar) — 52 px

- **Constant:** `LAYOUT_TOP_BAR_HEIGHT = 52` (TableLayout)
- **Component:** Parent in TableLayout sets `height: 52`; TableTopBar uses `flex: 1` to fill the slot (single height authority).
- **Content:** Balance label + value, left/right slots (back, theme, avatar, etc.).

### 3. Opponent strip — 340 px

- **Constant:** `OPPONENT_STRIP_HEIGHT` exported from `OpponentStrip.tsx`.
- **Formula:**  
  `OPPONENT_STRIP_PADDING_V * 2 + OPPONENT_CHIP_HEIGHT * 2 + OPPONENT_ROW_GAP + OPPONENT_STRIP_BUFFER`  
  = 10×2 + 150×2 + 8 + 12 = **340 px**

| Inner constant               | Value | Role                                      |
|-----------------------------|------|-------------------------------------------|
| `OPPONENT_CHIP_HEIGHT`      | 150  | Height of one opponent chip               |
| `OPPONENT_ROW_GAP`          | 8    | Gap between two rows of chips             |
| `OPPONENT_STRIP_PADDING_V`  | 10   | Top/bottom padding inside the strip      |
| `OPPONENT_STRIP_BUFFER`     | 12   | Extra so two rows never clip (borders etc.)|
| `OPPONENT_CARD_ROW_HEIGHT`  | 44   | Reserved height for cards (scaled 0.62)    |
| `CHIP_GAP`                  | 4    | Vertical gap between elements inside chip |

- **Behavior:** Two full rows of opponent chips fit without clipping. For 7–9 opponents, a `ScrollView` inside the strip allows scrolling; the strip height stays 340 px.

### 4. Flex middle + Game area — 210 px (fixed inside flex)

- **Layout:** A single `<View style={{ flex: 1, justifyContent: "center" }}>` wraps the game area. No dual spacers.
- **Constant:** `GAME_AREA_HEIGHT = 210` (TableLayout)
- **Contains:** `DealerAnnounceBar` + `CommunityBoard`.
- **Rough split:** DealerAnnounceBar ~36 px (`h-9`), CommunityBoard uses the rest (~174 px) for cards row, pot, and padding.

### 5. Hero zone — 200 px

- **Constant:** `HERO_ZONE_HEIGHT = 200` exported from `HeroZone.tsx`.
- **Content:** Calculations strip (fixed 40 px), then hole cards + stack (+ optional dealer button). Root container has `height: HERO_ZONE_HEIGHT` so hero section height is stable across states.

### 6. Action bar — 224 px

- **Constant:** `ACTION_BAR_HEIGHT` exported from `ActionBar.tsx`.
- **Formula:**  
  `ACTION_BAR_PADDING*2 + STATUS_ROW_HEIGHT + ACTION_BAR_GAP*3 + BUTTONS_ROW_HEIGHT + BET_INPUT_ROW_HEIGHT + CHIPS_ROW_HEIGHT`  
  = 32 + 28 + 36 + 48 + 44 + 36 = **224 px**

| Inner constant           | Value | Role                          |
|--------------------------|------|-------------------------------|
| `ACTION_BAR_PADDING`     | 16   | Padding around content        |
| `STATUS_ROW_HEIGHT`      | 28   | “Your turn” / “Waiting…” line |
| `ACTION_BAR_GAP`         | 12   | Gap between rows              |
| `BUTTONS_ROW_HEIGHT`     | 48   | Fold / Check-Call / Bet row   |
| `BET_INPUT_ROW_HEIGHT`   | 44   | Bet input (always reserved)   |
| `CHIPS_ROW_HEIGHT`       | 36   | MIN, 1/2, POT, ALL IN         |

- **Behavior:** Bar is always 224 px; when actions are disabled, content is dimmed and non-interactive but the bar does not shrink or grow, so layout does not shift.

---

## Summary

- **Fixed sections:** Title 80, Top bar 52, Opponent strip 340, Game area 210, Hero zone 200, Action bar 224 → **1106 px**.
- **Flex:** One flex middle region (`flex: 1`, `justifyContent: "center"`) wraps the game area; the game area is fixed 210 px and centered. No dual spacers, so no rebalance jitter.
- **Alignment:** Fixed-height sections keep their positions; the single flex absorbs remaining space once, so opacity or turn changes do not cause vertical drift.

All heights are defined in `constants/` (e.g. `actionBar.constants.ts`, `opponentStrip.constants.ts`, `heroZone.constants.ts`) and aggregated in `constants/layoutHeights.ts`. TableLayout imports from `layoutHeights.ts` only.

### Refinements (real devices, dynamic type, safe area)

- **Font scaling:** Height-critical text uses `allowFontScaling={false}` (title block, DealerAnnounceBar, ActionBar status row and bet input) so pixel math is preserved.
- **Emergency fallback:** When `remaining &lt; 0`, OpponentStrip height becomes `OPPONENT_STRIP_HEIGHT_FALLBACK` (300) and HeroZone becomes `HERO_ZONE_HEIGHT_FALLBACK` (180). ActionBar is never reduced.
- **Component contracts:** Each fixed-height component’s constants file exports `HEIGHT` and `BREAKDOWN` (e.g. `ACTION_BAR_BREAKDOWN`) for diffing and debugging.
