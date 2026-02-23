# Table ↔ Lobby Navigation & Multi-Table Flow

This document describes how users move between the lobby and table(s), how multi-tabling is supported, and where that behavior is implemented.

---

## Source of truth (route ↔ store)

- **The URL is the source of truth**: when the user is on `/table/[id]`, `activeTableId` must equal `id`.
- **Table screen** syncs on mount and when `[id]` changes: if the table is not in `openTableIds`, it calls `openTable(id)`; then it always calls `setActive(id)`.
- **All entry points** that navigate to a table also update the store: dropdown and tabs call `setActive(id)` then `router.push(tablePath(id))`.
- **Bottom bar “Tables”** navigates to `activeTableId ?? openTableIds[0]`, or to lobby when there are no open tables.
- **Result**: URL and multi-table store stay in sync; tabs highlight correctly; “Tables” returns to the current game.

---

## 1. Overview

- **Lobby** (`/lobby`): List of games, create game, join a table, see active table count, open “Active Tables” list.
- **Table** (`/table/[id]`): Single table view; user can have multiple tables “open” and switch between them via tabs or by returning to lobby and re-selecting.
- **State**: Which tables are open and which is “active” is held in the multi-table store; the current screen is driven by Expo Router (URL).

---

## 2. Routes & Screens

| Route        | Screen    | Purpose                          |
|-------------|-----------|-----------------------------------|
| `/`         | index     | Entry; redirects to login/lobby   |
| `/login`    | login     | Auth                              |
| `/lobby`    | lobby     | Game list, join, create, active tables |
| `/table/[id]` | table   | One table by ID                   |
| `/settings` | settings  | Settings                          |

- **Table screen** is always **one table per route**: `/table/abc`, `/table/xyz`. There is no single “table stack” route; each table is a separate route with its own `[id]`.
- **Bottom bar** has: Lobby, Tables, Settings. “Tables” does not go to a generic table list; it goes to a specific table (see below).

---

## 3. Multi-Table State (Store)

**Store**: `src/stores/multitable.store.ts` (used via `storeRegistry.use.tables()`).

| State / API            | Meaning |
|------------------------|--------|
| `openTableIds: string[]` | Up to 8 table IDs the user has “joined” and can return to. Newest is at index 0 when just added. |
| `activeTableId: string \| null` | Which of those tables is considered “active” (e.g. for tab highlight). |
| `openTable(id)`        | Add table to `openTableIds` (or move to front if already there); set `activeTableId = id`. Cap at 8. |
| `closeTable(id)`       | Remove table from `openTableIds`; if it was `activeTableId`, set active to first remaining or null. |
| `setActive(id)`        | Set `activeTableId = id` (used when switching tabs). |
| `tableSenders`         | Per-table realtime senders for dispatching actions. |

- **Opening a table** (joining from lobby) calls `openTable(id)` then `router.push(tablePath(id))`.
- **Closing a table** (✕ on table screen) calls `closeTable(id)` then `router.replace(lobbyPath())`.

---

## 4. Lobby → Table (Join a New Table)

1. User is on **Lobby** (`/lobby`).
2. Taps **Join** on a `GameTableRow` → opens **ChooseTableModal** (buy-in, speed, players).
3. On **Apply** in the modal:
   - `openTable(chooseTableModal.id)` adds that table to `openTableIds` and sets `activeTableId` to it.
   - `router.push(tablePath(chooseTableModal.id))` navigates to `/table/[id]`.
4. User lands on the **Table** screen for that `[id]`.

**Files**: `app/lobby.tsx` (handleJoinApply, ChooseTableModal), `tablePath` in `src/lib/nav.ts`.

---

## 5. Lobby: Viewing Active Tables & Rejoining

- **Table count**: `TableNotificationBell` in the lobby shows `openTableIds.length` (badge). Tapping it opens **ActiveTablesDropdown**.
- **Active Tables dropdown** (modal):
  - Lists entries derived from `openTableIds` (e.g. id, pot, bank, bet, “Your turn”). (Pot/bet/turn are mock data for now; real per-table state is deferred.)
  - Tapping a row: `setActive(id)` then `router.push(tablePath(id))`, then closes the modal. Tab highlight matches immediately.

**Files**: `app/lobby.tsx` (TableNotificationBell, ActiveTablesDropdown, activeTableRows from openTableIds), `src/components/domain/table/TableNotificationBell.tsx`, `src/components/domain/table/ActiveTablesDropdown.tsx`.

