# Live Multi-Player Roadmap

## Progress Checkpoint (February 16, 2026)
Phase status against this roadmap:
- Phase 1 (Economy bootstrap + buy-in reliability): In progress (local rollout complete, environment rollout pending).
- Phase 2 (Authoritative snapshot contract + server emission): Complete for MVP scope.
- Phase 3 (Client live table wiring + action UX): Complete for MVP scope.
- Phase 4 (Headless two-client harness + reliability): In progress, advanced.
- Phase 5 (Browser E2E release gate): In progress (execution package prepared, manual run pending).

What is done now:
- `TABLE_SNAPSHOT` contract (v1) is implemented and used server/client.
- Snapshot-first table rendering is live in `apps/client/app/table/[id].tsx` with `heroActionOptions`.
- Mock table gameplay path has been removed from the live table route.
- Headless harness is implemented (`scripts/headless-two-client.ts`) with:
- baseline two-user hand progression
- short-stack all-in + raise/call side-pot signal path
- seated session restore path
- non-consented leave + reconnect grace path
- settlement math check (`sum(lastHandResult.payoutsByUserId) === lastHandResult.potCents`)
- CI workflow is added at `.github/workflows/headless-harness.yml`.
- Settlement root-cause fix applied in `src/engine/Dealer.ts`: blinds now increment `committedCents`, aligning side-pot construction with pot accounting.
- Showdown payout reconciliation safeguard remains in `src/engine/Dealer.ts` as a defensive fallback.
- New-user bankroll defaults are updated to `1_000_000` in:
- `prisma/schema.prisma` (`User.bankrollCents @default(1000000)`)
- `src/engine/auth/AuthService.ts` (`register` explicitly sets `bankrollCents: 1_000_000`)
- Idempotent backfill script added: `scripts/backfill-starting-bankroll.ts`
- Backfill commands:
- dry-run: `pnpm bankroll:backfill`
- apply: `pnpm bankroll:backfill:apply`
- Backfill execution status:
- Local/dev apply run completed on February 16, 2026 with `matched=1`, `updated=1`.
- Prisma schema sync status:
- Local DB schema sync completed on February 16, 2026 via `pnpm prisma db push`.
- Verified `User.bankrollCents` default is `1000000` in MySQL metadata.
- Phase 5 execution log template added: `docs/PHASE5_TWO_BROWSER_RELEASE_GATE_LOG.md`.
- Automated Phase 5 gate command implemented and passing: `pnpm phase5:auto` (`artifacts/phase5-automated-gate.json`).

What is still open:
- Execute bankroll backfill in apply mode in remaining target environments (staging/production as applicable).
- Apply Prisma schema default rollout in remaining target environments (current workflow uses `prisma db push`; no migration history exists yet in this repo).
- Execute two-browser manual release gate and record evidence in `docs/PHASE5_TWO_BROWSER_RELEASE_GATE_LOG.md`.

## Current System Baseline (As-Built)
Detailed baseline reference: `docs/CURRENT_ARCHITECTURE_BASELINE.md`.

### Backend today
- Single runtime in `src/index.ts`: Express API + Colyseus realtime server.
- Live table engine is implemented in `src/engine/Dealer.ts` with turn enforcement, betting rounds, pot tracking, side pots, showdown payouts, and auto-next-hand.
- Table room auth/session lifecycle is implemented in `src/rooms/PokerRoom.ts` (auth, join, reconnect grace, abandoned handling).
- Economy architecture split is in place:
- `CashierService` for bankroll <-> table wallet transfer.
- `LedgerService` for in-hand chip accounting and hand-balance assertions.

### Client today
- Lobby and transport wiring are functional (`apps/client/app/lobby.tsx`, `apps/client/src/realtime/*`).
- Table screen is still mock-driven (`apps/client/src/lib/tableMocks.ts` used by `apps/client/app/table/[id].tsx`).
- Action bar is UI-first and not fully driven by server-authoritative legal options.

### Contract today
- Shared realtime contract package exists (`packages/realtime-contract`).
- Table outbound schema is still minimal compared to actual gameplay events emitted by dealer.

## Goal
Enable real-money-flow (play chips) multiplayer where two authenticated users in different browsers can join the same table, play full hands continuously, receive correct turn prompts, see valid action options, and settle pots correctly.

