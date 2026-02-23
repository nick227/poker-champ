# Table layout heights: CSS fade-out and constants simplification

## 1. Current state

### 1.1 Where heights live

| Source | Constants | Used by |
|--------|-----------|--------|
| `constants/layoutHeights.ts` | `LAYOUT_TITLE_HEIGHT`, `LAYOUT_TOP_BAR_HEIGHT`, `DEALER_BAR_HEIGHT`, `FELT_HEIGHT`, `GAME_AREA_HEIGHT`, `TOTAL_FIXED_HEIGHT`, `HERO_ZONE_HEIGHT_FALLBACK`; re-exports `OPPONENT_STRIP_*`, `HERO_ZONE_HEIGHT`, `ACTION_BAR_HEIGHT` | TableSceneShell, tableLayout.styles, useTableLayoutHeights, CommunityBoard |
| `constants/opponentStrip.constants.ts` | `OPPONENT_STRIP_HEIGHT` (250), `OPPONENT_STRIP_HEIGHT_FALLBACK` (270), tile/card/padding | OpponentStrip, opponentStrip.styles, layoutHeights (re-export) |
| `constants/heroZone.constants.ts` | `HERO_ZONE_HEIGHT` (200), `CALC_STRIP_HEIGHT`, etc. | HeroZone, heroZone.styles, layoutHeights (re-export) |
| `constants/actionBar.constants.ts` | `ACTION_BAR_HEIGHT` (computed), padding, gaps | ActionBar, TableSceneShell, layoutHeights (re-export) |
| **Inline** (CommunityBoard.tsx) | `CARD_GAP`, `POT_ROW_MIN_HEIGHT`, `FELT_BOTTOM_PADDING`, `FELT_V_PADDING`, `CARD_ROW_HEIGHT`, `COMMUNITY_CARD_SCALE` | CommunityBoard only |

### 1.2 How fallback works today

- **Decision:** `useTableLayoutHeights()` computes once on mount: `usableHeight = windowHeight - insets.top - insets.bottom`. If `usableHeight < TOTAL_FIXED_HEIGHT` → profile `"fallback"`, else `"normal"`.
- **Output:** Hook returns `opponentStripHeight` and `heroZoneHeight` (either normal or fallback constants). No animation; values are discrete.
- **Application:** `TableSceneShell` applies them as inline styles:
  - `opponentStripSection`: `style={[layoutStyles.opponentStripSection, { height, minHeight: opponentStripHeight }]}`
  - `heroSection`: `style={[layoutStyles.heroSection, { height: heroZoneHeight }]}`
- **Redundancy:** `tableLayout.styles.ts` sets base `height`/`minHeight` from constants (`OPPONENT_STRIP_HEIGHT`, `HERO_ZONE_HEIGHT_FALLBACK`), then TableSceneShell **overrides** with dynamic values. So the style sheet values for those two sections are never the single source of truth.

### 1.3 Pain points

- Fallback and normal heights are defined in different files (`HERO_ZONE_HEIGHT_FALLBACK` in layoutHeights; `OPPONENT_STRIP_HEIGHT_FALLBACK` in opponentStrip.constants).
- Two sources of truth for the same band: StyleSheet (layoutStyles) + inline overrides in TableSceneShell.
- CommunityBoard uses its own inline constants instead of shared layout/felt constants.
- No smooth transition when profile switches; heights jump.

---

## 2. Proposal A: Fade out fallback heights with CSS

**Goal:** When layout switches between normal and fallback (or when we later drive heights continuously), the height change is smooth instead of instant.

### 2.1 Approach

- **Web:** Use CSS custom properties for the two variable band heights and a short `transition` on `height` so changes are animated.
- **Native (iOS/Android):** React Native StyleSheet does not support `transition`. Options: (1) leave as instant, or (2) use `Animated` in a follow-up to animate height when profile changes. This proposal focuses on the CSS path for web and a single source of values.

Steps:

1. **Drive heights from CSS variables (single source in JS)**  
   In `TableSceneShell`, set two variables on the root (or a wrapper) from `useTableLayoutHeights()`:
   - `--table-opponent-strip-height`: `opponentStripHeight`
   - `--table-hero-zone-height`: `heroZoneHeight`

2. **Use these variables in layout**  
   - For **web**, use a small amount of CSS (e.g. in a global or component-level stylesheet, or via NativeWind/className where supported) so that:
     - Opponent strip and hero section heights are read from `var(--table-opponent-strip-height)` and `var(--table-hero-zone-height)`.
     - Both sections have e.g. `transition: height 0.2s ease-out` so when the variables change, height animates.
   - For **React Native**, keep passing the same numeric values as now (from the hook) into `style={{ height, minHeight }}` so behavior is unchanged; no transition on native unless we add Animated later.

