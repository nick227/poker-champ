# Multi-Table Tournament (MTT) Proposal

## Status

Phases 1–4 built and tested, Phase 5 partially built (`pnpm test:tournaments` green, 40 files /
138 tests). Blind-structure editor intentionally deferred -- see Phase 5 note below. No prior
design doc exists for this — `docs/architecture/TOURNAMENT_SYSTEM_DESIGN.md` §15 lists
"multi-table/table merge" as an unbuilt extension point but never specs it. This proposal is that
spec.

## What exists today (do not rebuild)

The tournament system is a fully working **single-table** tournament (STT) engine:
`TournamentDirector.tick()` orchestrates one Colyseus room per `Tournament` row
(`Tournament.tableId` / `Tournament.roomId` are singular scalars), with solid lifecycle
management (late-reg, blind clock, bust detection via `TournamentTableReconciler`, rebuy,
freezeout finish, abandon, payouts, results/stats), 37 test files / 119 passing tests
(`pnpm test:tournaments`), and real client UI (lobby, detail, register, standings,
elimination/ITM/win banners). None of that changes. This proposal only adds the ability for a
`Tournament` to span more than one table.

The concrete gap: `TournamentsRouter.ts:44` caps `maxPlayers` at `z.number().int().min(2).max(9)`
and passes it straight through as the single table's `maxSeats`
(`tournament-table-config.ts`). One tournament literally cannot exceed 9 entrants today.
`TournamentRegistration` has no seat/table pointer at all — the Colyseus room decides seating
in-memory, the same way a cash table does, because there's only ever one room to join.

## Schema change (flag for sign-off — do not auto-apply)

Additive only. No existing column changes type or becomes non-nullable.

```prisma
model TournamentTable {
  id           String   @id @default(cuid())
  tournamentId String
  tournament   Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)

  tableNumber  Int      // 1-based, stable for the tournament's lifetime even after breaks
  tableId      String?  // PokerTable.id once provisioned (mirrors Tournament.tableId today)
  roomId       String?  // Colyseus room id once provisioned (mirrors Tournament.roomId today)
  status       String   @default("OPEN") // OPEN | BREAKING | CLOSED

  createdAt    DateTime @default(now())
  closedAt     DateTime?

  registrations TournamentRegistration[]

  @@unique([tournamentId, tableNumber])
  @@index([tournamentId, status])
}
```

Add to `TournamentRegistration`:

```prisma
tournamentTableId String?
tournamentTable    TournamentTable? @relation(fields: [tournamentTableId], references: [id], onDelete: SetNull)
```

`Tournament.tableId` / `Tournament.roomId` are left in place but become **deprecated
convenience fields** — for a multi-table tournament they're meaningless (which table would they
even point at?), so new code stops reading them and reads `TournamentTable` instead. Existing
single-table logic is rewritten to go through `TournamentTable` uniformly (a 1-table tournament
is just the `N=1` case, not a separate code path) rather than maintaining two parallel systems
long-term.

**Backfill migration** (same migration, additive): for every `Tournament` row where
`tableId IS NOT NULL OR roomId IS NOT NULL`, insert one `TournamentTable` row
(`tableNumber=1`, copying `tableId`/`roomId`, `status = 'OPEN'` unless the tournament is
already `FINISHED`/`ABANDONED`/`CANCELLED` in which case `'CLOSED'`), and set
`TournamentRegistration.tournamentTableId` to that row's id for every registration on that
tournament with `finishPlace IS NULL`. This makes every currently-live or historical tournament
land in the new model with zero behavior change, so nothing in flight breaks when this ships.

## Decoupling field size from table size

- `maxPlayers` becomes the **tournament field cap** (raise the API validation, e.g. `max(200)` —
  exact ceiling is a product call, not an engineering one; flag for your sign-off, not mine).
- New constant `MAX_SEATS_PER_TABLE = 9` (matches existing per-table capacity, unchanged) governs
  how many `TournamentTable` rows get created.