## Definition of Success
1. Two users in separate browsers can log in and join the same live table.
2. Hand cycle runs continuously: PREFLOP -> FLOP -> TURN -> RIVER -> SHOWDOWN/last-player.
3. Only the correct player can act on each turn.
4. UI shows correct options per turn (`check`/`call`/`bet`/`raise`/`all-in`/`fold`) with correct amounts including min-raise.
5. Pot and side pots are tracked and awarded correctly.
6. Hand ends correctly, payouts are applied, and next hand auto-starts when >=2 players remain.

## Current State Review (What We Already Have)

### Server strengths
- Core hand engine exists and is functional in `src/engine/Dealer.ts`.
- Turn enforcement exists (`NOT_YOUR_TURN`) and action queue serializes actions.
- Betting state exists (`roundCurrentBetCents`, `minRaiseCents`, `needsAction`).
- Side pot + split logic exists in `src/engine/rules/SidePotManager.ts`.
- Showdown payout and last-player win flows exist.
- Auto-next-hand scheduling exists.
- Reconnect grace/abandon handling exists in `src/rooms/PokerRoom.ts` + `Dealer`.
- Shuffle/deal is implemented via crypto Fisher-Yates in `src/engine/cards/DeckService.ts`.

### Client gaps blocking live play
- Table screen is still mock-driven (`apps/client/src/lib/tableMocks.ts`, used in `apps/client/app/table/[id].tsx`).
- Table action UI is static labels and static amounts (hardcoded check/bet labels and slider presets).
- Table outbound contract only includes `WELCOME`, `SESSION_RESTORED`, `ERROR` (`packages/realtime-contract/src/table.ts`), while dealer emits gameplay messages (`HAND_START`, `STREET_ADVANCE`, `HAND_END`, `HOLE_CARDS`, `ODDS_UPDATE`).
- Client table message validation drops unknown gameplay messages as `INVALID_REALTIME_MESSAGE`.
- Buy-in chosen in lobby modal is not currently used when joining table; table screen derives buy-in from table minimum.

### Economy/money status
- New users currently default to `bankrollCents = 0` (`prisma/schema.prisma`).
- Buy-in/cash-out flow exists and is atomic via `CashierService`.
- In-hand debits/credits are separated into `LedgerService` (good architecture).

## Product Decisions for This Iteration
1. New users start with `1,000,000` bankroll units (`bankrollCents = 1_000_000`).
2. Server is authoritative for legal actions and amounts shown to each player.
3. Client does not calculate legality; it only renders server-provided options.
4. Realtime table contract becomes the single schema for all table gameplay messages.
5. Server-only ownership rule: turn order, legal actions, amount bounds, pot totals, and payouts are authoritative on server; client never derives these values.
6. All table UI is driven exclusively from `TABLE_SNAPSHOT`; no component may depend on partial table messages.

## High-Level Implementation Plan

## Workstream A: Authoritative Table Projection (Snapshot-First)
- Build one canonical projection: `buildTableSnapshot(tableState, heroUserId)`.
- Expand realtime contract for `TABLE_SNAPSHOT` (and minimal lifecycle messages).
- Include `version` in every table message.
- In MVP, emit full `TABLE_SNAPSHOT` after every meaningful state change (delta-free).
- Meaningful state change = any accepted action, street advance, hand start, hand end, seat join/leave, or reconnect restore.

## Workstream B: Client Live Table State
- Replace mock table state with a dedicated table store in `apps/client/src/stores`.
- Wire realtime handlers so table store is replaced directly from snapshot payload.
- Render board, players, pot, hero cards, action options, and hand-end results from snapshot state only.

## Workstream C: Action UX and Turn Prompting
- Drive `ActionBar` from snapshot `heroActionOptions` (check/call/bet/raise/all-in/fold).
- Use server-provided min/max bounds for slider and presets.
- Add explicit hero turn alerts and non-turn muted state.

## Workstream D: Economy Initialization
- Set new-user bankroll to `1_000_000` in schema + register flow.
- Add migration/backfill path for existing zero-bankroll users.
- Ensure join flow uses selected buy-in amount from modal through table connect.

