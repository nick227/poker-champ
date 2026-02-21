# Hand Replay Flow – Trace, Issues, Improvements

## 1. Flow Summary

### Backend: Snapshot capture → persistence → API

1. **Dealer** emits snapshots via `SnapshotService.emitToAll(reason)` or `emitToUser(userId, reason)`.
2. **SnapshotService**
   - `emitToAll`: builds one SYSTEM payload, calls `emitSnapshotHook(canonicalPayload)` then sends user-specific payloads to each client.
   - `emitToUser`: sends user payload to that client; then builds SYSTEM payload and calls `emitSnapshotHook(systemPayload)` so replay always gets SYSTEM view.
3. **PokerRoom** `onTableSnapshotEmitted`: if `FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE=true`, maps reason and calls `TableSnapshotLogService.writeSnapshot({ handId: snapshot.handId, payloadJson: snapshot.payloadJson, ... })`.
4. **TableSnapshotLogService.writeSnapshot**:
   - Skips if `SNAPSHOT_LOG_SAMPLE_RATE` dice roll fails or payload exceeds `SNAPSHOT_LOG_MAX_BYTES`.
   - Inserts into `TableSnapshotLog`. On P2003 (FK violation): if `handId` FK fails, retries with `handId: null` (row then invisible to replay).
5. **Hand row timing**: `HandLifecycleService.startHand()` awaits `persistence.handHistory.startHand()` (creates Hand row) then pushes `EMIT_SNAPSHOT HAND_START`. So HAND_START is emitted after Hand exists; handId null fallback should be rare (ephemeral table or handId FK not yet visible).
6. **ReplayFrameService.getFramesForHand(handId)**: reads `TableSnapshotLog` where `handId` and `payloadJson.hero.userId === "SYSTEM"`, dedupes by `snapshotSeq`, returns ordered payloads.
7. **GET /api/history/hands**: after loading hands, runs a batch query on `TableSnapshotLog` (same handId + SYSTEM filter) to set `hasReplay` per hand.
8. **GET /api/history/hands/:id**: loads hand, then `ReplayFrameService.getFramesForHand(hand.id)` → `snapshots` in response.

### Client: History list → Replay screen

1. **History list**: `historyService.getHands()` → each item has `hasReplay`.
2. **HandListItem**: shows "Replay Hand" only when `hasReplay === true`; shows "No replay" pill when false.
3. **Replay route** `/replay/[handId]`: `useHandReplayTableProvider(handId)` calls `getHandDetail`, gets `snapshots`; returns `{ provider, loading, error }`. Replay screen wraps all states in shell (Masthead, BottomBar).
4. **TableLayout** receives provider’s snapshot and sceneModel; ReplayControls drive `currentStep`.

---

## 2. Possible Issues

| # | Area | Issue | Severity |
|---|------|--------|----------|
| 1 | **Feature flag** | If `FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE` is not `true`, no rows are written; replay and `hasReplay` are always empty. | High – must be set in env. |
| 2 | **handId null fallback** | When `TableSnapshotLogService` gets P2003 on handId FK, it inserts with `handId: null`. Those rows are never returned by `getFramesForHand(handId)`, so early frames (e.g. HAND_START) can be lost for that hand. | Medium – only for ephemeral tables or if Hand insert is delayed/rolled back. |
| 3 | **Sample rate** | `SNAPSHOT_LOG_SAMPLE_RATE < 1` randomly skips writes; replay may be missing frames or whole hands. | Medium – default 1.0; avoid &lt; 1 if replay must be complete. |
| 4 | **Payload size cap** | Payloads over `SNAPSHOT_LOG_MAX_BYTES` are skipped; large tables/boards could drop frames. | Low – cap is 256KB default. |
| 5 | **hasReplay batch query** | List endpoint runs a second query with JSON filter (`payloadJson.hero.userId`). Some DBs/Prisma versions may not support or may be slow; failure would need handling (e.g. try/catch, then `hasReplay: false` for all). | Low – add defensive catch if needed. |
| 6 | **Replay reason mapping** | `mapSnapshotReason` maps dealer reasons to log reasons. `RUNOUT_STAGE` → `STREET_TRANSITION`; `HAND_SHOWDOWN` → `SHOWDOWN`. ReplayFrameService then filters by `toFrameReason()` (HAND_START, ACTION_ACCEPTED, RUNOUT_STAGE, HAND_SHOWDOWN, HAND_END). Mismatch could drop frames. | Low – currently aligned. |
| 7 | **Empty handId** | If `state.handId` is empty (e.g. WAITING), hook receives `handId: undefined`; row is stored with `handId: null` and is not tied to any hand. | Expected – no hand to attach to. |