---

## 6. Table Screen: Switching Between Open Tables

- **MultiTableTabs** (above the table content):
  - Renders up to the first 4 of `openTableIds` as tabs. Tabs are thin: only `setActive(id)` + `router.push(tablePath(id))`.
  - “Active” tab is the one where `id === activeTableId` (kept in sync by table screen mount).
  - If more than 4 tables are open, a “+N” tab is shown; tapping it opens **ActiveTablesDropdown** (same as lobby) to pick a table.
- **Bottom bar “Tables”**:
  - Navigates to `activeTableId ?? openTableIds[0]`, or to **lobby** when there are no open tables. So “Tables” returns to the current game.

**Files**: `app/table/[id].tsx` (MultiTableTabs), `src/components/domain/table/MultiTableTabs.tsx`, `src/components/containers/BottomBar.tsx`.

---

## 7. Table → Lobby (Leave Table)

- **✕ button** (top-right on table):
  - Calls `closeTable(String(id))` then `router.replace(lobbyPath())`.
  - User lands on **Lobby**; that table is removed from `openTableIds`.
- **Back (←)** in top bar: `router.back()` only — does **not** call `closeTable`, so the table stays in `openTableIds` and the user can return to it via Active Tables or tabs if they have another table open.

**Files**: `app/table/[id].tsx` (topBarRight ✕ handler, topBarLeft ←).

---

## 8. Flow Summary Diagram

```
                    ┌─────────────────────────────────────────────────────────┐
                    │ LOBBY (/lobby)                                            │
                    │  • Game list → Join → ChooseTableModal → Apply            │
                    │  • openTable(id) + router.push(/table/[id])               │
                    │  • TableNotificationBell(count) → ActiveTablesDropdown   │
                    │  • Dropdown: setActive(id) + router.push(/table/[id])   │
                    └─────────────────────────────────────────────────────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         ▼                         │
                    │  ┌─────────────────────────────────────────────┐   │
                    │  │ TABLE (/table/[id])                         │   │
                    │  │  • MultiTableTabs: setActive(id) + push    │   │
                    │  │  • ✕: closeTable(id) + replace(lobby)       │   │
                    │  │  • ←: router.back() (table stays open)      │   │
                    │  └─────────────────────────────────────────────┘   │
                    │                         │                           │
                    │  Bottom bar "Tables" ───┴──► tablePath(active ?? first) or lobby │
                    └─────────────────────────────────────────────────────┘
```

---

## 9. Gaps & Quirks (Current Behavior)

1. ~~**Bottom bar “Tables”**~~ — **Resolved.** Now goes to `activeTableId ?? openTableIds[0]`, else lobby.
2. ~~**Active Tables dropdown**~~ — **Resolved.** Selection calls `setActive(id)` then `router.push(tablePath(id))`.
3. ~~**Table screen mount**~~ — **Resolved.** On mount/ID change: if not open → `openTable(id)`, then `setActive(id)`. Deep links stay in sync.
4. **Active table list data** (lobby dropdown): Pot/bank/bet/your-turn are still mock (fixed mapping over `openTableIds`). Real per-table state is deferred; not required for nav correctness.
5. **Max 4 visible tabs**; overflow: when > 4 tables open, a “+N” tab opens **ActiveTablesDropdown** so all tables are reachable from the table screen.
6. **No “table index” route**: There is no `/table` that shows a list; “Tables” in the bottom bar navigates to the active (or first) table, or lobby.

---

## 10. Key Files Reference

| Concern              | File(s) |
|----------------------|--------|
| Routes / paths       | `src/lib/nav.ts`, `src/registry/screen.registry.ts` |
| Multi-table state    | `src/stores/multitable.store.ts` |
| Lobby screen         | `app/lobby.tsx` |
| Join flow            | `app/lobby.tsx`, `src/components/domain/lobby/ChooseTableModal.tsx` |
| Active tables on lobby | `app/lobby.tsx`, `TableNotificationBell`, `ActiveTablesDropdown` |
| Table screen         | `app/table/[id].tsx` |
| Table tabs / close   | `MultiTableTabs.tsx`, `app/table/[id].tsx` (topBarLeft/Right) |
| Bottom bar           | `src/components/containers/BottomBar.tsx` |
