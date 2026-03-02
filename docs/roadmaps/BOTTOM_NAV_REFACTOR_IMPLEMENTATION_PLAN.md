# Bottom Bar Nav Refactor – Implementation Plan

## Goal
- Replace **Slots** in the bottom bar with **Settings** (mothball slots page; keep route, remove from nav).
- Move **History** content to the bottom of the **Settings** page; add user **name** and **email** to Settings.
- Replace the **History** bottom tab with a new **Lessons** tab that links to Poker School lessons.
- End with customizing the new Lessons page (copy, layout, links).

---

## 1. Screen registry and BottomBar

**File: `apps/client/src/registry/screen.registry.ts`**

- **Slots:** Set `showInBottomBar: false`. Keep `path: "/slots"` and `componentPath` so the page still works when opened directly (mothballed).
- **Settings:** Set `showInBottomBar: true` so Settings appears in the bottom bar.
- **History:** Set `showInBottomBar: false` (history is no longer a tab; content moves to Settings).
- **Lessons:** Add a new screen key `lessons`:
  - `path: "/lessons"`
  - `authRequired: true`
  - `title: "Poker School"` (or "Lessons")
  - `showInBottomBar: true`
  - `bottomBarLabel: "Lessons"`
  - `componentPath: "app/lessons.tsx"`

**File: `apps/client/src/components/containers/BottomBar.tsx`**

- Update `Tab` type: remove `"history"`, add `"lessons"`. Result: `Tab = Extract<ScreenKey, "lobby" | "table" | "lessons" | "leaderboard" | "settings">`.
- No other logic changes; bottom bar still renders from `bottomBarScreens`.

**Outcome:** Bottom bar shows Lobby, Lessons, Leaderboard (if enabled), Settings. Slots and History are not in the bar.

---

## 2. Profile: add email for Settings

**File: `apps/client/src/lib/profileFromMe.ts`**

- Add `email?: string` to `Profile`.
- In `parseProfileFromMe`, read `u?.email` and set `email` on the returned object (only if string).

**Outcome:** Settings can display user email.

---

## 3. Settings page: name, email, and Hand History section

**File: `apps/client/app/settings.tsx`**

- **Name and email:** Add a small block near the top (e.g. under or beside `ProfileAvatarSection`): display `profile.username` as name and `profile.email` (if present). Reuse existing `profile` from `useProfile()`.
- **Hand History at bottom:** Add the same content that currently lives on the History page:
  - Reuse: `HistoryTabs`, `HistoryOverviewTab`, `HandList`, `HandDetailModal`, `ReplaySheet`.
  - Reuse: same data loading (overview, hands list, pagination, hand detail, replay) and `historyStore`.

To avoid duplicating logic, extract a **reusable Hand History block** from the current history page and use it on Settings only (History page will be removed or redirected).

**New component (recommended): `apps/client/src/components/domain/history/HandHistorySection.tsx`**

- Props: `currentUserId: string`, `onReplayPress` (or similar for opening replay).
- Contains: `HistoryTabs`, `HistoryOverviewTab`, `HandList`; loads overview and hands via `historyService` and `historyStore`; opens `HandDetailModal` and `ReplaySheet` internally (or accepts callbacks).
- Settings page renders this section in a scrollable area below the existing settings blocks (avatar, toggles, deposit, logout).

**Optional:** If we keep a `/history` route for deep links, redirect `/history` → `/settings` (so “Hand History” is only on Settings). Otherwise remove `app/history.tsx` and the history screen entry’s path (or leave path for redirect only).

**Outcome:** Settings shows name, email, existing settings, then Hand History (overview + hands + detail modal + replay) at the bottom.

---

## 4. History route and page

- **Option A (recommended):** Keep `app/history.tsx` as a thin redirect: `router.replace("/settings")` (or equivalent). Keep `path: "/history"` in registry for any existing links; no bottom bar entry.
- **Option B:** Delete `app/history.tsx` and point `/history` to a redirect in routing (e.g. in layout or index) to `/settings`.

**Files that reference “history” tab or `/history`:**