3. **Remove duplicate fixed heights from StyleSheet**  
   So that the only place that sets these two heights is the hook + vars (web) or hook + inline style (native). That implies tableLayout.styles should not set `height`/`minHeight` for `opponentStripSection` and `heroSection`; those come from the hook (and on web, from CSS that reads the vars).

Implementation detail: React Native’s `vars()` already injects CSS variables; on web we can add a class or a style block that does:

```css
.table-opponent-strip, .table-hero-section {
  transition: height 0.2s ease-out;
}
```

and ensure those elements get their height from the variables. So the “fade out” is a **height transition** when switching to/from fallback.

### 2.2 Optional: continuous scaling

Later we could replace the binary profile with a continuous factor (e.g. `clamp(0, 1, (usableHeight - MIN) / (TOTAL_FIXED_HEIGHT - MIN))`) and set:

- `--table-opponent-strip-height`: `normalHeight + (fallbackHeight - normalHeight) * (1 - factor)`
- Same for hero zone. Then as the viewport shrinks, heights would smoothly interpolate and we could still use the same CSS transition for any remaining jumps.

---

## 3. Proposal B: Simplify and centralize constants

**Goal:** One clear hierarchy of layout constants, no duplicate definitions, minimal overrides.

### 3.1 Principles

- **Single re-export surface:** All layout-related heights are imported by consumers from `constants/layoutHeights.ts` (or a single index). Domain files (opponentStrip, heroZone, actionBar) keep their own *component* constants (tile sizes, padding, gaps); only *band heights* used by the shell and by `TOTAL_FIXED_HEIGHT` are re-exported from layoutHeights.
- **One place for fallbacks:** All fallback heights live next to their normal counterparts. So either:
  - Move `HERO_ZONE_HEIGHT_FALLBACK` into `heroZone.constants.ts` and re-export from layoutHeights, or
  - Keep both `OPPONENT_STRIP_HEIGHT_FALLBACK` and `HERO_ZONE_HEIGHT_FALLBACK` in layoutHeights and have layoutHeights import the normal heights from the domain files and define only the fallback values there (with a comment that they are used when `usableHeight < TOTAL_FIXED_HEIGHT`).
- **StyleSheet does not override:** `tableLayout.styles.ts` should not set `height`/`minHeight` for bands that are driven dynamically (opponent strip, hero section). It can set them for fixed bands (title, top bar, game area, dealer bar, felt, action bar). So layoutStyles and TableSceneShell share one source: hook for variable bands, constants for fixed bands.
- **CommunityBoard:** Move felt/card constants into a small `communityBoard.constants.ts` (or into layoutHeights if they are shared). Use `FELT_HEIGHT` and a single place for padding/row heights so CommunityBoard doesn’t duplicate magic numbers.

### 3.2 Suggested file roles

| File | Role |
|------|------|
| `layoutHeights.ts` | Defines or re-exports all **band heights** (title, top bar, dealer bar, felt, game area, opponent strip normal/fallback, hero zone normal/fallback, action bar) and `TOTAL_FIXED_HEIGHT`. Single import for TableSceneShell, useTableLayoutHeights, tableLayout.styles. |
| `opponentStrip.constants.ts` | Strip height (normal + fallback), tile/card/padding; export strip heights for layoutHeights to re-export. |
| `heroZone.constants.ts` | Hero zone height (normal + fallback), CALC_STRIP, etc.; export zone heights for layoutHeights to re-export. |
| `actionBar.constants.ts` | Action bar height and internal layout; no fallback. |
| `tableLayout.styles.ts` | Imports only from layoutHeights. Uses constants for fixed bands; does **not** set height/minHeight for opponent strip and hero section (those come from hook + vars or inline). |
| `CommunityBoard` | Imports FELT_* and card/pot constants from layoutHeights or communityBoard.constants. |

### 3.3 Safe roadmap (order of work)

1. **Centralize fallback definitions**  
   - Put both fallback heights in one place (e.g. layoutHeights) or keep in domain files but re-export only from layoutHeights.  
   - Ensure `TOTAL_FIXED_HEIGHT` and the profile logic in `useTableLayoutHeights` use only layoutHeights.

2. **Remove StyleSheet overrides for variable bands**  
   - In tableLayout.styles, drop `height`/`minHeight` from `opponentStripSection` and `heroSection` (or set them only via a comment/documentation that they are overridden by TableSceneShell).  
   - TableSceneShell continues to pass hook values; no behavior change.

