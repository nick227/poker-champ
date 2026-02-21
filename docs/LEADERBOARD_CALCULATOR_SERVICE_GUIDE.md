# Leaderboard Calculator Service Guide

## Purpose

This document explains how leaderboard calculations currently work in production code, how scheduling is implemented today, how snapshots are loaded by the API, and how to safely expand the system with new metrics.

## Current Components

### 1. Snapshot Storage Model

Authoritative leaderboard rows are stored in `LeaderboardSnapshot`.

- Schema: `prisma/schema.prisma`
- Model: `LeaderboardSnapshot`
- Key fields:
  - `period`, `category`, `userId`, `rank`, `computedAt`
  - `value`, `valueNumerator`, `valueDenominator`, `handCount`
  - `userDisplayName` (denormalized for fast reads)
- Uniqueness:
  - `@@unique([period, category, computedAt, rank])`
  - `@@unique([period, category, computedAt, userId])`

### 2. Calculator / Aggregation Service

- File: `src/engine/persistence/LeaderboardAggregationService.ts`
- Responsibilities:
  - Determine snapshot bucket time (`floorToHourUtc`)
  - Compute all categories for all periods
  - Apply deterministic ordering + tie-breakers
  - Write snapshot rows transactionally
  - Read latest snapshot by `(period, category)` for API consumption

### 3. Read-Only API

- File: `src/http/LeaderboardRouter.ts`
- Endpoint: `GET /api/leaderboard`
- Query params:
  - `period`: `daily | weekly | all_time` (default `weekly`)
  - `category`: required enum
  - `limit`: 1..100 (default 20)
- Behavior:
  - Validates query with zod
  - Reads latest precomputed snapshot only
  - Returns rows ordered by `rank ASC`

### 4. Scheduler Integration

- File: `src/index.ts`
- Startup behavior when enabled:
  - Runs one immediate recompute at server boot
  - Runs recurring recompute every 60 minutes via `setInterval`
- Feature flag:
  - `ENABLE_LEADERBOARD`
  - Implemented in `src/config/features.ts` (`isLeaderboardEnabled()`)
  - If unset, defaults to enabled

## Current Schedule (As Implemented)

The service runs:

1. Immediately on startup
2. Every 60 minutes after startup

Important detail:

- Snapshot `computedAt` is always bucketed to top-of-hour UTC (`floorToHourUtc`).
- The interval itself is startup-relative, not clock-aligned cron.
- This means runs may happen at e.g. `14:23`, but they still write into bucket `14:00:00Z`.

This is safe for determinism because each run recomputes and replaces rows for the exact `(period, category, computedAt)` bucket.

## Why a category can show no entries

- **No snapshot yet**: If no recompute has ever written rows for that `(period, category)`, the API returns `computedAt: null` and `entries: []`. Ensure `ENABLE_LEADERBOARD` is not `false` and the server has run at least one recompute (on startup or after the first hour).
- **Biggest Winner / Biggest Donor**: Require `BalanceTransaction` rows with `handId` set and a related `Hand` with `endedAt` in the period. Empty if no such hands exist or no user has positive (winner) / negative (donor) net in the window.
- **Showdown Wins (showdown_sniper)**: Requires `Hand.reason === "SHOWDOWN"` and each user must have at least `SHOWDOWN_MIN_SAMPLES` (5) such hands in the period to appear. If no user reaches that minimum, the list is empty.
- When recompute runs but a category returns 0 entries, a single sentinel row is written (so the API can return `computedAt` and the UI shows "Last updated" instead of "Pending first snapshot"). The client shows a different empty-state message when `computedAt` is set vs when it is null.

## How Calculations Are Managed

## Periods and Categories

The service loops over all supported periods and categories:

- Periods: `daily`, `weekly`, `all_time`
- Categories:
  - `biggest_winner`
  - `biggest_donor`
  - `showdown_sniper`
  - `all_in_maniac`
  - `ice_cold`
  - `heater`
  - `tight_rock`
  - `action_junkie`

