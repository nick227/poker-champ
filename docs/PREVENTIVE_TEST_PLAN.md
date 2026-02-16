# Preventive Test Plan

Date: February 16, 2026  
Scope: Live multiplayer cash-game stability, correctness, and release safety

## Purpose
Catch regressions early in realtime flow, table/lobby synchronization, legal-action enforcement, and accounting settlement before manual release testing.

## Core Principles
- Server is the only authority for action legality, turn ownership, and payouts.
- Shared contract is the source of truth for message structure.
- Every release candidate must pass automated gate + manual two-browser gate.

## Required Automated Gates
1. `pnpm verify`
2. `pnpm phase5:auto`
3. `pnpm harness:headless`

## Test Matrix

| ID | Category | Goal | Command / Location | Owner | Frequency | Gate |
|---|---|---|---|---|---|---|
| T01 | Contract drift | Prevent server/client schema divergence | `pnpm -C packages/realtime-contract typecheck` | Backend + Client | PR | Required |
| T02 | Client contract guard | Reject invalid realtime payloads safely | `apps/client/src/tests/contract.guards.test.ts` | Client | PR | Required |
| T03 | Table flow baseline | Validate join + initial table flow | `src/tests/table-flow.basic.test.ts` | Backend | PR | Required |
| T03b | Table join guard | Validate join success with buy-in + reject missing buy-in | `pnpm test:server:join` (`src/tests/table-join.guard.test.ts`) | Backend | PR | Required |
| T03c | Action broadcast correctness | Validate out-of-turn rejection + accepted action broadcast/state progression to all players | `pnpm test:server:broadcast` (`src/tests/table-action-broadcast.test.ts`) | Backend | PR | Required |
| T04 | Snapshot contract | Validate `TABLE_SNAPSHOT` shape/options | `src/tests/table-snapshot.contract.test.ts` | Backend | PR | Required |
| T05 | Headless multiplayer harness | Multi-user hand cycle, reconnect, side-pot signal, settlement checks | `pnpm harness:headless` | Backend | PR + pre-release | Required |
| T06 | Full automated phase5 gate | Verify + backend health + client startup + evidence artifact | `pnpm phase5:auto` | Release owner | Pre-release | Required |
| T07 | Lobby sync | Ensure multi-user lobby sees active tables immediately | Manual + `docs/PHASE5_TWO_BROWSER_RELEASE_GATE_LOG.md` | Release owner | Pre-release | Required |
| T08 | Two-browser release E2E | Human correctness of turn prompts/actions/payouts | Manual checklist in `docs/PHASE5_TWO_BROWSER_RELEASE_GATE_LOG.md` | Release owner | Pre-release | Required |

## High-Risk Scenarios (Must be Covered)

1. **Action legality matrix**
- Validate `check/call/bet/raise/all-in/fold` by street and stack state.
- Include illegal action attempts from non-acting users.

2. **Amount bounds**
- Assert `callAmount`, `minRaiseTo`, `maxRaiseTo` are coherent.
- Include short-stack and min-raise edge cases.

3. **Accounting invariants**
- Assert per hand: `sum(lastHandResult.payoutsByUserId) === lastHandResult.potCents`.
- No negative balances/stacks.

4. **Blind + commitment consistency**
- SB/BB must update stack, round bet, committed amount, and pot coherently.

5. **Reconnect reliability**
- Mid-hand disconnect + reconnect restore with valid snapshot continuity.

6. **Lobby consistency**
- One user creates table, other users see it quickly.
- Full table must reject additional joins server-side.

7. **Join-state persistence**
- Selected buy-in persists through table navigation/realtime connect.
- No `MISSING_BUY_IN_CENTS` regressions.

## Pre-Release Checklist (Automated + Manual)

1. Run:
```bash
pnpm verify
pnpm phase5:auto
```
2. Confirm evidence artifact exists:
- `artifacts/phase5-automated-gate.json`
3. Execute and complete:
- `docs/PHASE5_TWO_BROWSER_RELEASE_GATE_LOG.md`
4. Mark final result PASS/FAIL with notes and follow-up issues.

## Failure Handling Policy
- Any failure in required gates blocks release.
- Log failures in `docs/PHASE5_TWO_BROWSER_RELEASE_GATE_LOG.md`.
- Fixes must include at least one regression test for the failed scenario.

## Expansion Plan (Next Iteration)
1. Add dedicated tests for full-table join rejection UX.
2. Add scripted malformed-message abuse tests.
3. Add load smoke (multiple concurrent tables/clients).
4. Add staged environment runbook checks (schema/backfill verification).