- At the moment a tournament transitions to `STARTING` (late-reg closing / bot-fill, existing
  trigger in `TournamentDirector`), compute
  `tableCount = Math.ceil(seatedPlayerCount / MAX_SEATS_PER_TABLE)`, create that many
  `TournamentTable` rows, and distribute registrants evenly across them (existing bot-fill logic
  runs first, unchanged, then this distributes the final seated field).

## Table balancing (deliberately simple and auditable, not ICM-optimal) — built

Standard live-poker floor procedure, not a novel algorithm — this is a real-money app, the rule
needs to be explainable to a support ticket, not just "the algorithm decided". Implemented in
`tournament-table-balancer.ts`, invoked from `TournamentTableReconciler.reconcileAfterHand`:

- **Trigger**: extends `TournamentTableReconciler`'s existing post-hand pass (it already runs
  after every hand where `street === WAITING`) to also check table populations across the
  tournament once a bust is processed.
- **Rebalance**: if the fullest and emptiest live `OPEN` tables differ by more than 1 seated
  player, move one player from the fullest to the emptiest. Only ever between hands (never
  mid-hand) — the existing reconciler already only runs at `street === WAITING`. Every table's own
  post-hand pass independently elects itself (or not) via the same deterministic fewest/fullest
  rule, so no cross-room coordination primitive beyond a DB-level CAS on the moved player's
  `tournamentTableId` is needed.
- **Break**: once total remaining players would fit in fewer live `OPEN` tables than currently
  `OPEN`, the elected (fewest-populated) table marks itself `BREAKING`, blocks its own next hand
  (`PokerRoom.tournamentTableBreaking`), and — since the reconciler only ever runs between hands —
  immediately redistributes its players across the remaining `OPEN` tables (same fewest-first
  rule) and flips itself to `CLOSED`, all within the same reconcile pass.
- A player being moved never loses stack state — this is a seat move between hands, identical in
  kind to what already happens when a player rebuys: `seatPlayerAtStackForTableTransfer` reuses
  `reseatTournamentRebuyPlayer`'s no-new-money seat-add (the same cash-game seat-join primitive),
  and the source-side removal (`removePlayerForTableTransfer`) never touches CashierService.
- **Correctness dependency**: this surfaced a bug in `resolveTournamentWinnerUserId`'s call site —
  it read *this table's* survivor count as a proxy for "the tournament is over", which only holds
  for N=1. Fixed by gating on the tournament-wide remaining-registration count instead (see
  `TournamentTableReconciler.ts`); otherwise a table narrowing to 1 survivor while another table
  still has players would falsely end the tournament.

## Player routing (the actual behavior change)

`TournamentDirector.ensureTournamentTableForJoinDetailed(tournamentId, userId)` currently
returns the tournament's one `tableId`/`roomId` unconditionally. It becomes per-user:

1. Look up `TournamentRegistration.tournamentTableId` for `(tournamentId, userId)`.
2. If set and that `TournamentTable.status === 'OPEN'`, route there (provision/resume its room
   via `buildTournamentTableConfig`, same as today but keyed off the `TournamentTable` row).
3. If unset (first seating — initial table assignment at start, or a late registrant), assign the
   `OPEN` table with the fewest seated players, persist `tournamentTableId`, then route there.
4. If the player's previously-assigned table is `CLOSED` (they were moved by a break), the
   reconciler already updated `tournamentTableId` when it moved them — this path just picks that
   up on their next reconnect.

This is the piece every other layer depends on, and the one place genuinely new orchestration
logic is required — everything else in this proposal is either schema or an extension of an
existing trigger point.

## Recovery

`reconcileOrphanRunningTournaments` currently treats a tournament as one room. It becomes
per-`TournamentTable`: each table's room can independently go stale after a server restart: reconcile
each `OPEN` table against `loadLivePokerRoomIds()` the same way the single-room check works today,
close orphaned individual tables, and only mark the whole `Tournament` `FINISHED` once every table
is `CLOSED`. Reuses `isTournamentRoomLive` per-table instead of once per tournament.

## Realtime contract additions