For each `(period, category)`:

1. Build a bounded time window using `computedAt`
2. Compute ranked entries
3. Delete existing snapshot rows for that exact bucket
4. Insert new rows in chunks (`SNAPSHOT_WRITE_CHUNK_SIZE = 500`)

## Deterministic Ranking Rules

Sorting is stable and deterministic:

1. Primary metric value (category-specific)
2. `handCount` (higher first for ties)
3. User account creation time (`user.createdAt`, earlier first)
4. `userId` lexical fallback

## Metric Input Sources

Current implementation uses:

- Ledger-backed deltas (`BalanceTransaction`) for profit/streak-driven metrics
- `Hand`, `HandPlayer`, `HandAction`, `HandPayout` as needed for ratio and activity metrics

VPIP currently includes a conservative forced-blind exclusion heuristic:

- In each hand, first two eligible preflop chip-entering actions are excluded from VPIP count.

## How Calculations Are Loaded (Read Path)

API read is snapshot-only:

1. Find `MAX(computedAt)` for requested `(period, category)`
2. Load rows where `computedAt = max`
3. Sort by `rank ASC`
4. Return top `limit`

If no snapshot exists yet:

- API returns `computedAt: null`, `entries: []`, `totalEntries: 0`

This keeps request latency stable and avoids expensive request-time joins/aggregations.

## Manual Recompute Options

## Option A: One-off local/manual run with `tsx`

Run a full recompute manually from project root:

```powershell
npx tsx -e "import { recomputeLeaderboardSafely } from './src/engine/persistence/LeaderboardAggregationService.ts'; (async () => { await recomputeLeaderboardSafely(); process.exit(0); })().catch((err) => { console.error(err); process.exit(1); });"
```

This is the fastest way to force fresh snapshots during development or incident response.

## Option B: Recompute a specific bucket/segment

Use service internals directly for targeted jobs:

```powershell
npx tsx -e "import { LeaderboardAggregationService } from './src/engine/persistence/LeaderboardAggregationService.js'; await LeaderboardAggregationService.recomputeSnapshot('weekly','biggest_winner', LeaderboardAggregationService.floorToHourUtc(new Date())); process.exit(0);"
```

Useful for troubleshooting one category without recalculating everything.

## Option C (recommended future): Admin-trigger endpoint or CLI script

For operations, add one of:

- `scripts/recompute-leaderboard.ts` (checked-in script)
- Admin HTTP endpoint (authz protected) to trigger recompute with params

This avoids long inline shell commands and creates a repeatable runbook flow.

## Expansion Process (Adding New Metrics)

When adding a new category, follow this process:

1. Add category string to `LeaderboardCategory` union.
2. Add category to `CATEGORIES` list.
3. Implement compute function that returns `LeaderboardSnapshotEntry[]`.
4. Add case in `computeCategory(...)` switch.
5. Define deterministic sort with standard tie-break fallback.
6. Update router query enum (`src/http/LeaderboardRouter.ts`).
7. Update OpenAPI enum (`src/http/openapi.ts`).
8. Update client category options (`apps/client/app/leaderboard.tsx`).
9. Add tests for:
   - formula correctness
   - tie-break behavior
   - empty dataset behavior

## Recommended Hardening Next Steps

1. Align scheduler to real top-of-hour boundary (cron-style) instead of startup-relative interval.
2. Add dedicated integration test for `GET /api/leaderboard` contract + validation errors.
3. Add a manual recompute CLI script in `scripts/` and document it in runbooks.
4. Consider persisting additional metadata (sample thresholds used, version) in snapshot rows.
5. Add basic metrics/observability around rows written per category and recompute duration percentiles.

## Operational Notes

- Feature flag can disable API route and background recompute at process startup (`ENABLE_LEADERBOARD=false`).
- OpenAPI currently still documents the endpoint even if runtime flag disables route; this is acceptable but should be known.
- Snapshot writes are idempotent per bucket due to delete+insert per `(period, category, computedAt)`.
