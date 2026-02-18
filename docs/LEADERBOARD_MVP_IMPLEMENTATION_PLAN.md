# Leaderboard MVP Implementation Plan

## Objective

Ship a leaderboard page backed by a single read-only API and server-side precomputed snapshots, with deterministic hourly rankings and no heavy query load on request paths.

MVP includes 8 categories:

- Biggest Winner (net profit last 7 days)
- Biggest Donor (largest net loss last 7 days)
- Showdown Sniper (highest showdown win %)
- All-In Maniac (most all-ins per 100 hands)
- Ice Cold (longest losing streak)
- Heater (longest win streak)
- Tight Rock (lowest VPIP, min hand threshold)
- Action Junkie (highest VPIP, min hand threshold)

## Non-Goals (MVP)

- No user-selectable filters beyond period/category query params required by API contract
- No drilldowns or per-user detail pages
- No real-time push updates
- No ad-hoc aggregation on API request path

## Architecture

### 1. Authoritative Hourly Aggregation Worker

A scheduled job computes leaderboard metrics from hand history and writes immutable-at-hour snapshots.

- Frequency: hourly (aligned to top of hour)
- Input: completed hands (`Hand.endedAt IS NOT NULL`) and related `HandPlayer`, `HandAction`, `HandPayout`, `PokerPlayer`, `User`
- Output: rows in `LeaderboardSnapshot`
- Determinism: same input window + same tie-breakers => same ranking

### 2. Read-Only Leaderboard API

Single endpoint reads precomputed snapshots only.

- `GET /api/leaderboard?period=weekly&category=biggest_winner&limit=20`
- Constant-time indexed read
- No joins against `Hand`, `HandAction`, or `HandPayout`

### 3. Stateless Leaderboard UI

Single fetch and render.

- No client-side metric computation
- Displays snapshot metadata (`computedAt`, `period`, `category`)
- Shows ranked list only

## Data Model

Add a new Prisma model in `prisma/schema.prisma`:

```prisma
model LeaderboardSnapshot {
  id              String   @id @default(cuid())
  createdAt       DateTime @default(now())

  period          String   // DAILY | WEEKLY | ALL_TIME
  category        String   // BIGGEST_WINNER | BIGGEST_DONOR | ...
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  valueNumerator  Int      // metric numerator (or raw value)
  valueDenominator Int?    // optional for ratios
  valueDisplay    String   // preformatted value for UI, e.g. "62.4%", "$123.45"

  rank            Int
  computedAt      DateTime

  handCount       Int      @default(0)
  metadataJson    Json?

  @@index([period, category, rank])
  @@index([period, category, computedAt])
  @@index([userId, computedAt])
  @@unique([period, category, computedAt, rank])
  @@unique([period, category, computedAt, userId])
}
```

Notes:

- `valueNumerator` + `valueDenominator` preserve precise scoring semantics.
- `valueDisplay` keeps API/UI simple and consistent.
- `computedAt` identifies snapshot version used by API response.
- No snapshot pagination by `id`; read and paginate by `rank` only.

## Metric Definitions (Deterministic)

Use explicit formulas and hard thresholds to avoid ambiguous ranking.

### Shared Rules

- Eligible hands: `Hand.endedAt != null`
- Actor scope: only users with `PokerPlayer.userId != null`
- Period windows:
  - `TRAILING_24H` (UI label: Daily): trailing 24 hours
  - `TRAILING_7D` (UI label: Weekly): trailing 7 days
  - `ALL_TIME`: full history
- Snapshot bucket rule:
  - `computedAt = floorToHour(nowUtc())`
  - Window lower bound uses `endedAt >= computedAt - windowSize`
- Minimum samples (MVP defaults):
  - VPIP categories: `minHands = 100`
  - Showdown Sniper: `minShowdowns = 20`
- Tie-breakers (in order):
  1. Better metric value
  2. Higher `handCount`
  3. Earlier `user.createdAt`
  4. Lexicographic `user.id`

### Category Formulas

- `BIGGEST_WINNER` (weekly)
  - `sum(netProfitCents)` descending
