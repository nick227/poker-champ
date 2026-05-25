# Tournament blind-spot test plan

**Date:** 2026-05-23  
**Context:** `pnpm test:tournaments` (113 tests) covers rules and HU paths well. Gaps are **production orchestration** (tick, dead rooms, real hands) and **multi-way fields**.  
**Rules reference:** `docs/plans/tournament-lifecycle-rules.md`

---

## How to run

```powershell
$env:DATABASE_URL = "mysql://root@127.0.0.1:3306/poker-champ"
pnpm test:tournaments
```

Integration tests need MySQL. Copy patterns from `tournaments-m16-late-join.integration.test.ts`:

- Mock Colyseus `matchMaker` with a shared `pokerRooms` map (and **`query` must return live rooms** — empty `query` hid orphan bugs).
- Use `CashierService.processTournamentRegister` or HTTP + auth mocks like M15/M16.
- Prefer **`tournamentDirector.tick(now)`** over calling `beginLateRegistration` / `closeLateRegistration` directly when testing clock behavior.

After adding files, append paths to the `test:tournaments` script in root `package.json`.

---

## What we already trust (do not re-test deeply)

| Area | Coverage |
|------|----------|
| Schedule math (late reg, rebuy window, unregister) | Unit + client lib tests |
| HU bust → finish / payouts | M3, M5, M10, M11 |
| Rebuy happy path | M15 |
| Bot-only finish guard | `tournament-finish-resolution` + M16/M17 |
| Orphan: `RUNNING` + null `roomId` not finished | Unit + M16 |
| Lobby CTAs, result banner copy | Client unit tests in script |

---

## Priority tests to add

### M18 — Late reg close via `tick()` (P0)

**Why:** Production uses `processLateRegistrationClosures` inside `tick()`, not manual `closeLateRegistration` calls.

**Setup**

1. Create freezeout, `lateRegMinutes: 16`, `startTime` in the past.
2. Register human A (seated at start) and human B (registered **after** table is `LATE_REG` — do not seat B).
3. Set `now = startTime + lateRegMinutes + 1s`.

**Act:** `await tournamentDirector.tick(now)` once (or twice for idempotence).

**Assert**

- B gets `finishPlace` (no-show), A still active.
- Status `RUNNING` (not `FINISHED`).
- Tournament still in lobby joinable set for A.

**File:** `apps/server/src/tests/integration/tournaments-m18-tick-late-reg-close.integration.test.ts`

---

### M19 — Dead Colyseus room recovery (P0)

**Why:** `resumeDeadTournamentRooms` has **zero** tests; common after restart.

**Setup**

1. Start `RUNNING` tournament with `roomId` set and room in `pokerRooms`.
2. Delete room from `pokerRooms` only (simulate crash); leave DB `roomId` unchanged.

**Act:** `await tournamentDirector.tick(now)`.

**Assert**

- New `roomId` (or room recreated); status stays `RUNNING`.
- Registrations intact; humans can still be reconciled / seated.

**File:** `apps/server/src/tests/integration/tournaments-m19-dead-room-resume.integration.test.ts`

---

### M20 — Rebuy sweep when window closed (P0)

**Why:** `sweepExpiredRebuyPendingPlayers` is only called from reconciler; no tests today.

**Setup**

1. REBUY tournament, `rebuyPeriodMinutes: 1`, HU running.
2. Bust player B → `rebuyPendingAt` set.
3. Advance `now` past rebuy window (do **not** buy in).

**Act:** `reconcileAfterHand` (or one real hand end — see M22).

**Assert**

- B gets `finishPlace`, `rebuyPendingAt` null.
- Tournament can finish when A alone has chips.

**File:** `apps/server/src/tests/integration/tournaments-m20-rebuy-sweep.integration.test.ts`  
**Optional unit:** `tournament-rebuy.test.ts` — mock Prisma, assert sweep assigns place when `canRebuyTournament` is false.

---

### M21 — Four-player freezeout finish order (P1)

**Why:** Almost all integration tests are HU; `finishPlace` ordering and payouts untested at scale.

**Setup**

1. `maxPlayers: 4`, four humans registered, director starts table.
2. Bust C, then D, then B (synthetic zero stack + reconcile, same as M3).

**Assert**

- `finishPlace`: C=4, D=3, B=2, A=1 (or consistent descending order).
- Payout txs match `computeHumanPayoutAmounts` for 4 entries.
- Status `FINISHED` only after last bust.

**File:** `apps/server/src/tests/integration/tournaments-m21-four-way-finish.integration.test.ts`

---

### M22 — Reconciler via dealer hand end (P1)

**Why:** Tests bypass `PokerRoom.onTournamentWaitingAfterHand`; dealer/tick races won’t show up.

**Setup**

1. HU tournament room, both seated with stacks.
2. Play one hand to completion (fold or all-in) so dealer reaches `WAITING` and fires the callback — **do not** call `reconcileAfterHand` manually.

**Assert**

- Busted player removed from `state.playersById`.
- Registration / overlay / snapshot reflect bust or rebuy pending.

**How:** Reuse M15 helpers (`holdDealerHands`, `waitForDealerIdle`) or minimal forced actions if dealer test utils exist in `dealer.*.integration.test.ts`.

**File:** `apps/server/src/tests/integration/tournaments-m22-dealer-reconcile.integration.test.ts`

---

### M23 — `instantStart` API (P2)

**Why:** Router branch untested end-to-end.

**Act:** `POST /api/tournaments` with `instantStart: true` (M15-style HTTP test).

**Assert**

- `startTime` ≈ now; tournament moves to `LATE_REG` or `RUNNING` per rules within one `processTournament` / `tick`.

**File:** extend M5 or small `tournaments-m23-instant-start.integration.test.ts`

---

## Client & E2E (same sprint, lighter)

| ID | What | How | Where |
|----|------|-----|--------|
| C1 | Bust strip / viewer latch | Run existing `useLiveTableStatusStripState.test.tsx` | **Add file to `test:tournaments` script** |
| C2 | Joined list hides `FINISHED` | Render `JoinedTournamentsSection` with mock rows; assert filter | `JoinedTournamentsSection.test.tsx` |
| E1 | Join → table → bust message | Playwright: register, join table, force bust (or mock snapshot), assert banner text | `apps/client/e2e/tournament-bust.spec.ts` |

---

## Implementation checklist

1. [x] M18 tick late-reg close  
2. [x] M19 dead room resume  
3. [x] M20 rebuy sweep  
4. [x] M21 four-way finish  
5. [x] M22 dealer-driven reconcile  
6. [x] Add `useLiveTableStatusStripState.test.tsx` to `test:tournaments`  
7. [x] C2 joined section filter  
8. [x] M23 — E1 Playwright deferred  

Each new integration file: register in `package.json` → `test:tournaments`, run full suite before commit.

---

## Success criteria

- No regression on premature `FINISHED`, orphan close, or bust UX.  
- New failures reproduce **production entry points** (`tick`, dead room, sweep, 4-way order, dealer callback).  
- `pnpm test:tournaments` stays green with **~125+** tests and stable under `--no-file-parallelism`.
