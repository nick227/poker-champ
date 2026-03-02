# Replay Snapshot Persistence Fix

## Problem
`Replay your last hand` remained unavailable even for users with hand history because no replay frames were persisted.

Observed for `test@example.com`:
- User had many completed hands.
- `TableSnapshotLog` contained zero rows.
- Hand history endpoints returned hands, but no replay snapshots.

## Root Cause
Replay frame persistence was behind feature flag:

`FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE === "true"`

If unset, persistence was effectively disabled, resulting in no replay source data.

## Fix
Updated feature behavior to default snapshot logging **on**:

- `isTableSnapshotLogPersistenceEnabled()` now returns `true` unless env is explicitly `"false"`.
- This preserves an opt-out path while making replay functional by default.

File changed:
- `src/config/features.ts`

## Validation
- Added config tests:
  - `src/tests/features.config.test.ts`
  - verifies default-on behavior, explicit false opt-out, explicit true enablement.

### Test Evidence
- `pnpm -C apps/client exec vitest run src/tests/useLatestReplayHand.test.ts src/tests/communityHands.test.ts src/tests/replay.hermetic.test.ts`
  - Passed (`10/10` tests)
- `pnpm -C . exec vitest run src/tests/features.config.test.ts`
  - Passed (`3/3` tests)
- `pnpm -C . exec vitest run src/tests/table-action-broadcast.test.ts -t "writes snapshot logs through snapshot log service when enabled"`
  - Passed (`1/1` targeted test)

## Operational Note
- Existing historical hands without snapshot logs remain non-replayable.
- New hands after this fix should produce replay snapshots automatically via the existing canonical snapshot emission path in `PokerRoom` + `TableSnapshotLogService`.