- `apps/client/app/replay/[handId].tsx`: currently `<BottomBar active="history" />`. Change to `<BottomBar active="lessons" />` or a tab that makes sense in context (e.g. keep “lessons” so replay doesn’t highlight a tab that no longer exists).

**Outcome:** No standalone History tab; history lives only on Settings. Direct `/history` URLs can redirect to Settings.

---

## 5. New Lessons page (shell)

**New file: `apps/client/app/lessons.tsx`**

- Same shell as other main screens: `Screen`, `Masthead`, `AppTopNav`, `BottomBar active="lessons"`.
- Use `useProfile`, `useBankroll`, `storeRegistry.use.lobby()`, `useLobbyRealtimeBridge` for top nav (username, online count, bankroll, avatar).
- Main content: a single scrollable area with placeholder copy and a few lesson links (see step 6).
- Optional: respect `EXPO_PUBLIC_ENABLE_LESSONS_V1` to show “Lessons coming soon” when disabled.

**Outcome:** A working Lessons tab that opens a full-screen page with nav and a placeholder for lesson links.

---

## 6. Customize the Lessons page (content and UX)

- **Positioning (from roadmap):** “Poker School” feel: “Train like a pro. Think in EV. Execute with confidence.” Focus on decision quality and bankroll protection, not a generic quiz app.
- **Content structure:**
  - Short headline (e.g. “Poker School” or “Lessons”).
  - One or two lines of value copy (e.g. “Fix leaks. Track impact. Improve your winrate.”).
  - **Lesson cards/links:** One card per lesson. Each card:
    - Title (e.g. from roadmap: “Stop Bleeding: RFI Discipline by Position” for L1, “Punish Opens: 3-Bet / Call / Fold” for L2, “Stop Overfolding Your Big Blind” for L3).
    - One-line description or “Primary leak this lesson fixes” style line.
    - Link to ` /lesson/[lessonId]` (open in same app; lesson IDs from seed/API, e.g. `lesson_preflop_3bet_001`, `lesson_flop_pot_odds_001`, and future L1/L2/L3 IDs when available).
  - Use existing lesson route `app/lesson/[lessonId].tsx`; no new route needed.
- **Data:** Lessons can be hardcoded at first (id, title, short description, path). Later, replace with API (e.g. list lessons) if desired.
- **Visuals:** Reuse existing card/surface styles; keep the page short and scannable. Optional: difficulty badge, estimated time (from roadmap “estimated minutes”) when available from API.

**Outcome:** Lessons tab is the main entry for Poker School: clear positioning and direct links to each lesson, with copy aligned to the premium content pack (L1–L3) and existing seeded lessons.

---

## Implementation order (recommended)

1. **Registry + BottomBar** – Slots out, Settings in; History out, Lessons in; update `Tab` type.
2. **Profile email** – Add `email` to `Profile` and `parseProfileFromMe`.
3. **Settings** – Add name/email block; add Hand History section (extract `HandHistorySection` from current history page and use it on Settings).
4. **History route** – Redirect `/history` → `/settings` (and update replay page BottomBar active if needed).
5. **Lessons page** – Create `app/lessons.tsx` with shell and placeholder content.
6. **Lessons page content** – Add headline, value copy, and lesson cards with links to `/lesson/[lessonId]`; align copy with roadmap (L1–L3 titles and positioning).

---

## File checklist

| Action | File |
|--------|------|
| Edit | `apps/client/src/registry/screen.registry.ts` |
| Edit | `apps/client/src/components/containers/BottomBar.tsx` |
| Edit | `apps/client/src/lib/profileFromMe.ts` |
| Add | `apps/client/src/components/domain/history/HandHistorySection.tsx` (extract from history.tsx) |
| Edit | `apps/client/app/settings.tsx` |
| Edit or replace | `apps/client/app/history.tsx` (redirect to settings) |
| Edit | `apps/client/app/replay/[handId].tsx` (BottomBar active) |
| Add | `apps/client/app/lessons.tsx` |

No new routes beyond `/lessons`; `/lesson/[lessonId]` already exists.
