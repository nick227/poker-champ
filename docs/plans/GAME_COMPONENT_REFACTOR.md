# Game Component Refactor Plan

Encapsulate table/game UI components into dedicated folders with isolated config and styles. Move styles and component-specific constants out of root-level `.styles` and `.constants` files into each component's folder and standardize layout.

---

## Refactor recommendations (adopted)

- **layout.ts at folder root** — No `config/` nesting; use `layout.ts` directly in each component folder.
- **tokens/** — Reusable design primitives (radii, colors, spacing, **card aspect ratio** / card dimensions). Add `tokens/spacing.tokens.ts` and `tokens/card-dimensions.tokens.ts`; components reuse these and customize locally in their own `layout.ts`.
- **Strict layout ownership** — Component layout values live only inside that component's `layout.ts`; no cross-component layout imports.
- **Barrel exports** — Every component folder has `index.ts` controlling public API; short paths e.g. `import { HeroZone } from "@/table/hero-zone"`.
- **View + hook** — Split complex components into `Component.tsx` + `useComponent.ts`.
- **table-layout/ not shell/** — Move shell infrastructure into `table-layout/` (or `layout/` if scope stays small).
- **table-layout.constants.ts** — Strictly shell band heights and global layout contract.
- **Optional files** — `Component.types.ts` when prop types grow; lightweight `README.md` in complex folders for architecture clarity.
- **Folder contract** — `Component.tsx`, `layout.ts`, `styles.ts`, `index.ts` in every component folder.
- **Shared primitives** — Remain out of scope.
- **Incremental execution** — One component at a time to reduce risk and simplify rollback.

---

## Naming conventions

Use these consistently so the repo is easy to scan and search.

1. **File naming: kebab-case**  
   Match folder style. Prefer `table-layout.constants.ts` over `tableLayout.constants.ts`. Same for any table-level files: `table-layout.styles.ts` → moves into `table-layout/styles.ts`.

2. **Token files: `*.tokens.ts`**  
   Visually clear they are tokens; easier to search (`*.tokens.ts`). Keep names **plural** where applicable.
   - `radii.tokens.ts`
   - `colors.tokens.ts`
   - `spacing.tokens.ts`
   - `card-dimensions.tokens.ts` (geometry/helpers, not card components; avoids ambiguity with “cards”)

3. **Layout constants: component-prefixed**  
   Avoid collisions and make ownership obvious; easier repo search.
   - `OPPONENT_STRIP_AVATAR_SIZE` (not `OPPONENT_AVATAR_SIZE`)
   - `HERO_ZONE_CARD_GAP` (not `HERO_CARD_GAP`)
   - `COMMUNITY_BOARD_CARD_SCALE` (not `COMMUNITY_CARD_SCALE`)
   - `ACTION_BAR_BUTTON_HEIGHT` (not generic `BUTTON_HEIGHT`)

4. **Subcomponents: `<Component><Thing>`**  
   Inside a folder, use descriptive compound names. Examples: `OpponentStripItem.tsx`, `CommunityBoardCard.tsx`, `HeroZoneCards.tsx`. Avoid generic names like `Row.tsx`, `Item.tsx`, `Card.tsx`.

5. **Hooks: `use<Component>.ts`**  
   Match the component name. Examples: `useHeroZone.ts`, `useOpponentStrip.ts`, `useActionBar.ts`. Avoid `use-hero-zone.ts` or `heroZoneHook.ts`.

6. **Layout folder name**  
   Prefer **`table-layout/`** over `layout/` so it doesn't collide with other layout systems if the repo grows. `layout/` is acceptable if table scope stays small.

7. **Pluralization**  
   Keep token filenames consistently plural where it applies: `radii.tokens.ts`, `colors.tokens.ts`, `spacing.tokens.ts`. Don't introduce singular `radius.tokens.ts`, `color.tokens.ts`, etc.

**Biggest practical win:** If you only change two things, make them: **`table-layout.constants.ts`** and **`*.tokens.ts`**. Those alone make the system much easier to read when scanning the repo.

---

## 1. Goals

- **Encapsulation**: Each game component lives in its own folder with component, styles, and config.
- **Simplification**: One place per component for layout numbers and styles; no scattered `.styles` / `.constants` at table root.
- **Standardization**: Same folder shape and naming for every component; shared primitives live in `tokens/`. Components depend only on tokens and shared constants—no cross-component layout imports.
- **Reuse + customize**: Tokens (e.g. card aspect ratio) are reused everywhere; each component remains individually customizable via its own `layout.ts` and `styles.ts`. Overall layout rules (shell band heights, vertical contract) stay in one place and are consumed, not redefined, by components.

---

## 2. Three layers: tokens, layout rules, component customization

Three distinct layers keep reuse and customization clear:

| Layer | Purpose | Where | Customizable? |
|-------|---------|--------|----------------|
| **Tokens** | Reusable design primitives: card aspect ratio, base card dimensions, radii, colors, spacing. Single source of truth so components stay consistent by default. | `tokens/*.tokens.ts` (radii, colors, spacing, card-dimensions) | No—these are the shared defaults. |
| **Overall layout rules** | Global table structure: band heights, vertical stacking order, which sections exist. The table-layout shell enforces these; components do not define them. | `constants/table-layout.constants.ts` + `table-layout/` (shell) | No—components consume these, they don't change them. |
| **Component customization** | Per-component sizes, gaps, font sizes, and visual overrides. A component may use token values as-is or override them locally (e.g. a different card scale or padding only for that component). | Each component's `layout.ts` and `styles.ts` | Yes—every component is individually customizable here. |

- **Reuse**: Components import from `tokens/` (e.g. card aspect ratio, TABLE_TILE_RADIUS) and from `table-layout.constants` for band heights they need. No duplication of those values.
- **Individual customization**: A component's `layout.ts` can define local values that override or extend tokens (e.g. `OPPONENT_STRIP_AVATAR_SIZE = 56`, or `COMMUNITY_BOARD_CARD_SCALE = CARD_SCALES.COMMUNITY`) and its `styles.ts` can apply component-specific styling. No other component reads another's `layout.ts`—so customization is scoped per component.
- **Overall layout rules**: The table-layout shell (vertical bands, order, heights) is defined once in `table-layout.constants.ts` and `table-layout/styles.ts`. Components fit into that contract; they don't own it.

---

## 3. Current State (pre-refactor; phases complete)

### 3.1 Root-level style files (removed / relocated)

| File | Content | Consumers |
|------|---------|-----------|
| `table-layout.styles.ts` | Shell band layout (root, titleSection, opponentStripSection, mainContent, gameArea, dealerBar, feltArea, heroSection, actionBarSection) | `TableSceneShell` |
| `tableChrome.styles.ts` | `gameTopBarTableName` (fontSize) | `TableGameTopBar` |
| `opponentStrip.styles.ts` | Full OpponentStrip + OpponentStripItem styles, PRESSABLE_* | `OpponentStrip`, `OpponentStripItem` |
| `heroZone.styles.ts` | Full HeroZone styles | `HeroZone` |

### 3.2 Root-level constants (split / relocated)

| File | Content | Strategy |
|------|---------|----------|
| `constants/table-layout.constants.ts` | Band heights, TABLE_SPACING, board/hero/opponent numbers | Keep **strictly** shell band heights and global layout contract only. Move TABLE_SPACING to `tokens/spacing.tokens.ts` if shared. All component-specific values move into each component's `layout.ts`. |
| `constants/cardDimensions.constants.ts` | BASE_CARD_*, CARD_SCALES, getCardDimensions, card aspect ratio | Move into **tokens/card-dimensions.tokens.ts** so card aspect ratio and base dimensions are reused; each component can still customize scale/size in its own `layout.ts`. |
| `constants/style/tableRadii.ts` | TABLE_TILE_RADIUS | Move into `tokens/radii.tokens.ts`. |
| `constants/style/tableColors.ts` | ACTIVE_TILE_BORDER, STACK_TEXT_COLOR | Move into `tokens/colors.tokens.ts`. |
| Scattered spacing (TABLE_SPACING, padding, gap values) | Various | Consolidate into `tokens/spacing.tokens.ts` where shared. |
| `constants/components/actionBar.layout.ts` | ACTION_BAR_*, STATUS_ROW_HEIGHT, etc. | Move into `action-bar/layout.ts`. |

### 3.3 Components to encapsulate

- **OpponentStrip** + **OpponentStripItem** (share styles; one folder)
- **HeroZone**
- **ActionBar**
- **BoardArea** (uses FeltBackground, CommunityBoard; can be one folder or BoardArea + CommunityBoard as siblings)
- **CommunityBoard** (standalone or under BoardArea)
- **TableGameTopBar** (chrome styles)
- **Table layout** (TableSceneShell + table-layout.styles → `table-layout/` folder; rename from `shell/`)

**FeltBackground**: Presentational primitive that wraps the felt image (and optional theming). Currently used only by BoardArea. It does **not** get its own full component folder (no `layout.ts` / barrel contract) in this refactor—treat it as a simple reusable view. When creating `board-area/`, move `FeltBackground.tsx` into that folder as a subcomponent so BoardArea and its felt live together; FeltBackground stays a thin wrapper (style/className/children). If later it is reused elsewhere (e.g. another scene), we can re-export it from table root or a shared primitives location.

Other shared primitives (PlayingCard, DealerButton, PotWinEffect, etc.) remain **out of scope** for getting their own encapsulated folders in this refactor.

---

## 4. Target Structure

### 4.1 Shared layer: tokens/ and constants

- **tokens/** — Reusable design primitives (no layout math). Components **reuse** these; they may **customize** locally in their own `layout.ts` (e.g. a component-specific card scale). Includes card aspect ratio and base dimensions so all card UI stays consistent by default.
- **constants/table-layout.constants.ts** — **Overall layout rules** only: shell band heights and global layout contract. Consumed by the layout shell; components do not define or change these.

```
table/
  tokens/
    radii.tokens.ts        # TABLE_TILE_RADIUS (from tableRadii.ts)
    colors.tokens.ts       # ACTIVE_TILE_BORDER, STACK_TEXT_COLOR (from tableColors.ts)
    spacing.tokens.ts      # Shared spacing (edge, bandGap, etc.) to eliminate scattered numerics
    card-dimensions.tokens.ts   # Card aspect ratio, BASE_CARD_*, CARD_SCALES, getCardDimensions (reuse everywhere; components may override scale/size locally in layout.ts)
  constants/
    table-layout.constants.ts   # Overall layout rules only: band heights, global layout contract
  table-layout/            # Shell: enforces overall layout rules (or layout/ if scope stays small)
    TableSceneShell.tsx
    styles.ts
    index.ts
  table.adapter.ts
  table.types.ts
  table.utils.ts
  ...
```

**table-layout.constants.ts** (overall layout rules) contains only:

- Band heights: `LAYOUT_GAME_TOP_BAR_HEIGHT`, `DEALER_BAR_HEIGHT`, `BOARD_AREA_HEIGHT`, `BOARD_AREA_HEIGHT_LANDSCAPE`, `GAME_AREA_HEIGHT`, `ACTION_BAR_HEIGHT`, `HERO_ZONE_HEIGHT`
- Any other band/section values the **table-layout shell** needs. No OPPONENT_STRIP_*, HERO_ZONE_*, COMMUNITY_BOARD_*, or component-internal values. Shared spacing lives in `tokens/spacing.tokens.ts`.

### 4.2 Standard component folder (folder contract)

Every component folder uses the same contract. Use **layout.ts** at folder root (no `config/` nesting).

```
table/
  <component-name>/        # e.g. opponent-strip, hero-zone, action-bar
    index.ts               # Barrel export: public API only (component + types)
    <ComponentName>.tsx    # Main view
    layout.ts              # Component-specific dimensions only (heights, gaps, font sizes)
    styles.ts              # StyleSheet for this component
    use<Component>.ts      # Optional: split complex logic into hook
    <Component>.types.ts   # Optional: when prop types grow
    README.md              # Optional: for complex folders, architecture clarity
    # Subcomponents in same folder: <Component><Thing> (e.g. OpponentStripItem.tsx, CommunityBoardCard.tsx)
```

- **Strict rule**: Component layout values live **only** in that component's `layout.ts`. No cross-component layout imports; components depend only on `tokens/` and `constants/table-layout.constants` (for band heights the table-layout shell uses).
- **Reuse tokens, customize locally**: Components import shared values from `tokens/` (e.g. card aspect ratio from `tokens/card-dimensions.tokens.ts`). A component's `layout.ts` may then define **local** overrides (e.g. `COMMUNITY_BOARD_CARD_SCALE`, `OPPONENT_STRIP_CARD_MIN_HEIGHT`) so that component remains individually customizable without changing tokens for everyone.
- **styles.ts**: Imports from `../tokens` and from `./layout.ts` only.
- **Barrel**: Every component folder has `index.ts` to control public API and enable short paths: `import { HeroZone } from "@/table/hero-zone"` (or equivalent alias).
- **Individual customization**: Each component's `layout.ts` may use token values as-is or define local overrides (e.g. a scale or size used only in that component). Tokens are reused; component layout is where that component is customized.

### 4.3 Proposed folder map

| Current | Target folder | Contents to move |
|---------|----------------|------------------|
| OpponentStrip.tsx, OpponentStripItem.tsx, opponentStrip.styles.ts | `opponent-strip/` | Styles → `styles.ts`. OPPONENT_STRIP_* constants → `layout.ts`. Subcomponent stays `OpponentStripItem.tsx`. Hook: `useOpponentStrip.ts`. Barrel in `index.ts`. |
| HeroZone.tsx, heroZone.styles.ts | `hero-zone/` | Styles → `styles.ts`. HERO_ZONE_*, CARD_ROW_*, DEALER_BUTTON_SLOT_*, etc. → `layout.ts`. Hook: `useHeroZone.ts`. Barrel in `index.ts`. |
| ActionBar.tsx, actionBar.logic.ts, constants/components/actionBar.layout.ts | `action-bar/` | actionBar.layout.ts → `layout.ts`. Add `styles.ts` if needed. ACTION_BAR_* in layout; ACTION_BAR_HEIGHT stays in table-layout.constants (shell). Hook: `useActionBar.ts`. |
| BoardArea.tsx, CommunityBoard.tsx, FeltBackground.tsx | `board-area/` (or + `community-board/`) | COMMUNITY_BOARD_* → `layout.ts` in owning folder. Subcomponents: e.g. CommunityBoardCard.tsx. Styles in `styles.ts`. **FeltBackground**: move into `board-area/` as a subcomponent (no separate folder); it stays a thin presentational wrapper. |
| TableGameTopBar.tsx, tableChrome.styles.ts | `table-game-top-bar/` | tableChrome.styles.ts → `styles.ts`. Chrome layout numbers → `layout.ts`. |
| TableSceneShell.tsx, table-layout.styles.ts | `table-layout/` (rename from shell/) | table-layout.styles.ts → `table-layout/styles.ts`. Reads only `constants/table-layout.constants.ts`. Barrel `index.ts`. |

---

## 5. Standardization Rules

1. **Folder contract**
   - Folder: `kebab-case` (e.g. `opponent-strip`, `hero-zone`, `action-bar`).
   - Files: `Component.tsx`, `layout.ts`, `styles.ts`, `index.ts` in every component folder. Optional: `useComponent.ts`, `Component.types.ts`, `README.md` for complex components.
   - No `config/` nesting: use `layout.ts` at folder root.

2. **Layout ownership**
   - Component layout values live **only** inside that component's `layout.ts`. No cross-component layout imports.
   - **Component layout files must never import layout from other components.** Only tokens and shell constants may be imported. This prevents coupling (e.g. `hero-zone/layout` → `opponent-strip/layout`), which is a common regression in UI systems.
   - Components depend only on `tokens/` and shared constants (e.g. `table-layout.constants` for band heights used by table-layout shell, `card-dimensions.tokens`).

3. **Imports**
   - Component imports styles from `./styles` and layout from `./layout`.
   - Styles import from `../tokens` and `./layout.ts`.
   - Prefer short paths via barrel: `import { HeroZone } from "@/table/hero-zone"` (or equivalent alias).

4. **Barrel exports**
   - Every component folder has `index.ts` exporting the public API (component + public types). Internal files (layout, styles, hooks) are not re-exported unless needed.

5. **Complex components**
   - Split into view + hook: `Component.tsx` + `useComponent.ts` when logic is non-trivial.
   - Add `Component.types.ts` when prop types grow. Add a short `README.md` in complex folders for architecture clarity.

---

## 6. Execution Phases

Execute **incrementally by component** to reduce risk and simplify rollback. One component at a time; run tests and build after each phase.

**Constants (post–Phase 7):** Only `constants/table-layout.constants.ts` (hyphen) remains for shell band heights. `tableLayout.constants.ts` (camel) has been removed.

**Migration rule when moving constants out of tableLayout.constants.ts:** Do not delete constants immediately. Instead: (1) Move constant → component `layout.ts`, (2) Update component and consumer imports, (3) Confirm no remaining imports of that constant, (4) Then remove from `tableLayout.constants.ts`. This avoids subtle breakages.

**Migration invariant** — at the end of each phase:

1. No component layout constants remain in `tableLayout.constants.ts` for the migrated component.
2. The component imports its layout only from `./layout.ts`.
3. `table-layout.constants.ts` contains only shell band heights.

This helps catch mistakes during future edits.

### Phase 1: Tokens and layout shell

1. Create `tokens/` with `radii.tokens.ts`, `colors.tokens.ts`, `spacing.tokens.ts`, `card-dimensions.tokens.ts`. Move content from `constants/style/` into the corresponding `*.tokens.ts` files; move card aspect ratio and base dimensions from `constants/cardDimensions.constants.ts` into `tokens/card-dimensions.tokens.ts`. Consolidate shared spacing (e.g. TABLE_SPACING) into `tokens/spacing.tokens.ts`. All components will reuse these; each can still customize in its own `layout.ts`.
2. Trim `table-layout.constants.ts` to **overall layout rules** only: shell band heights and global layout contract. No component-internal values.
3. Rename `shell/` → `table-layout/`. Move `table-layout.styles.ts` into `table-layout/styles.ts`. Add `table-layout/index.ts` barrel. Update `TableSceneShell` imports.
4. Delete root `table-layout.styles.ts`. Update any existing imports of `cardDimensions.constants` to `tokens/card-dimensions.tokens` (or keep a re-export in constants during migration).

### Phase 2: Opponent strip

1. Create `opponent-strip/` with `OpponentStrip.tsx`, `OpponentStripItem.tsx`, `layout.ts`, `styles.ts`, `index.ts`.
2. Add `layout.ts` with all OPPONENT_STRIP_* constants. Move content of `opponentStrip.styles.ts` into `styles.ts`; import from `../tokens` and `./layout`.
3. Barrel-export component and `Opponent` type from `index.ts`.
4. Remove OPPONENT_STRIP_* from `table-layout.constants.ts`. Update all imports to use `@/table/opponent-strip` (or relative). Delete `opponentStrip.styles.ts`.

### Phase 3: Hero zone

Mirror the same structure as opponent-strip:

```
hero-zone/
  HeroZone.tsx
  layout.ts
  styles.ts
  index.ts
```

1. Create `hero-zone/` with `HeroZone.tsx`, `layout.ts`, `styles.ts`, `index.ts`.
2. Add `layout.ts` with **grouped objects** (same pattern as opponent-strip): **CONTAINER**, **CARDS**, **DEALER_BUTTON**, **TEXT**, **STACK**. Use `Object.freeze({ ... } as const)` for each group. Use **unprefixed names** (e.g. `CARD_GAP`, `SLOT_SIZE`) — the folder provides scope. Add a top comment explaining the layout contract. Move `heroZone.styles.ts` into `styles.ts`.
3. Re-export from `index.ts`. **Migration rule:** Move constants into `layout.ts`, update all imports, confirm no remaining references, then remove from `tableLayout.constants.ts`. Delete `heroZone.styles.ts`.

### Phase 4: Action bar (simplest migration)

Target structure:

```
action-bar/
  ActionBar.tsx
  layout.ts
  styles.ts
  index.ts
```

- **Move from** `tableLayout.constants.ts` / `constants/components/actionBar.layout.ts` **into** `action-bar/layout.ts`: e.g. `STATUS_ROW_HEIGHT`, `BUTTON_HEIGHT`, `BUTTON_GAP`, `ACTION_BUTTON_PADDING` (and any other action-bar component-level constants). Use layout groups: **CONTAINER**, **STATUS**, **BUTTONS**.
- **Do not move** `ACTION_BAR_HEIGHT` — the shell needs it; it stays in `table-layout.constants.ts`.
- Create folder and files; move actionBar layout content (excluding band height) into `action-bar/layout.ts`; update imports; remove old file.

### Phase 5: Board area and community board (tricky)

This migration is the only tricky one (BoardArea, CommunityBoard, FeltBackground, card dimensions). Target: `board-area/` with BoardArea.tsx, CommunityBoard.tsx, FeltBackground.tsx, layout.ts, styles.ts, index.ts.

**Layout grouping (visually dense):** Use **CONTAINER**, **BOARD**, **CARDS**, **POT**. Example: `CARDS.GAP`, `CARDS.SCALE`, `CARDS.MIN_WIDTH` so CommunityBoard tuning stays simple.

1. Create `board-area/` with BoardArea.tsx, CommunityBoard.tsx, FeltBackground.tsx, layout.ts, styles.ts, index.ts. Move BoardArea, CommunityBoard, and **FeltBackground** into the folder. Move COMMUNITY_CARD_* from `tableLayout.constants.ts` into `board-area/layout.ts`. Update table-layout/ and views imports. After this phase, `tableLayout.constants.ts` has no remaining values (Phase 7 deletes the file).

### Phase 6: Table game top bar

1. Create `table-game-top-bar/` with `TableGameTopBar.tsx`, `layout.ts`, `styles.ts`, `index.ts`.
2. Move `tableChrome.styles.ts` into `styles.ts`. Update imports; delete `tableChrome.styles.ts`.

### Phase 7: Cleanup and docs

1. **Delete `tableLayout.constants.ts`** (camel). Only `constants/table-layout.constants.ts` (hyphen) remains for shell band heights. **Final check:** Search for imports of `tableLayout.constants.ts`; all should be removed before deleting the file (avoids orphan imports).
2. Remove empty `constants/components/` and redundant files. Update `constants/README.md`: shell band heights in `table-layout.constants.ts`, shared primitives in `tokens/*.tokens.ts`, component layout only in each component's `layout.ts`.
3. Run tests and fix imports/lint.

**Migration complete.** Current architecture:

```
table/
  tokens/
  constants/table-layout.constants.ts   (shell band heights only)
  table-layout/
  opponent-strip/
  hero-zone/
  action-bar/
  board-area/
  table-game-top-bar/
  … (PlayingCard, RejoinCTA, etc. remain at table root)
```

---

## 7. File and Folder Summary

- **Before**: Root-level `*.styles.ts` and mixed constants in `constants/` and `constants/components/`.
- **After**: Consistent folder contract per component:
  - `index.ts` (barrel)
  - `ComponentName.tsx`
  - `layout.ts` (no config/ nesting)
  - `styles.ts`
  - Optional: `useComponent.ts`, `Component.types.ts`, `README.md`

Shared:
- `table/tokens/` — radii, colors, spacing, **cards** (aspect ratio, base dimensions, scales)—reused by all components; components stay individually customizable via their own `layout.ts`.
- `table/constants/table-layout.constants.ts` — **overall layout rules** only: shell band heights and global layout contract.
- `table/table-layout/` — TableSceneShell + layout band styles; enforces overall layout rules.

---

## 8. Risk and Rollback

- **Risk**: Many import path changes; possible missed references.
- **Mitigation**: Execute incrementally by component; run tests and build after each phase; use IDE “Find All References” for moved symbols.
- **Rollback**: Each phase is independently revertible; no shared state or schema changes.

---

## 9. Out of Scope (for this refactor)

- Changing behavior or UI design.
- **Shared primitives** (PlayingCard, DealerButton, PotWinEffect, etc.) do not get their own encapsulated folders; they stay as reusable components. **FeltBackground** is the exception: it is moved into `board-area/` as a subcomponent (see §3.3 and Phase 5) but does not get a full folder contract.
- New tooling or build steps.
- Theming or dark mode (tokens structure can support it later).

---

## 10. Avoid over-engineering

- **No new features.** This is a move-and-rename refactor only. Don't add new behavior, new components, or “while we're here” improvements.
- **Optional files are optional.** Add `useComponent.ts`, `Component.types.ts`, or `README.md` only when there's a clear need (e.g. logic is already complex). Don't create them preemptively or for consistency.
- **Subcomponent naming.** Apply `<Component><Thing>` when introducing new subcomponents or when you're already renaming. Don't do a separate pass to rename existing ones (e.g. OpponentStripItem is already fine).
- **Layout constant prefixes.** Rename to OPPONENT_STRIP_*, HERO_ZONE_*, etc. when moving into each component's `layout.ts`; no separate project-wide rename phase.
- **Pick one layout folder name** (`table-layout/` or `layout/`) and stick with it. Don't add abstraction layers or “future” layout systems.
- **Tokens:** Create only the token files you actually need. If something isn't shared yet, leave it in the component until it is.