3. **Introduce CSS variables and (web) transition**  
   - TableSceneShell sets `--table-opponent-strip-height` and `--table-hero-zone-height` from the hook.  
   - On web, use these vars for the two sections and add `transition: height 0.2s ease-out`.  
   - Verify on web and native (native still uses numeric style from hook).

4. **Extract CommunityBoard constants**  
   - Add `communityBoard.constants.ts` (or extend layoutHeights with FELT padding/row constants).  
   - Replace inline numbers in CommunityBoard with imports.

5. **Optional: continuous height factor**  
   - Replace binary profile with a factor; interpolate heights; keep same CSS vars and transition.

---

## 4. Decisions & feasibility (Q&A)

### A. CSS variable feasibility (web path)

**1) Do we already rely on CSS variables elsewhere in RN-Web?**  
**Yes.**

- **Where:** (a) **Global:** `src/theme/tokens.css` defines `:root` vars (colors, spacing, radius, and unused vh table vars); `app/global.css` imports it. (b) **Inline:** `TableSceneShell` and `ConnectingTableShell` use `vars({ "--c-felt": feltColor, ... })` from NativeWind to override theme tokens on the table wrapper.
- **Conclusion:** First-class CSS vars are already in use (global + inline `vars()`). Adding `--table-opponent-strip-height` and `--table-hero-zone-height` in the same shell `vars()` call is consistent.

**2) How are we applying web-only CSS today?**  
- **Global stylesheet:** `global.css` → `tokens.css` (Tailwind + token vars). No component-scoped CSS files.
- **NativeWind className:** Used widely; one existing transition example: `HandReplayScreen` uses `className="... transition-all duration-200"`.
- **style prop:** Used for layout (height, padding, etc.). No web-only style branching found.
- **Where `transition: height` should live:** Either (a) add a class in Tailwind (e.g. `transition-[height] duration-200 ease-out`) and use it on the two band wrappers on web, or (b) add a small rule in `tokens.css` / `global.css` for `.table-opponent-strip` and `.table-hero-section` with `transition: height 0.2s ease-out`. Prefer (a) if NativeWind supports it to avoid platform-specific CSS; else (b).

**3) Web-only smoothness acceptable?**  
**Yes.** Confirm: **Native = instant height switch, Web = animated height switch.** Document this in the proposal/code comment so “native doesn’t animate” is not reported as a bug.

---

### B. Ownership of height values

**4) Should `useTableLayoutHeights()` remain the only place computing band heights?**  
**Yes.** No other hook or component should compute opponent strip or hero zone heights. Everyone consumes via hook → TableSceneShell. Today only TableSceneShell uses the hook; no other callers. Enforce by convention and a short comment in the hook.

**5) Normal + fallback export: Model A or B?**  
**Model A (recommended).**

- **heroZone.constants.ts:** `export HERO_ZONE_HEIGHT`, `export HERO_ZONE_HEIGHT_FALLBACK`
- **layoutHeights.ts:** re-export both from heroZone and opponentStrip.
- **Rationale:** Fallback lives next to normal in the domain file; layoutHeights stays a re-export surface only. Avoids half-migration and keeps layoutHeights from defining hero/opponent numbers.

---

### C. TOTAL_FIXED_HEIGHT semantics

**6) Does TOTAL_FIXED_HEIGHT use normal or fallback bands?**  
**Normal only.** Code and comment already say: “TOTAL_FIXED_HEIGHT assumes NORMAL profile band sizes.” Fallback is the response when `usableHeight < TOTAL_FIXED_HEIGHT`. No change.

**7) Should TOTAL_FIXED_HEIGHT include safe-area insets?**  
**No.** TOTAL_FIXED_HEIGHT is pure content height; insets are not baked in. The decision correctly uses `usableHeight = windowHeight - insets.top - insets.bottom`. No change.

---

### D. TableSceneShell responsibility

**8) Should TableSceneShell be the only place applying height styles for the two bands?**  
**Yes.** No child (OpponentStrip, HeroZone, etc.) should set the band height; they should only fill the height they’re given. Today: TableSceneShell applies height to the **wrapper** Views and passes `height={opponentStripHeight}` to OpponentStrip. HeroZone is rendered as `hero` (ReactNode) and does **not** receive a height prop; it uses `heightProp ?? HERO_ZONE_HEIGHT` (always 200). So in fallback the wrapper is 180px but HeroZone’s root is 200px (potential clip). For strict “shell only applies height,” either: (a) pass height into the hero slot (e.g. TableLayout gets heights from context or a render prop and passes `height` to HeroZone), or (b) have HeroZone fill parent (e.g. `height: '100%'`) when used inside the shell. Recommend (a) so HeroZone still has an explicit height contract when used elsewhere.

