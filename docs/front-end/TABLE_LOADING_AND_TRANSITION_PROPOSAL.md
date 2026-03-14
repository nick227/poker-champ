# Table Loading Order and Transition Proposal

This document reviews the current table loading process and order (especially when leaving the loading page), and proposes a clear loading order and animation strategy for the React Native table screen so page transitions are clean and flash-free.

## Current Architecture Summary

### Components and flow

| Layer | Role |
|-------|------|
| `app/table/[id].tsx` | Route → renders `TablePage`. |
| `TablePage` | Renders `Screen`, `Surface`, **TableSceneRouter**, overlays, `BottomBar`. |
| **TableSceneRouter** | Decides **which single view** to render: `StatusTableView`, `EmptyTableView`, or `ActiveTableView`. Returns one of them; no shared parent shell. |
| **TableSceneShell** | Single chrome (top bar, opponent strip, game area, hero section, action bar, dealer bar). **Currently instantiated inside each view**, not once at the top. |
| **StatusTableView** | Uses `TableSceneShell` with `immersiveBoard`, `board = TableLoadingLanding`, empty hero, null bottom. |
| **EmptyTableView** | Uses `TableSceneShell` with full layout; `useTableViewShellFrame` → BoardArea, HeroZone, etc.; idle content. |
| **ActiveTableView** | Uses `TableSceneShell` with full layout; BoardArea, HeroZone, ActionBar, DealerAnnounceBar; active hand content. |

So today we have **three separate component trees**. Each view mounts its **own** `TableSceneShell`. When the router switches view, the previous tree (including its shell) unmounts and the next tree (and its shell) mounts.

### When we “leave” the loading page

1. **Controller** (`useTablePageController`): `hasSnapshot` becomes true (realtime delivers first snapshot) → `resolveTableSceneMode` returns `idle` or `active`.
2. **Router** (`TableSceneRouter`):
   - `showStatusView` can stay true due to **slot-spin hold**: `loadingSpinHoldUntilTs` keeps status visible for at least ~1500 ms after the slot spin starts (`onLoadingSlotSpinStart`).
   - When `showStatusView` becomes false (hold expired and we’re not in base loading / no-snapshot fallback), the next render returns **EmptyTableView** or **ActiveTableView** instead of **StatusTableView**.
3. **Result**: One frame we render `StatusTableView` (shell + loading content). Next frame we render `ActiveTableView` (different shell + game content). **Full tree swap** → unmount of one shell, mount of another → potential flash, layout recalculation, and no controlled animation.

### Root cause of flash

- **Different trees**: Status view and Active (or Empty) view are different root components. There is no single persistent shell that only changes “slot” content.
- **No transition animation**: The switch is conditional render only; there is no opacity cross-fade or staged reveal.
- **Layout differences**: Status uses `immersiveBoard` (different layout); Active/Empty use the full scroll layout with opponent strip, felt, hero, action bar. So even if we tried to animate, the layout structure changes at the same time as the content.

`TABLE_SCENE_VIEWS_OVERVIEW.md` describes the intended model: **one chrome, slot content by state**. The current implementation does not match that: it uses one chrome *per view*, so the chrome is recreated on every transition.

---

## One reveal trigger + reveal latch

The transition from loading to table content should happen only when **both** are true:

- `hasSnapshot === true`
- loading hold expired

Derive the condition, but **latch the reveal once it happens**. Snapshots can update many times (refresh, seat change, hand reset); without a latch, you risk accidental re-fades.

**Condition:**

```ts
const shouldRevealTableContent = hasSnapshot && !holdDelayActive;
```

**Latch (use this as the fade trigger):**

```ts
const [revealed, setRevealed] = useState(false);

useEffect(() => {
  if (!revealed && hasSnapshot && !holdDelayActive) {
    setRevealed(true);
  }
}, [revealed, hasSnapshot, holdDelayActive]);
```

Use **`revealed`** (not `shouldRevealTableContent`) to drive: (1) swapping from loading slots to real table slots, and (2) the fade-in animation. This prevents re-fades on snapshot refresh, seat change, or hand reset. Reset `revealed` only when leaving the table (e.g. when `tableId` or route changes).

---

## Freeze layout during loading

Using the same layout for loading and table is not enough on its own. **Reserve space for everything immediately** so React Native does not recalculate layout heights during reveal.

**Explicit rule:** All shell regions must render placeholders during loading so layout size does not change during reveal. This eliminates subtle layout pop.

Example: the shell layout should **always** render (in order):

