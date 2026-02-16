# Table Snapshots + Hand History Runbook

Date: February 16, 2026
Scope: Operational rollout and verification for hand-history authority + snapshot forensic logging.

## Purpose
This runbook covers rollout controls, migration execution, validation, and incident triage for:
- authoritative hand history persistence (`Hand`, `HandPlayer`, `HandAction`, `HandPayout`)
- forensic snapshot logging (`TableSnapshotLog`)

## Feature Flags and Env Controls
- `FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE`
  - `false`: snapshot logs are not persisted.
  - `true`: snapshot logs are written via `TableSnapshotLogService`.
- `SNAPSHOT_LOG_SAMPLE_RATE` (default `1.0`)
  - range: `0.0` to `1.0`
  - lower this if DB write load is high.
- `SNAPSHOT_LOG_MAX_BYTES` (default `262144`)
  - payload cap in bytes (default 256 KB)
  - over-cap snapshots are skipped with warning logs.

## Migrations (Required)
Apply both:
1. `prisma/migrations/20260216_migration_a_hand_action_payout_ordering/migration.sql`
2. `prisma/migrations/20260216_migration_b_table_snapshot_log/migration.sql`

Recommended sequence per environment:
1. backup DB
2. apply migration A
3. apply migration B
4. run `pnpm prisma generate`
5. run `pnpm server:typecheck`

## Rollout Sequence
1. Deploy with `FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE=false`.
2. Verify gameplay unaffected and hand-history persistence stable.
3. Enable `FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE=true` in staging.
4. Start with `SNAPSHOT_LOG_SAMPLE_RATE=1.0`; reduce (example `0.25`/`0.1`) if needed.
5. Run reconciliation and manual gate checks.
6. Promote to production with same staged flag strategy.

## Validation Commands
- Core checks:
  - `pnpm server:typecheck`
  - `pnpm vitest run src/tests/dealer.hand-history.persistence.test.ts src/tests/table-snapshot-log.service.test.ts src/tests/dealer.fuzz.random-actions.test.ts`
- Reconciliation:
  - `pnpm reconcile:hand-history -- --limit 200`
  - optional scoped run: `pnpm reconcile:hand-history -- --tableId <tableId> --limit 200`

## Expected Log Signals
- Snapshot payload skipped due to size cap:
  - `SNAPSHOT_LOG_SKIPPED_PAYLOAD_TOO_LARGE`
- Snapshot serialization failure:
  - `SNAPSHOT_LOG_SERIALIZE_FAILED`
- Snapshot write failure in emit path:
  - `TABLE_SNAPSHOT_LOG_WRITE_FAILED`

## Reconciliation Triage
If `reconcile:hand-history` reports mismatches:
1. identify `handId` from findings
2. inspect ordered actions by `actionIndex`
3. inspect ordered payouts by `payoutIndex`
4. compare expected stack equation:
   - `ending = starting - committed + payouts`
5. inspect snapshot logs for same `handId` (if enabled)
6. capture issue in release gate log with `handId` and mismatch details

## Closure Checklist
- [ ] Migrations A and B applied in target environments
- [ ] Snapshot flag rollout completed in staging/production
- [ ] Reconciliation run against real hand data with no unresolved mismatches
- [ ] Manual browser evidence logged in `docs/PHASE5_TWO_BROWSER_RELEASE_GATE_LOG.md`
- [ ] On-call/operator has access to this runbook and commands