## Workstream E: End-to-End Validation and Release Gate
- Add headless two-client Node harness (colyseus.js client A/client B) for scripted join/action/settlement.
- Add regression tests for side pots, reconnect during hand, and continuous hand cycling.
- Keep two-browser test as final manual release gate with accounting correctness checks.

## Architecture Target

### 1) Authoritative realtime table state
MVP snapshot-first contract (contract + server + client):
- `TABLE_SNAPSHOT` (full state for join/reconnect and post-action sync)
- `ERROR`, `WELCOME`, `SESSION_RESTORED`

Snapshot schema ownership rule:
- Snapshot schema is owned by server; client treats it as opaque mirrored state.

Optimization-later (not MVP):
- `TABLE_DELTA`
- `POT_UPDATED`
- standalone `ACTION_OPTIONS`

### 1.1) Locked `TABLE_SNAPSHOT` schema (v1)
Source of truth: `packages/realtime-contract/src/table.ts` (`TableSnapshotPayloadSchema`).

Top-level payload fields:
- `version` (literal `1`)
- `snapshotId` (string)
- `emittedAtTs` (epoch ms)
- `serverTimeTs` (epoch ms)
- `stateHash` (string)
- `reason` (`JOIN | RECONNECT | ACTION_ACCEPTED | AUTO_TRANSITION | HAND_START | HAND_END | SEAT_CHANGE`)
- `actionId` (optional string)
- `table` object
- `hand` object (optional when no active hand)
- `seats[]`
- `hero` object
- `heroActionOptions` (optional object)
- `lastHandResult` (optional object)

`hand` includes:
- `handNumber`
- `street` (`WAITING` implies no active hand context)

`heroActionOptions` fields:
- `canFold`, `canCheck`, `canCall`, `canBet`, `canRaise`, `canAllIn`
- `callAmount`
- `minRaiseTo` (optional)
- `maxRaiseTo` (optional)

Contract rule:
- Any table UI element requiring game state must read from this snapshot payload only.

### 2) Per-user action options model
Server computes options and embeds them in snapshot as `heroActionOptions`:
- `canFold`
- `canCheck = (callAmount === 0)`
- `canCall = (callAmount > 0 && stack >= callAmount)`
- `canBet = (roundCurrentBetCents === 0 && stack > 0)`
- `canRaise = (roundCurrentBetCents > 0 && stack + roundBet >= roundCurrentBet + minRaise)`
- `canAllIn = (stackCents > 0)`
- `minRaiseTo = roundCurrentBetCents + minRaiseCents`
- `maxRaiseTo = roundBetCents + stackCents`
- `callAmount`

### 3) Client table store (replace mocks)
Create dedicated table state store with:
- board, pot, side pots
- seats/players, stacks, statuses
- hero hole cards
- acting player id and turn timer
- current user action options (`heroActionOptions` from snapshot)
- last hand result/payout breakdown
- message/schema `version`

## Money Plan (Start New Users at 1 Million)

### Required changes
1. `prisma/schema.prisma`: change `User.bankrollCents @default(0)` -> `@default(1000000)`.
2. `src/engine/auth/AuthService.ts`: set explicit `bankrollCents: 1_000_000` on registration for safety.
3. Migration/backfill script:
- Set existing users with `bankrollCents = 0` to `1_000_000` once.
- Keep idempotent marker or run conditionally.

### Guardrails
- Keep `CHECK (bankrollCents >= 0)` constraint.
- Log buy-in failures with user/table IDs.
- Add test: new registration returns user with `bankrollCents = 1000000`.

## Shuffle and Deal Process
Current implementation:
- New 52-card deck each hand.
- Shuffle uses crypto random (`randomInt`) Fisher-Yates.
- Deal 2 private hole cards to active seated players in seat order.
- Deal flop (3 cards), turn (1), river (1).

Current behavior note:
- No burn card before flop/turn/river right now.

Iteration decision:
- Keep as-is for this milestone (faster go-live), or add burn-card logic as a scoped enhancement after multiplayer stabilization.

## Implementation Roadmap

