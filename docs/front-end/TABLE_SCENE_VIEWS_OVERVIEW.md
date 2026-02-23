# Table scene views – overview

This document describes how the table screen works: one chrome, slot content by state, and guardrails to keep it from regressing.

## Design mental model (not “modes”)

Think in:

- **hasSnapshot** – do we have table data?
- **hasActiveHand** – is there a hand in progress?

Everything else is **message selection**. The table is always visible (one shell). Code may still use `scene.mode` internally, but design-wise we only switch on snapshot/hand and choose which message to show in the dealer bar and which content to put in the slots.

## Key files

| File | Role |
|------|------|
| `app/table/[id].tsx` | Route: wraps scene in `Screen`, optional `MultiTableTabs`, `TableScreenScene`, `TableScreenOverlays`, `BottomBar`. |
| `app/table/TableScreenScene.tsx` | **Router**: switches on `scene.mode` and renders one of five branches (auth_loading, auth_required, connecting, idle, active). |
| `app/table/useTableScreenController.tsx` | Builds `scene`, `renderModel`, `actions`. Calls `useTableScene()` for `sceneMode`; passes `tableError`, `tableStatus`, etc. |
| `components/domain/table/tableScene.orchestration.ts` | **Mode logic**: `resolveTableSceneMode(authHydrated, hasAuthToken, hasSnapshot, hasActiveHand)` → one of five modes. |
| `components/domain/table/hooks/useTableScene.ts` | Consumes controller data, returns `sceneMode` and `tableTopBarFlags`. |
| `components/domain/table/TableSceneShell.tsx` | **Single table chrome**: title, top bar, opponent strip, game area, hero, action bar. Used for connecting, idle, and active. |
| `components/domain/table/TableLayout.tsx` | Active table: fills TableSceneShell slots (DealerAnnounceBar, CommunityBoard, HeroZone, ActionBar). |
| `components/domain/table/EmptyTableView.tsx` | Idle table: fills TableSceneShell with empty/minimal content. |
| `components/domain/table/ConnectingCard.tsx` | Board-slot content when connecting/error: message + “Return to lobby”. Same chrome, center area only. |
| `components/domain/table/DealerAnnounceBar.tsx` | Single message bar: game messages or `statusMessage` (connecting/error). |
| `components/domain/table/TableTopBar.tsx` | Top bar inside shell: balance, optional left/right. |

## How mode is chosen

Mode does **not** depend on `tableError`. It depends only on:

- `authHydrated`
- `hasAuthToken`
- `hasSnapshot` (table snapshot from realtime)
- `hasActiveHand` (snapshot has an active hand)

Logic in `tableScene.orchestration.ts`:

1. `!authHydrated` → **auth_loading**
2. `!hasAuthToken` → **auth_required**
3. `!hasSnapshot` → **connecting**
4. `!hasActiveHand` → **idle**
5. Else → **active**

So “room not found” (or any error that prevents a snapshot) keeps the app in **connecting**; `scene.tableError` is only used inside that branch to pick the message (e.g. `room "Xteze6pts" not found`).

## The five views (what is shown / hidden)

### 1. `auth_loading`

- **Condition**: Auth not yet hydrated.
- **Rendered**: **TableSceneShell** (StatusShell) – masthead “Connecting…”, dealer bar “Restoring session…”, ConnectingCard, bottom “Return to lobby”.
- **Layout**: Same chrome as all other states.

### 2. `auth_required`

- **Condition**: No auth token.
- **Rendered**: **TableSceneShell** (StatusShell) – masthead “Connecting…”, dealer bar “Session required. Redirecting to login…”, ConnectingCard, bottom “Go to login”.
- **Layout**: Same chrome.

### 3. `connecting` (includes “error” view)

- **Condition**: No snapshot yet. Includes: loading, “room not found”, missing buy-in, disconnect/reconnect messages.
- **Rendered**: **TableSceneShell** (same chrome as idle/active) with:
  - **Masthead**: title “Connecting…”, 0 / 6 players, top bar (profile, balance, `tableTopBarRight`).
  - **Opponent strip**: spacer (empty opponents).
  - **Dealer bar**: `DealerAnnounceBar` with `statusMessage` (same message text).
  - **Board**: **ConnectingCard** (message + “Return to lobby” link).
  - **Hero**: empty spacer.
  - **Bottom**: “Return to lobby” button.
- **Message** (in order of precedence): missing buy-in → `scene.tableError` → status-based “Connecting…”, “Reconnecting…”, or “Connecting to table (status)…”.
- **Layout**: Same shell as idle/active; only slot content differs. Feels like the table waiting.

### 4. `idle`

