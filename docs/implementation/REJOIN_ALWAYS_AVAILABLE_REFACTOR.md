# Rejoin While Sitting Out: Current Flow and Refactor Proposal

## Goal

Make rejoin reliably available and convenient:

- A seated user who is `SITTING_OUT` can always press **Rejoin** while the table exists.
- Rejoin can be attempted at any time (between hands or mid-hand).
- If rejoin fails (including table no longer existing), the user sees a clear table error state.

## Current Flow (As Implemented)

## Server path

1. Client sends `SET_SITTING_OUT` with `{ sittingOut: false }`.
2. `PokerRoom` validates and routes to dealer:
   - [src/rooms/PokerRoom.ts:652](C:/wamp64/www/poker-champ/src/rooms/PokerRoom.ts:652)
3. Dealer applies rejoin semantics:
   - [src/engine/Dealer.ts:921](C:/wamp64/www/poker-champ/src/engine/Dealer.ts:921)
   - If `street === "WAITING"` and chips > 0: status set `ACTIVE`, may start hand.
   - If mid-hand and chips > 0: player becomes eligible for next hand (not added to current hand).
   - If `stackCents <= 0`: status remains/sets `OUT`.

## Join/restore behavior

- On restore/reconnect, server also tries to clear sit-out:
  - [src/rooms/PokerRoom.ts:766](C:/wamp64/www/poker-champ/src/rooms/PokerRoom.ts:766)
  - [src/rooms/PokerRoom.ts:1533](C:/wamp64/www/poker-champ/src/rooms/PokerRoom.ts:1533)

## Client rendering path

1. Controller computes hero sitting-out from display status:
   - [apps/client/src/features/table-page/useTablePageController.tsx:324](C:/wamp64/www/poker-champ/apps/client/src/features/table-page/useTablePageController.tsx:324)
   - [apps/client/src/components/domain/table/table.adapter.ts:147](C:/wamp64/www/poker-champ/apps/client/src/components/domain/table/table.adapter.ts:147)
2. Rejoin button currently appears in `ActiveTableView` bottom only:
   - [apps/client/src/components/domain/table/views/ActiveTableView.tsx:182](C:/wamp64/www/poker-champ/apps/client/src/components/domain/table/views/ActiveTableView.tsx:182)
3. Idle/no-hand state uses `EmptyTableView`, which has no rejoin CTA:
   - [apps/client/src/components/domain/table/views/EmptyTableView.tsx:1](C:/wamp64/www/poker-champ/apps/client/src/components/domain/table/views/EmptyTableView.tsx:1)

## Error handling path

- Table errors are stored and mostly shown as toast in controller:
  - [apps/client/src/features/table-page/useTablePageController.tsx:440](C:/wamp64/www/poker-champ/apps/client/src/features/table-page/useTablePageController.tsx:440)
- `TABLE_GONE` currently triggers immediate close/navigate to lobby:
  - [apps/client/src/realtime/tableRealtime.message.ts:108](C:/wamp64/www/poker-champ/apps/client/src/realtime/tableRealtime.message.ts:108)
  - [apps/client/src/features/table-page/useTablePageController.tsx:302](C:/wamp64/www/poker-champ/apps/client/src/features/table-page/useTablePageController.tsx:302)

## Gaps Blocking "Always Rejoin"

1. Rejoin CTA is not universal.
- It exists in `ActiveTableView` but not `EmptyTableView`.
- Result: seated sitting-out users can be stuck in no-hand view with no rejoin button.

2. Rejoin pending can get stuck disabled.
- `rejoinPending` is set `true` on click and only reset when hero leaves `SITTING_OUT`.
- If request fails and hero stays `SITTING_OUT`, the button can remain disabled.
- Source: [apps/client/src/components/domain/table/views/ActiveTableView.tsx:75](C:/wamp64/www/poker-champ/apps/client/src/components/domain/table/views/ActiveTableView.tsx:75)

3. Rejoin action is implemented as toggle.
- Controller computes `targetSittingOut = !heroIsSittingOut`.
- This is less robust than an explicit rejoin intent.
- Source: [apps/client/src/features/table-page/useTablePageController.tsx:371](C:/wamp64/www/poker-champ/apps/client/src/features/table-page/useTablePageController.tsx:371)

4. Error UX is weak for rejoin failure.
- Failures are mostly toast-only in active/idle scenes.
- `TABLE_GONE` auto-redirect can prevent users from seeing a stable error state after pressing Rejoin.

## Refactored Rejoin Button (Strong Solution)

## Product behavior

When `hero.youAreSeated && heroDisplayStatus === "SITTING_OUT"`:

- Always render a primary **Rejoin** CTA in both:
  - `ActiveTableView`
  - `EmptyTableView`
- Rejoin remains available at any table phase.
- If table is gone or request fails, show explicit table error state (not only a transient toast).

## Client refactor

1. Replace toggle-based API with explicit intent.
- Add `actions.rejoinHero()` instead of relying on `toggleHeroSittingOut()` for this CTA.
- `rejoinHero()` always sends "sit in" intent (`sittingOut: false`), never inversion logic.

2. Extract shared CTA component.
- Create one `RejoinCTA` used by both views.
- Props:
  - `visible`
  - `pending`
  - `errorMessage`
  - `onPressRejoin`
  - `onBackToLobby` (when fatal)

3. Replace brittle pending logic with a small state machine.
- States: `idle | sending | failed`.
- Exit `sending` on any of:
  - snapshot confirms not sitting out
  - server `ERROR` for this action
  - transport disconnect/send failure
  - timeout (e.g., 3-5s watchdog)
- Always allow retry from `failed`.

4. Show table error view after failed rejoin.
- Introduce a recoverable in-scene error surface for rejoin failures.
- For `TABLE_GONE`, show table error state first, then offer `Back to lobby`.
- Do not silently trap this to toast only.

## Server/API hardening

1. Keep current dealer semantics for successful rejoin.
- Existing behavior already matches "rejoin anytime while table exists."

2. Add explicit rejoin endpoint/message (recommended).
- New inbound message: `REJOIN`.
- Server handles as idempotent "sit back in" request.
- Internally maps to `setPlayerSittingOut(userId, false)`.
- Benefits:
  - no toggle ambiguity
  - cleaner telemetry and audits
  - easier client retry logic

3. Return explicit rejoin errors.
- Suggested codes:
  - `REJOIN_FAILED_TABLE_GONE`
  - `REJOIN_FAILED_NOT_SEATED`
  - `REJOIN_FAILED_OUT_OF_CHIPS`
  - `REJOIN_FAILED_TEMPORARY`

## Acceptance Criteria

1. Seated + `SITTING_OUT` user sees **Rejoin** in both active-hand and no-hand table screens.
2. Pressing **Rejoin** never leaves the button permanently disabled after failure.
3. Mid-hand rejoin keeps current semantics (eligible next hand).
4. Between-hand rejoin immediately returns player to `ACTIVE`.
5. If table no longer exists, pressing **Rejoin** shows a table error state and a clear route to lobby.
6. If request fails transiently, user can retry without reloading.

## Test Matrix

1. `SITTING_OUT` + active hand + chips > 0 -> Rejoin success -> next hand dealt in.
2. `SITTING_OUT` + waiting street + chips > 0 -> Rejoin success -> status `ACTIVE`.
3. `SITTING_OUT` + send failure/disconnect -> error shown -> retry enabled.
4. `SITTING_OUT` + `TABLE_GONE` on click -> table error visible + back-to-lobby action.
5. Rejoin spam click -> single in-flight request, deterministic UI state.