- `BIGGEST_DONOR` (weekly)
  - `sum(netProfitCents)` ascending
- `SHOWDOWN_SNIPER`
  - `showdownWins / showdownSeen`, descending
- `ALL_IN_MANIAC`
  - `(allInActions / handsPlayed) * 100`, descending
- `ICE_COLD`
  - longest consecutive losing hands, descending
- `HEATER`
  - longest consecutive winning hands, descending
- `TIGHT_ROCK`
  - `vpipHands / handsPlayed`, ascending, only if `handsPlayed >= minHands`
- `ACTION_JUNKIE`
  - `vpipHands / handsPlayed`, descending, only if `handsPlayed >= minHands`
- Streak hand outcome:
  - win: `netProfitCents > 0`
  - loss: `netProfitCents < 0`
  - neutral: `netProfitCents == 0` and neutral breaks streak in MVP

### Derivation Inputs

- `netProfitCents` source of truth:
  - use ledger-backed per-hand delta (from `BalanceTransaction` or equivalent) as canonical source
  - only fall back to payout-derived computation if ledger-per-hand is unavailable
  - this avoids drift from rebuys, fees/rake, refunds, or adjustments
- `showdownSeen` hand condition: hand ended by showdown and user still eligible at showdown.
- `showdownWins`: user payout > 0 in showdown hand.
- `allInActions`: count `HandAction.action == "ALL_IN"`.
- `vpipHands`: hand where user voluntarily put chips preflop (`CALL|BET|RAISE|ALL_IN` on preflop, excluding forced blinds).
  - if no explicit forced/blind marker exists, apply a documented heuristic to exclude blind-posting actions
- streaks: compute against chronologically ordered hands for each user.

## Backend Implementation Plan

### Phase 1: Schema + Types

1. Add `LeaderboardSnapshot` model to `prisma/schema.prisma`.
2. Create migration.
3. Add enums/constants in backend for:
   - `LeaderboardPeriod`
   - `LeaderboardCategory`
4. Add zod schemas for query validation in router.

Target files:

- `prisma/schema.prisma`
- `src/http/LeaderboardRouter.ts` (new)
- `src/http/openapi.ts`
- `src/index.ts`

### Phase 2: Aggregation Service + Hourly Runner

Create service dedicated to snapshot computation and persistence.

Suggested files:

- `src/engine/persistence/LeaderboardAggregationService.ts` (new)
- `src/engine/persistence/LeaderboardMetricCalculators.ts` (new, optional split)

Responsibilities:

- Build period windows
- Query required hand history in bounded chunks
- Compute per-user aggregates
- Generate ranked rows per category
- Write snapshot rows in transaction
- Idempotency per hour:
  - For `(period, category, computedAtHour)` delete existing rows then insert current set
  - `computedAtHour` is always the UTC top-of-hour bucket

Generator pattern (MVP-safe and extensible):

- `generate(period, category, computedAt): AsyncGenerator<LeaderboardSnapshotCreateInput>`
- runner flow:
  - `deleteMany({ period, category, computedAt })`
  - consume generator and `createMany` in chunks
  - deterministic ordering and rank assignment within generator

Scheduling approach (MVP-safe):

- Reuse server process timer pattern in `src/index.ts` (same style as `RecoveryService` hourly loop)
- Run at startup once, then hourly
- Log job duration, rows written, and failure count

### Phase 3: API Endpoint

Add read-only router:

- `GET /api/leaderboard`
- Query:
  - `period`: `daily | weekly | all_time` (default `weekly`; mapped internally to trailing windows)
  - `category`: required enum
  - `limit`: optional (`1..100`, default `20`)
- Behavior:
  - Find latest `computedAt` for `(period, category)`
  - Return top `limit` rows for that snapshot
  - Include metadata: `computedAt`, `period`, `category`, `totalEntries`
  - ordering is `rank ASC` only
  - no cursor needed in MVP top-N mode
  - if pagination is later required: cursor is `rank`, not `id`

Response shape (example):