---

## 3. Improvements

| # | Improvement | Rationale |
|---|-------------|-----------|
| 1 | **Document env in one place** | Add a short “Replay” section in main runbook or README: set `FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE=true` (and optionally mention sample rate / payload cap). | Reduces “empty replay” support load. |
| 2 | **Defensive hasReplay query** | In GET /api/history/hands, wrap the `tableSnapshotLog.findMany` for `handIdsWithReplay` in try/catch; on error log and treat as empty set so list still returns. | Avoids 500 if DB or JSON filter misbehaves. |
| 3 | **Avoid handId null when possible** | When TableSnapshotLogService gets P2003 on handId, consider logging handId for later backfill instead of only writing with `handId: null`. Optional: background job that attaches rows with `handId: null` and matching `tableId`/`createdAt` to the right Hand. | Recovers replay for hands where Hand was created slightly after first snapshot. |
| 4 | **Replay screen: back link** | On error/empty state, add an explicit “Back to History” (or use BottomBar) so users don’t rely only on the shell. | Already have BottomBar; ensure tab is obvious. |
| 5 | **Hand detail modal: Replay CTA** | In HandDetailModal, when hand detail is loaded and `snapshots.length > 0`, show a “Replay hand” button that navigates to `/replay/:id`. | Gives a second entry point after viewing summary. |
| 6 | **Unit test for SYSTEM in emitToUser** | SnapshotService test: when emitToUser is called, the hook is invoked with a payload where `hero.userId === "SYSTEM"`. | Prevents regressions. |
| 7 | **E2E or integration test** | One test: enable snapshot log, play one hand, GET hand detail, assert `snapshots.length >= 1` and list item `hasReplay === true`. | Validates full pipeline. |

---

## 4. Automated tests (read path and response shape)

- **Backend** `src/http/__tests__/HandHistoryRouter.overview-and-hands.test.ts`:
  - GET /overview and GET /hands with same auth; overview totalHands ≥ 1 and hands list length ≥ 1.
  - When overview has totalHands > 0, GET /hands returns body with top-level `hands` (array) and `nextCursor` (no `data` wrapper); hands length ≥ 1.
  - Logs in run: `handsFoundDb`, `handsReturned` (should match when no post-filter drop).
- **Client** `apps/client/src/tests/history.service.test.ts`:
  - getHands parses `{ hands: [...], nextCursor }`, normalizes playedAt to Date.
  - Defensive: if API returns hands null/missing or wrong key (e.g. `data.hands`), returns empty hands array.

Run: `npx vitest run src/http/__tests__/HandHistoryRouter.overview-and-hands.test.ts` (backend), `npx vitest run src/tests/history.service.test.ts` (client).

---

## 5. Quick reference

- **Snapshot → log**: `SnapshotService` (SYSTEM payload) → `PokerRoom.onTableSnapshotEmitted` → `TableSnapshotLogService.writeSnapshot` (gated by feature flag).
- **Log → API**: `ReplayFrameService.getFramesForHand(handId)` (filter `hero.userId === "SYSTEM"`); list uses same filter for `hasReplay`.
- **Client**: List shows Replay only when `hasReplay`; replay screen uses hand detail `snapshots` and app shell (Masthead + BottomBar).