- TopBar
- OpponentStrip (empty placeholder when loading)
- BoardArea
- HeroZone (empty placeholder when loading)
- ActionBarArea (empty placeholder when loading)
- DealerBar

**During loading:**

- **BoardArea** → loading UI (e.g. TableLoadingLanding).
- **HeroZone** → placeholder (e.g. empty view with same min height); do not omit the region.
- **ActionBarArea** → placeholder (same height); do not omit the region.
- **OpponentStrip** → skeleton or empty placeholder.

So the shell never adds or removes regions when switching from loading to table—only the **content** inside each slot changes. Layout heights stay fixed.

**Placeholder heights must be fixed (explicit constants).** Do not derive heights from layout or content. Use named constants so loading placeholders and the real shell use the same values; otherwise RN may still reflow. Example:

```ts
const HERO_ZONE_HEIGHT = 96;
const ACTION_BAR_HEIGHT = 84;
const OPPONENT_STRIP_HEIGHT = 110;
```

Loading placeholders (empty views for hero, action bar, opponent strip) should use these constants for `height` / `minHeight`. The same constants should drive the shell’s layout so there is no height change on reveal.

---

## Slot content: pure resolver; shell fully dumb

Avoid turning EmptyTableView and ActiveTableView into “content factories” that secretly own logic or layout again. That recreates mini-pages and leaks the old architecture.

**Preferred shape:** a pure function that returns slot content only:

```ts
resolveTableSceneSlots(scene, renderModel, actions) => {
  dealerBar,
  board,
  hero,
  bottom,
  opponents,
  // ... any other shell props
}
```

The router calls this and passes the result into the single shell. **Make TableSceneShell fully dumb:** the shell must not know scene state. It should only render slots.

Example:

```tsx
<TableSceneShell
  dealerBar={slots.dealerBar}
  opponents={slots.opponents}
  board={slots.board}
  hero={slots.hero}
  bottom={slots.bottom}
/>
```

Everything conditional (loading vs idle vs active, placeholders vs real content) lives in `resolveTableSceneSlots()`. This keeps the shell extremely stable.

**Router structure (final shape).** For clarity, the component tree should look like:

```
TablePage
  → TableSceneRouter
       → resolveTableSceneSlots()
       → TableSceneShell
             TopBar
             Animated(tableBody)
                 OpponentStrip
                 Board
                 HeroZone
                 ActionBar
             DealerBar
```

This ensures: shell is stable, only the table body fades, and slots swap via the resolver. TopBar and DealerBar stay outside the animated wrapper.

No component called “StatusTableView” or “EmptyTableView” that mounts anything; at most they are **helpers** that return nodes/slots for a given mode. StatusTableView must **not** remain a real view in the table route—if it survives, it is only a helper that returns nodes/slots. Otherwise the old architecture leaks back.

---

## Animation scope (v1): keep it minimal

Do **not** stage many regions initially. Animating top bar, opponent strip, board, hero, and action bar separately is easy to overcomplicate and introduces timing bugs.

**v1 first implementation:**

- Stable shell always mounted.
- Loading board content shown in the board slot until reveal.
- Swap to real content when `shouldRevealTableContent` is true.
- Fade in the **main table body** (board/game region) over a **fixed duration** (see constant below). One fade, one region.

That likely gets ~80% of the improvement. Optionally, later: hero + bottom as **one second group** (single delay, then fade together). No per-region stagger in v1.

**Avoid double-render crossfade for v1.** Keeping loading visible and crossfading with real content (two layers, opacity drive) can look nice but increases complexity and overlap weirdness. Prefer:

- **Single swap + new content fades in.** One content tree after the swap; wrap it in an `Animated.View` and run opacity 0 → 1. Add reduced motion and optional stagger only after the simple version is solid.

**Fade duration:** Use a single constant so it’s consistent and easy to tune. iOS typically feels best around 180–220 ms, Android around 160–200 ms; **180 ms is a good compromise.**

```ts
const TABLE_REVEAL_MS = 180;
```

Use `TABLE_REVEAL_MS` for the reveal fade duration everywhere.

---

## Implementation order: shell first, animation second

Order matters. Doing architectural refactor and animation choreography together makes debugging messy.

**Do this first:**

1. Router owns **one** `TableSceneShell`.
2. Status / Empty / Active **stop mounting shells**; they either disappear or become slot helpers only.
3. Loading and active use the **same overall structure** (same layout; no `immersiveBoard` for loading).
4. Slot content is driven by a pure resolver (e.g. `resolveTableSceneSlots`) keyed off `scene.mode` and the **latched** `revealed` (see “One reveal trigger + reveal latch”).