```json
{
  "period": "weekly",
  "category": "biggest_winner",
  "computedAt": "2026-02-18T14:00:00.000Z",
  "totalEntries": 20,
  "entries": [
    {
      "rank": 1,
      "userId": "...",
      "displayName": "PlayerOne",
      "value": "+$124.50",
      "valueNumerator": 12450,
      "valueDenominator": null,
      "handCount": 184
    }
  ]
}
```

### Phase 4: Client UI Page

Create leaderboard page and route.

Suggested files:

- `apps/client/src/app/leaderboard.tsx` (or route equivalent used by client app)
- `apps/client/src/services/leaderboard.service.ts`
- `apps/client/src/components/domain/leaderboard/LeaderboardList.tsx`
- `apps/client/src/components/domain/leaderboard/LeaderboardCategoryTabs.tsx` (simple segmented control)
- `apps/client/src/registry/screen.registry.ts` (if adding nav entry)

MVP UI behavior:

- Initial load defaults: `weekly + biggest_winner`
- User can switch among 8 categories (period fixed to weekly for MVP unless product requires period toggle)
- Display timestamp: `Updated: {computedAt} (hourly)`
- Empty/error/loading states

## API Contract and OpenAPI

Update `src/http/openapi.ts`:

- Add `leaderboard` tag
- Add `/api/leaderboard` path
- Add schema for leaderboard response and entries
- Require bearer auth (recommended for consistency with profile/history surfaces)

## Performance and Scalability Guardrails

- API query path uses only `LeaderboardSnapshot` + lightweight `User` projection for display name.
- MVP optimization option: denormalize `displayName` into snapshot row to remove runtime join entirely.
- Ensure index coverage for `(period, category, computedAt, rank)` access pattern.
- Worker should process in chunks to avoid high memory pressure with large hand volumes.
- Avoid N+1 queries while building aggregates.

## Operational Safety

- Feature flag: `ENABLE_LEADERBOARD=true` to gate router and UI exposure.
- Job observability logs:
  - start/end timestamps
  - rows inserted per period/category
  - duration and error payload
- Failure mode:
  - API serves last successful snapshot
  - if none exists, returns empty `entries` with `computedAt: null`

## Testing Plan

### Unit Tests

- Metric calculators:
  - VPIP inclusion/exclusion rules (forced blinds excluded)
  - showdown numerator/denominator
  - streak edge cases (ties, alternating win/loss, neutral hands)
  - all-in per 100 math and rounding

### Integration Tests

- Snapshot write/read consistency
- Idempotent recompute for same `computedAt` bucket
- API returns latest snapshot only
- Query validation rejects invalid period/category/limit

### Contract Tests

- Add endpoint contract assertions similar to existing HTTP tests in `src/http/__tests__`

## Rollout Plan

1. Deploy schema migration + dormant code behind feature flag.
2. Enable worker in staging; backfill weekly snapshots.
3. Verify API latency and deterministic rankings.
4. Enable UI for internal users.
5. Enable feature in production.

## MVP Deliverables Checklist

- 1 new DB table (`LeaderboardSnapshot`)
- 1 hourly aggregation worker/service
- 1 read-only endpoint (`GET /api/leaderboard`)
- 1 leaderboard screen in client
- tests for metric correctness and API contract

## Immediate Implementation Checklist

- Change snapshot reads to `ORDER BY rank ASC` with no `id < cursor` strategy.
- Add `@@unique([period, category, computedAt, userId])` in addition to rank uniqueness.
- Enforce `computedAt` top-of-hour UTC bucketing in worker.
- Lock and document canonical net-profit source (ledger-first, payout-derived fallback only).
- Add deterministic unit tests per category, including tie-breakers and neutral-streak behavior.

## Risks and Decisions to Lock

- Canonical net-profit derivation source (ledger-backed vs hand-derived): choose one and keep consistent.
- Showdown definition for split pots and partial payouts: define once and test explicitly.
- Whether leaderboard is auth-only or public endpoint (default auth-only).
- Whether period switch is exposed in MVP UI (recommend weekly-only UI, period-capable API).