- **Condition**: Has snapshot, no active hand.
- **Rendered**: **EmptyTableView** → **TableSceneShell** with empty/minimal content (DealerAnnounceBar, CommunityBoard, HeroZone, optional Rebuy).
- **Layout**: Full shell – title section, top bar, opponent strip, game area, hero section, bottom. Consistent with active.

### 5. `active`

- **Condition**: Has snapshot and active hand.
- **Rendered**: **TableLayout** → **TableSceneShell** with full game content (DealerAnnounceBar, CommunityBoard, HeroZone, ActionBar/Rebuy).
- **Layout**: Same full shell as idle; only the content in each slot changes.

## Single table chrome

There is **one** table chrome for the whole table route: **TableSceneShell** is always mounted (including auth and connecting). Only the **slot content** changes:

- **Dealer bar**: Game messages (hand, action, result, waiting) or `statusMessage` when no table yet (auth/connecting/error).
- **Board**: CommunityBoard + pot, or **ConnectingCard** (same message + “Return to lobby”) when no table yet.
- **Hero**: HeroZone with cards/stack/actions, or empty spacer when no table yet.
- **Bottom**: ActionBar, Rebuy, “Return to lobby”, or “Go to login” (auth_required).

The different branches are just message selection inside the same structure.

---

## Guardrails (prevent regression)

1. **Never introduce another shell**  
   If someone adds `FooTableShell.tsx`, it’s a smell. Everything must live inside **TableSceneShell**. One chrome only.

2. **DealerAnnounceBar owns all textual status**  
   No other component should show “Connecting”, “Error”, “Waiting”, or any status sentence. If it’s a sentence, it goes in the dealer bar (via `statusMessage` or derived game message). Components like ConnectingCard **receive** the message as a prop; they don’t define it.

3. **Board slot always reserves height**  
   Even ConnectingCard must match the board height (same as CommunityBoard). Prevents vertical jitter when switching between connecting and table content.

4. **Avoid layout jitter**  
   All vertical bands use fixed height + minHeight in `tableLayout.styles`; board slot content (CommunityBoard, ConnectingCard) uses the same height and minHeight. Use `collapsable={false}` on shell and key layout views. Shell section class names come from `tableLayout.constants` so spacing stays consistent. The test `tableLayout.constants.test.ts` snapshots the sum of band heights—update it only when intentionally changing layout.

---

## Scenario stress test

| Scenario | Masthead | Dealer bar | Center | Bottom |
|----------|----------|------------|--------|--------|
| **Cold open, slow auth** | “Connecting…” | “Restoring session…” | ConnectingCard | Return to lobby |
| **Room not found** | “Connecting…” | “Room not found” (or tableError) | ConnectingCard, same message | Return to lobby |
| **Between hands** | Table name, blinds, N/M players | “Waiting for players” / status | Board empty | Rebuy / Sit |
| **Mid-hand** | Table name, blinds, N/M players | “Bot raises to $5” | Board + cards + pot | Action bar |

All of these use the same shell; only message and slot content change.

## Key states summary

| State        | Mode        | Snapshot | Shell used     | Masthead |
|-------------|-------------|----------|----------------|----------|
| Restoring   | auth_loading| no       | TableSceneShell | yes (“Connecting…”) |
| Login needed| auth_required | no    | TableSceneShell | yes (“Connecting…”) |
| Connecting / error | connecting | no  | TableSceneShell | yes (“Connecting…”) |
| Idle table  | idle        | yes      | TableSceneShell | yes (table name) |
| Active hand | active      | yes      | TableSceneShell | yes (table name) |

## Conditions at a glance

- **auth_loading**: `!authHydrated`
- **auth_required**: `authHydrated && !hasAuthToken`
- **connecting**: `authHydrated && hasAuthToken && !hasSnapshot` (covers loading, room not found, any error that prevents snapshot)
- **idle**: `hasSnapshot && !hasActiveHand`
- **active**: `hasSnapshot && hasActiveHand`

**Masthead title**: When there is no snapshot (auth or connecting), masthead shows “Connecting…”. When there is a snapshot, it shows table name, blinds, and player count from the snapshot. To show table id or “Table” in the masthead when connecting, add a display label to `scene` and pass it into the shell.

**statusMessage priority** (in `statusMessageFor`): auth_loading → auth_required → missing buy-in → `scene.tableError` → DISCONNECTED → RECONNECTING → other tableStatus. All status text is defined in one place; DealerAnnounceBar and ConnectingCard receive it as props.

**Optional follow-ups** (only if you want to tighten further): move `statusMessageFor` into a small `tableStatusMessage.ts` next to `tableScene.orchestration.ts` so message selection lives in domain/table; or introduce a scene descriptor object (`{ mastheadTitle, statusMessage, bottomKind }`) and fill slots from it so TableScreenScene stays purely presentational.
