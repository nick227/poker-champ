# Table Snapshots + Hand History Persistence Implementation Tasks

Date: February 16, 2026
Scope: Durable hand audit trail and forensic snapshot logging for multiplayer reliability.
Status: Implementation Complete, Rollout Pending

## Goal
Make hand history the authoritative record for completed hands, and add snapshot persistence as forensic breadcrumbs for debugging, dispute resolution, and recovery confidence.

## Authority Model
- System of record: `Hand`, `HandPlayer`, `HandAction`, `HandPayout`.
- Forensic only: snapshot logs (non-authoritative, diagnostic).
- Recovery authority must remain hand-row based, not snapshot replay based.

## Phase 1: Hand History Completeness (Authoritative Path)
1. Wire `startHand` persistence from dealer hand start.
2. Wire `recordAction` for every accepted action.
3. Wire `recordPayout` for all payout paths (last-player + showdown).
4. Wire `endHand` with board, reason, and ending stacks.
5. Add deterministic ordering:
   - `HandAction.actionIndex` (monotonic per hand)
   - `HandPayout.payoutIndex` (monotonic per hand)
6. Enforce write invariants:
   - include `(tableId, handId)` on each critical write
   - one logical transaction per critical call
   - do not apply runtime action mutation until `recordAction` persistence succeeds
7. Define ordering source of truth:
   - `actionIndex` increments only on accepted actions, after validation, before state mutation.
8. Constrain hand terminal reasons (enum or constrained string):
   - `SHOWDOWN`
   - `ALL_FOLDED`
   - `ERROR_ABORTED`
   - `TABLE_CLOSED`

Acceptance:
- Every completed hand has complete DB timeline and payout rows.
- For any `handId`, chronological action timeline is reconstructable from DB alone.

## Phase 2: Snapshot Log Persistence (Forensic Path)
1. Add `TableSnapshotLog` model/migration:
   - `id`, `tableId`, `handId?`, `snapshotId`, `reason`, `street`, `payloadJson`, `payloadBytes`, `stateHash`, `schemaVersion`, `createdAt`.
2. Add reason enum:
   - `HAND_START`, `ACTION_ACCEPTED`, `STREET_TRANSITION`, `POT_UPDATED`, `SHOWDOWN`, `HAND_END`, `PLAYER_JOIN`, `PLAYER_LEAVE`.
3. Persist snapshot logs on snapshot emit points.
4. Add dedupe by `snapshotId`.
5. Add payload guard:
   - hard cap (example `256 KB`)
   - if exceeded: warn and skip persistence.
6. Add sampling control:
   - `SNAPSHOT_LOG_SAMPLE_RATE` (default `1.0`).

Acceptance:
- Snapshot logs are queryable by `tableId` and `handId`.
- Snapshot payload size is bounded and controllable.

## Phase 3: Reconciliation + Integrity Checks
1. Add reconciliation script for:
   - `sum(payouts) == pot`
   - monotonic action ordering by `actionIndex`
   - stack equation: ending = starting + payouts - bets.
2. Detect/report incomplete hands and snapshot gaps.
3. Emit metrics for mismatch classes and write failures.

Acceptance:
- Reconciliation passes on staging gate runs.
- Mismatch metrics are visible and actionable.

## Phase 4: Rollout + Operations
1. Add feature flag:
   - `FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE`.
2. Shadow-mode week:
   - persistence failures log + metric only; gameplay continues (no fail-fast).
3. Enable fail-fast after shadow stability.
   - critical write failures fail-fast and table enters errored state.
4. Add retention cleanup policy for snapshot logs.
5. Add internal lookup endpoints/runbook for hand and snapshot evidence retrieval.

Acceptance:
- Stable production behavior with bounded storage growth.
- Operational dispute/debug workflow documented.

## Testing Gates (Required)
1. Unit coverage for hand-history and snapshot-log repositories/services.
2. Integration: full hand lifecycle persistence completeness.
3. Integration: disconnect/reconnect chronology still valid.
4. Integration: side-pot showdown persistence and payout consistency.
5. Fuzz: random valid action sequences over N hands, reconciliation passes.
6. Keep existing multiplayer release gates green (`pnpm verify`, headless harness, manual browser gate).

## Immediate Next Tasks
- [x] Migration A: add `HandAction.actionIndex`, `HandPayout.payoutIndex` + unique/index constraints.
- [x] Wire dealer persistence for `startHand` + `recordAction` first.
- [x] Add integration test: `actionIndex` monotonic and no state mutation before persistence success.
- [x] Wire `recordPayout` + `endHand`.
- [x] Migration B: add `TableSnapshotLog` (+ reason enum + indexes + `schemaVersion`).
- [x] Add snapshot repository service: `src/engine/persistence/TableSnapshotLogService.ts`.
- [x] Add snapshot emit hooks + `snapshotId` dedupe + payload cap guard.
- [x] Add reconciliation script under `scripts/` + targeted fuzz coverage.

## Closeout Gate (Rollout)
- [ ] Apply migration A + migration B in target environments.
- [ ] Execute staged flag rollout for `FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE`.
- [ ] Run reconciliation on real hand data (`pnpm reconcile:hand-history -- --limit 200`).
- [ ] Record manual browser operational evidence in `docs/PHASE5_TWO_BROWSER_RELEASE_GATE_LOG.md`.
- [ ] Confirm operator handoff using `docs/TABLE_SNAPSHOTS_HAND_HISTORY_RUNBOOK.md`.