Small, additive, matches the existing narrow `table.tournament` / `hero.tournamentViewer`
pattern in `packages/realtime-contract/src/table.ts`:

- `table.tournament.tableNumber: number` — which table of the tournament's current table count
  this room is (for in-table UI, e.g. "Table 3").
- `hero.tournamentViewer.movedToTableNumber?: number` — set transiently by the reconciler when a
  balancing move assigns this player a new table; client reads it, shows a "you've been moved to
  Table N" transition, and reconnects to the new room (same reconnect machinery already used for
  disconnect/rejoin, pointed at a different `roomId`).

## Hand-for-hand and ITM payout tiers (Phase 4) — built

Implemented in `tournament-hand-for-hand.ts`, invoked from `TournamentTableReconciler` right after
the winner-check, and skips table balancing for that pass while active:

- **Trigger**: once tournament-wide remaining registrations drop to `paidPlaces +
  HAND_FOR_HAND_BUBBLE_BUFFER` (buffer = 3), `Tournament.handForHandActive` flips true. Only
  matters with 2+ live tables -- a single-table endgame has no cross-table pace to synchronize.
- **Hold**: each table, on finishing its current hand, marks its own `TournamentTable.
  handForHandReady` and blocks its own next hand (`PokerRoom.tournamentHandForHandWaiting`,
  same `isNextHandBlocked` gate table-breaking already uses).
- **Release**: once every live `OPEN` table has reported ready, the pass that observes this
  (CAS-guarded on `handForHandActive` to avoid a double-release race) resets every table's ready
  flag, deactivates the tournament flag, and calls `releaseHandForHandHold` on every other table's
  room via `matchMaker.remoteRoomCall` (its own table releases itself directly) --
  `Dealer.redriveAfterExternalUnblock` kicks the drive loop so a held table doesn't just sit idle
  after its block clears.

`tournament-payouts.ts`'s `getPayoutSlots` now scales paid depth with field size (roughly the
standard live/online ~12-15% cash rate) instead of a fixed top-3, via a tiered table of smooth
decreasing percentage curves (`PAYOUT_PERCENT_CURVES`): 2→1 place, 3-5→2, 6-9→3 (unchanged
default), 10-19→4, 20-39→6, 40-79→9, 80-143→14, 144+→18. The one behavior change below the
multi-table threshold: 4-5 entrants now pay 2 places instead of 3.

## Sequencing (matches the phase breakdown already in the task list)

1. **Built.** Schema migration + `ensureTournamentTableForJoinDetailed` rewrite + initial
   multi-table provisioning at `STARTING`. Proves a field can be seated across N tables and
   everyone can join/rejoin correctly. `maxPlayers` API cap raised from 9 to 180 so this is
   actually reachable end-to-end, not just via test harness calls.
2. **Built.** Balancing (move/break) as its own tested unit, on top of (1), plus the
   multi-table-aware winner-detection fix it depends on for correctness.
3. **Built.** Realtime "you've been moved" + client transition UI.
4. **Built.** Hand-for-hand + ITM tiers.
5. **Partially built.** Manual balance override (`POST /tournaments/:id/rebalance`, admin-only --
   reuses the automatic balancer's exact fullest/emptiest election and >1-gap threshold, just
   triggered on demand instead of waiting for a hand to end) + multi-table indicator in the admin
   panel (`tableCount`/`openTableCount` on `TournamentSummary`, shown as "N/M tables open", plus a
   "Rebalance now" button gated to RUNNING tournaments with 2+ open tables). The blind-structure
   editor is deliberately **not** built: blind structures today are hardcoded presets
   (`blind-structure.ts`), not DB-driven at all -- a real editor means a new schema model, CRUD
   admin UI, and rewiring every blind-level lookup in the core game-timing path. That's a
   feature on the scale of phases 1-4, not "polish", and deserves its own scoping conversation
   rather than an assumed design bundled into this line item.

Each phase runs against `npm run verify` plus the existing `pnpm test:tournaments` baseline
(must stay green throughout) plus new tests for what it adds — same guardrail as every other
money-adjacent change this session.