Then **test**. Only after that:

- Add fade-in wrapper for the main table body.
- Add reduced motion handling.
- Optionally add stagger (e.g. hero/bottom as a second group).

---

## Recommended phased plan

### Phase 1: Single shell, slot content only

- Router renders **one** `TableSceneShell` for connecting / idle / active.
- Same layout for loading and table; **all regions render placeholders during loading** (see “Freeze layout during loading”) so layout size does not change on reveal.
- Slot content comes from a single place: e.g. `resolveTableSceneSlots(scene, renderModel, actions)` returning `{ dealerBar, board, hero, bottom, opponents, ... }`.
- No StatusTableView as a view; at most a helper that returns slots for loading/error.
- No animation yet—just correct structure and no full-view swap. Verify no flash from tree swap.

**Operational safeguard:** During Phase 1, add debug logs in the router (temporarily):

```ts
console.log("TABLE MODE", scene.mode);
// Once Phase 2 is in place, add:
console.log("REVEAL", revealed);
```

Use these to confirm: (1) scene state is stable (mode shouldn’t flip e.g. `connecting → active → idle → active` within a few frames), and (2) the reveal latch only fires once (`revealed` goes from false to true and stays true).

### Phase 2: Fade-in on reveal

- When the **latched** `revealed` becomes true: swap to real slots, then fade in the **table body** only (see “One reveal trigger + reveal latch”).
- **Fade implementation:** Wrap only the table body—OpponentStrip, Board, Hero, ActionBar—in a **single** `Animated.View`. Leave the top bar and shell chrome (e.g. outer padding, DealerBar) outside the fade.

  Example concept:

  ```tsx
  <Animated.View style={{ opacity: revealOpacity }}>
    {tableBody}
  </Animated.View>
  ```

  This avoids the UI feeling like the entire screen blinked.
- Fade opacity 0 → 1 over `TABLE_REVEAL_MS` (180 ms). No stagger yet.
- Optionally: respect `AccessibilityInfo.isReduceMotionEnabled()` (opacity 1 immediately when true).

**Phase 2 implemented:** Reveal latch in `TableSceneRouter`, `TABLE_REVEAL_MS` in `table-layout.constants`, table body wrapped in `Animated.View` in `TableSceneShell`, slots driven by `revealed` in `useTableSceneSlots`, reduce-motion respected, dev log `REVEAL` in router.

### Phase 3: Optional stagger (later)

- If desired: a second group (e.g. opponents + hero + bottom) with one short delay then fade, or light per-region delays. Only after Phase 1 and 2 are stable.

---

## What to avoid

- **Do not keep StatusTableView as a real view** in the table route. If it survives, it is only a helper that returns nodes/slots. Otherwise the old architecture leaks back.
- **Do not** implement crossfade (two layers, loading + real) in v1; prefer single swap + fade-in.
- **Do not** stage top bar, opponent strip, board, hero, action bar separately in v1; one main body fade is enough.
- **Do not** omit shell regions during loading. Every region (OpponentStrip, BoardArea, HeroZone, ActionBarArea, etc.) must render a placeholder so layout size does not change on reveal.

---

## Summary

| Current | Proposed |
|--------|----------|
| Router returns one of three full views; each view mounts its own TableSceneShell. | Router renders one TableSceneShell; slot content from e.g. `resolveTableSceneSlots(...)`. |
| Leaving loading = unmount StatusTableView, mount ActiveTableView → full tree swap → flash. | Latched `revealed`; same shell; swap slots; single fade-in (`TABLE_REVEAL_MS`) for table body only. |
| No single reveal trigger; snapshot updates can re-trigger. | Condition `hasSnapshot && !holdDelayActive`; **latch** `revealed` once, use `revealed` for slots + fade; `TABLE_REVEAL_MS = 180`. |
| Status uses different layout (immersiveBoard). | Same shell layout for loading and table. |
| Content from three “view” components that own shell. | Pure slot resolver; no StatusTableView as a view. |
| Layout can change when swapping loading → table. | Freeze layout: all regions render placeholders during loading; only slot content changes. |
| Shell may branch on scene state. | Shell is dumb: only renders slots; all conditionals in `resolveTableSceneSlots()`. |

Phased: (1) Shell ownership + slot resolver + layout freeze + mode + reveal debug logs, (2) Fade-in table body only (top bar/chrome outside fade), (3) Optional stagger later.