**9) Shell owns both CSS vars (web) and numeric inline heights (native)?**  
**Yes.** Keep both: **Native** → numeric `style={{ height, minHeight }}`. **Web** → set `--table-opponent-strip-height` and `--table-hero-zone-height` in the same `vars()` block and use them for the two sections (with transition). One code path can set vars to the same values and apply numeric style; on web, CSS can override to use the var for height so transition applies.

---

### E. CommunityBoard extraction scope

**10) CommunityBoard constants: layout math vs purely visual?**  
- **Layout math:** `FELT_HEIGHT` (from layoutHeights), padding and row heights used in `availableCardHeight` and `CARD_ROW_HEIGHT` / `COMMUNITY_CARD_SCALE` affect layout. Pot row min height and card scale are layout.
- **Purely visual:** Card gap, padding values.
- **Recommendation:** Anything that affects layout math (felt padding, pot row min height, card scale derivation) belongs in shared layout/felt constants—either `layoutHeights.ts` (if we want one file for “table layout numbers”) or `communityBoard.constants.ts` that imports `FELT_HEIGHT` from layoutHeights. Put purely visual constants in `communityBoard.constants.ts`. So: extract to `communityBoard.constants.ts`, import `FELT_HEIGHT` from layoutHeights; keep layout-derivation constants (e.g. `FELT_V_PADDING`, `POT_ROW_MIN_HEIGHT`) there so CommunityBoard doesn’t own layout semantics alone.

**11) Do other components embed “felt” magic numbers?**  
- **CommunityBoard:** Uses `FELT_HEIGHT` + inline `FELT_V_PADDING`, `FELT_BOTTOM_PADDING`, `POT_ROW_MIN_HEIGHT`, `CARD_GAP`, etc.
- **tableLayout.styles / TableSceneShell:** Use `FELT_HEIGHT` from layoutHeights for felt area.
- **ThemePickerSheet:** Uses “felt” only for color presets (FELT_PRESETS), not layout.
- No other table components use felt **layout** numbers. Extract CommunityBoard constants in one go; no need to touch DealerBar, HeroZone, or ActionBar for felt numbers.

---

### F. Continuous scaling (future)

**12) Continuous scaling: roadmap or thought experiment?**  
Treat as **thought experiment / optional follow-up.** Do not design the API now (e.g. hook returning a factor). Defer. If we do it later, the same CSS vars and transition can be reused; the hook would just compute an interpolated height instead of normal/fallback. Avoid over-engineering in the current refactor.

---

### G. Testing & verification

**13) Acceptance tests for success.**  
Proposed list (confirm as-is or extend):

- Resize browser slowly around threshold → no jumps (smooth transition on web).
- Join hand → between hands → no vertical shift.
- iOS Safari address bar collapse/expand → no band jump (profile locked on mount).
- Android Chrome address bar collapse → no band jump.
- Snapshot or assert `TOTAL_FIXED_HEIGHT` before/after refactor (see 14).

**14) Snapshot TOTAL_FIXED_HEIGHT before/after?**  
**Yes.** Before refactor, record value (e.g. in a test or comment). After: `expect(TOTAL_FIXED_HEIGHT).toBe(snapshotValue)` or a manual check. Prevents accidental layout regressions from constant moves.

---

### H. Migration safety

**15) Remove heights from tableLayout.styles in same PR as adding CSS vars?**  
**Yes, same PR.** Remove `height`/`minHeight` for `opponentStripSection` and `heroSection` in tableLayout.styles in the same change that adds CSS vars (and web transition). Avoids an in-between state where both StyleSheet and shell set heights.

---

## 5. Summary

| Item | Action |
|------|--------|
| **Fade out fallback** | Use CSS variables for opponent strip and hero zone heights; on web add `transition: height` so changes animate. Native = instant; document so “native doesn’t animate” is not a bug. |
| **Simplify constants** | Model A: domain files export normal + fallback; layoutHeights re-exports. tableLayout.styles stops setting height for the two variable bands; CommunityBoard constants in communityBoard.constants.ts (FELT_HEIGHT from layoutHeights). |
| **Ownership** | useTableLayoutHeights() is the only place that computes band heights; TableSceneShell is the only place that applies them (vars + numeric style). HeroZone must receive height when used in shell (or fill parent) to avoid fallback mismatch. |
| **Safe order** | Same PR: centralize fallbacks (Model A) → remove StyleSheet heights for two bands → add CSS vars + web transition. Then: extract CommunityBoard constants, snapshot TOTAL_FIXED_HEIGHT. Defer continuous scaling. |