## Phase 1: Economy Bootstrap + Buy-In Reliability
Deliverables:
1. Implement new-user bankroll at `1_000_000` (schema + register flow).
2. Add migration/backfill for existing users with `bankrollCents = 0`.
3. Persist chosen buy-in from join modal through table connect flow.
4. Add explicit buy-in confirmation/error UX.

Acceptance:
- Fresh account can join a cash table without manual funding.
- Selected buy-in is actually used for seat/join.

## Phase 2: Authoritative Snapshot Contract + Server Emission
Deliverables:
1. Add `TABLE_SNAPSHOT` schema (with `version`) to `packages/realtime-contract/src/table.ts`.
2. Implement snapshot builder in dealer flow (start in dealer for MVP speed).
3. Emit `TABLE_SNAPSHOT` on join, reconnect, and after every accepted action or automatic state transition.
4. Add contract guard tests for new message types.
5. Log `snapshot.version`, `handId`, and `actionId` on each emit for debugging correlation.

Acceptance:
- No `INVALID_REALTIME_MESSAGE` errors during active hands.
- Two clients receive identical authoritative table state after each action.

## Phase 3: Client Live Table Wiring (No Mocks) + Action UX
Deliverables:
1. Create `table.store.ts` driven by snapshot replacement.
2. Replace `MOCK_OPPONENTS`, `MOCK_COMMUNITY_CARDS`, `MOCK_HERO_CARDS` usage in `apps/client/app/table/[id].tsx`.
3. Render `ActionBar` from snapshot `heroActionOptions` only.
4. Replace static button labels with contextual labels (`Check` vs `Call $X`, `Bet` vs `Raise to`) from snapshot options.
5. Use server bounds for slider/presets and hide illegal actions.
6. Add hero turn alert from snapshot toAct/turn data.

Acceptance:
- UI has no hardcoded pot/action data paths.
- Hero only sees legal actions and correct amount bounds.

## Phase 4: Headless Two-Client Harness + Reliability
Deliverables:
1. Add Node-based two-client harness (A/B) that joins same table and scripts actions.
2. Add side-pot scenario test with all-in + overcall.
3. Add reconnect-in-turn test.
4. Add regression test for continuous hand loop (multiple hands).
5. Require headless harness green before browser E2E execution.
6. Harness command: `pnpm harness:headless` (forces in-memory mode and validates hand-cycle progression).
7. Current harness scenarios:
- baseline two-user hand progression
- short-stack all-in + raise/call side-pot signal path
- session restore (`SESSION_RESTORED`) while user remains seated, then continued action flow
- room reconnect grace path via `onLeave` (non-consented) + `allowReconnection` recovery

Acceptance:
- Pot totals and payouts match ledger assertions every hand.
- Hand always ends and next hand starts when table still has >=2 active players.

## Phase 5: Browser E2E Release Gate
Deliverables:
1. Run two-browser manual flow using real accounts/tables.
2. Validate turn prompts, legal actions, pot progression, payouts, and hand cycling.
3. Capture release checklist evidence (pass/fail log).

Acceptance:
- Two-browser flow passes fully with no desync and no incorrect payout.

## End-to-End Test Script (Release Gate)
Run this exact manual + automated gate before calling feature complete:

1. Start backend + client.
2. Open Browser A and Browser B (separate users).
3. User A creates/selects table; User B joins same table.
4. Verify both clients see same players/board/pot.
5. Play at least 5 full hands including:
- check/check line
- bet/fold line
- raise/call line
- all-in line
- showdown line
6. Validate:
- turn prompts target correct user
- legal actions are correct each turn
- pot increments correctly after each action
- hand winner payout matches showdown/last-player outcome
- next hand auto-starts

## Known Risks and Mitigations
- Message drift between server/client: mitigate with single shared realtime-contract package and CI tests.
- Reconnect edge cases: add forced disconnect integration tests.
- Ledger mismatch under concurrency: keep action queue serialization and assert hand balance every hand.

## Recommended Execution Order (Pragmatic)
1. Phase 1 (economy bootstrap + buy-in reliability)
2. Phase 2 (snapshot contract + server emission)
3. Phase 3 (client live table + action UX)
4. Phase 4 (headless two-client reliability harness)
5. Phase 5 (browser E2E release gate)

This order gives playable multiplayer earliest while keeping accounting and UX correctness locked in before release.
