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

## Proposal: Single Shell + Slot Content + Explicit Loading Order

Goal: one persistent **TableSceneShell** for the table route, with clear **loading order** and **animation-in** of the main top-level table elements so that leaving the loading page feels controlled and flash-free on RN.

### 1. Single shell at router level

- **TableSceneRouter** should render **one** `TableSceneShell` for the whole table screen (for states that show the table at all: connecting, idle, active).
- The router does **not** choose between three full views that each include a shell. It chooses **which content to pass into the shell slots**: dealerBar, board, hero, bottom, and optionally topBarRight / opponents.
- Auth-only states (e.g. auth_loading, auth_required) can remain a separate minimal screen if desired, or reuse the same shell with “status” slot content; either way, the **table** path (connecting → idle → active) should use one shell.

This matches the existing design doc and removes the unmount/remount of the shell on transition.

### 2. Loading “leave” order (when snapshot becomes available and hold expires)

Define a strict order so that the shell and then the main regions appear in a predictable way:

1. **Shell first (stable)**  
   The shell (top bar, opponent strip area, game area container, hero area, action bar area, dealer bar) is already mounted and laid out. No structural change when we leave loading.

2. **Content swap in the “board” slot**  
   Replace loading content (e.g. `TableLoadingLanding`) with the real table content. Prefer a **single content swap** in the board slot (and any other slots that differ) so we don’t thrash layout. For connecting, the board slot shows loading/status content; for idle/active it shows `BoardArea` (and the rest of the layout is already the same structure as Empty/Active).

3. **Staged reveal of main elements (optional but recommended)**  
   To avoid a single instant “pop” of all content, reveal top-level table elements in a fixed order, e.g.:
   - Top bar (already visible in shell).
   - Opponent strip (data appears).
   - Board + pot (felt + community cards).
   - Hero zone.
   - Action bar / bottom CTA.

   Each step can be opacity 0 → 1 (or a short fade) with a small delay, so the transition feels intentional rather than a flash.

### 3. Animation-in strategy for RN

- **Single shell**: No shell unmount/remount; only slot content and props change. This alone reduces flash.
- **Board slot**: When transitioning from loading to table, swap the board slot content (loading UI → `BoardArea`). Option A: swap immediately but wrap the new content in an `Animated.View` that fades in (opacity 0 → 1 over ~150–250 ms). Option B: keep loading visible and cross-fade (two layers, opacity drive) then unmount loading. Prefer the simplest approach that doesn’t require double layout (e.g. Option A with a single content swap + fade-in).
- **Staged reveal**: If we want a cascade, each region (opponent strip, game area, hero, bottom) can be wrapped in a wrapper that:
  - Renders its children.
  - Uses `Animated.View` with opacity driven by a shared “reveal” timeline (e.g. delays 0, 50, 100, 150, 200 ms).
  - Respects `AccessibilityInfo.isReduceMotionEnabled()`: when true, skip delays and set opacity to 1 immediately (or skip animation).
- **No layout thrash**: Use the same layout for “connecting” as for “idle/active” (same shell structure). Avoid `immersiveBoard` for the loading state if it changes layout; instead use the same scroll/layout as the main table with the board slot filled by loading content so that when we swap to `BoardArea`, only the content changes, not the structure.

### 4. Status view alignment

- **StatusTableView** today uses `TableSceneShell` with `immersiveBoard` and a different structure. To get a single shell and no flash:
  - **Option A**: Remove the separate StatusTableView component for the table route. Router always renders one `TableSceneShell`; when in auth_loading / auth_required / connecting (or hold), it passes “status” slot content (e.g. `TableLoadingLanding` in the board slot, empty hero, status dealer bar, “Return to lobby” in bottom). When in idle/active, it passes the real content. Same shell, same layout, only slot content changes.
  - **Option B**: Keep StatusTableView but have it only supply **slot content** (dealerBar, board, hero, bottom), and have the router render the single shell and pass that content in. Then StatusTableView is a “content provider” for the shell, not a full page that mounts its own shell.

Either way, the shell must be rendered once by the router (or a single parent), and Status/Empty/Active only supply props/slots.

### 5. Hold delay behavior

- Keep the existing “slot spin” hold: don’t reveal table content until the chosen minimum time (e.g. 1500 ms) after the loading animation starts, so the transition doesn’t feel abrupt.
- When the hold expires, the **reveal** should be the single-shell content swap + optional staged fade-in, not a full view swap.

### 6. Implementation checklist (high level)

- [ ] Refactor **TableSceneRouter** to render **one** `TableSceneShell` for connecting/idle/active.
- [ ] Derive **slot content** (dealerBar, board, hero, bottom, opponents, topBarRight) from `scene.mode`, `renderModel`, and `actions`, instead of rendering full Status/Empty/Active views.
- [ ] For connecting (and hold): pass loading content into the same shell slots; use the **same layout** as idle/active (no `immersiveBoard` for this path if it changes structure).
- [ ] On transition from loading to table: swap board (and other slots) to real content; optionally wrap new content in `Animated.View` and run a short opacity 0 → 1 (and optionally staged delays for each region).
- [ ] Honor reduced motion: when `AccessibilityInfo.isReduceMotionEnabled()` is true, skip reveal delays and use opacity 1 (or no animation).
- [ ] Remove or repurpose **StatusTableView** so it no longer mounts its own shell; use it only as a content factory or inline its content into the router’s slot resolution.
- [ ] Keep **EmptyTableView** and **ActiveTableView** as content factories (they return slot props or React nodes for dealerBar, board, hero, bottom) or inline their slot content into the router so the single shell is always filled by the same resolution logic.

---

## Summary

| Current | Proposed |
|--------|----------|
| Router returns one of three full views; each view mounts its own TableSceneShell. | Router renders one TableSceneShell and only changes slot content (dealerBar, board, hero, bottom, etc.). |
| Leaving loading = unmount StatusTableView, mount ActiveTableView → full tree swap → flash. | Leaving loading = same shell; swap slot content; optional fade-in or staged opacity. |
| No defined loading order or animation-in. | Shell stable first; then content swap; then optional staged reveal (top bar → opponents → board → hero → action bar) with RN Animated. |
| Status uses different layout (immersiveBoard). | Use same shell layout for connecting and table so only content changes. |

This gives the RN app a single source of truth for the table chrome, a well-defined loading order, and a path to clean, flash-free page transitions when leaving the loading page.
