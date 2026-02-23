# Poker Engine Status Check

Date: 2026-02-15  
Project: `poker-engine-poc` (`c:\wamp64\www\poker-champ`)

## Executive Summary

The codebase has a solid foundation for a server-authoritative poker engine (rooms, dealer flow, side pots, persistence facade, odds, timers), but it is **not yet production-usable**.

The immediate blockers are:
- Build is currently failing.
- Dependency versions are inconsistent (Colyseus packages).
- Hand lifecycle appears to stop after one hand.
- Seat allocation is hardcoded to 9 seats, ignoring table config.

## What Exists and Looks Good

- Real-time room structure is in place:
  - `src/lobby/LobbyRoom.ts`
  - `src/rooms/PokerRoom.ts`
  - `src/engine/Dealer.ts`
- Action validation via Zod:
  - `src/messages/schemas.ts`
- Typed engine errors:
  - `src/engine/errors.ts`
- Side-pot and odd-chip split logic:
  - `src/engine/rules/SidePotManager.ts`
- Optional persistence facade when `DATABASE_URL` is missing:
  - `src/engine/persistence/PersistenceFacade.ts`
- Timebank + auto-action behavior exists in Dealer turn logic:
  - `src/engine/Dealer.ts`

## Current Blockers (Usability)

1. Build fails (`npm run build`)
- `tsconfig` is missing decorator compiler options needed by Colyseus Schema decorators.
  - `tsconfig.json`
  - Affects `src/state/PlayerState.ts`, `src/state/PokerState.ts` with `TS1240`.
- `pokersolver` typings missing (`TS7016`).
- `src/engine/__tests__/dealer.test.ts` uses outdated constructor (`new Dealer(state)` vs current signature).

2. Dependency graph mismatch
- `package.json` pins:
  - `@colyseus/core: 0.17.25`
  - `@colyseus/schema: 2.0.36`
- Install required `--legacy-peer-deps`, which is a strong signal of version drift.

3. Hand lifecycle likely stalls after hand end
- A hand starts on player join when 2+ players are seated:
  - `src/engine/Dealer.ts:72`
- After hand completion, state is set back to `WAITING`:
  - `src/engine/Dealer.ts:429`
  - `src/engine/Dealer.ts:504`
- No obvious re-entry to `startHand()` after `HAND_END`, so table likely plays one hand then idles.

4. Seat capacity bug
- Dealer initializes exactly 9 seats regardless of table config:
  - `src/engine/Dealer.ts:50`
- `PokerRoom` allows configurable seats and sets `maxClients` to table max:
  - `src/rooms/PokerRoom.ts:40`
- This can desync room capacity vs seat map (especially non-9 seat tables).

5. Test suite health is partial
- `vitest` result: **7 files passed, 3 failed**.
- Failed suites crash at Colyseus decorator runtime (`PlayerState`/`PokerState` import path in tests).
- Existing passing tests are mostly narrow unit checks; current suite does not prove full hand lifecycle correctness.
- `src/engine/__tests__/dealer.test.ts` exists but is excluded by Vitest include pattern:
  - `vitest.config.ts:7`

## Security and Production Notes

- Private table passwords are hashed with plain SHA-256 (no salt/work factor):
  - `src/lobby/TableManager.ts:10`
- Comment already flags this as POC and recommends bcrypt/argon2.

## Recommended Priority (Current)

Priority to get engine usable: **Stabilize runtime correctness first, then harden build/test pipeline**.

### P0 (Do First)
- Fix Colyseus compatibility and compiler config:
  - Align `@colyseus/*` versions.
  - Add decorator compiler settings in `tsconfig`.
  - Restore clean `npm install` without `--legacy-peer-deps`.
- Fix lifecycle correctness:
  - Auto-start next hand when `street` returns to `WAITING` and >=2 active players.
  - Handle player leave during a hand without deadlocking turn progression.
- Fix seat initialization:
  - Initialize seat array from configured `maxSeats`, not hardcoded 9.

### P1 (Immediately After P0)
- Make test suite meaningful and green:
  - Repair failing tests.
  - Include engine integration tests in Vitest config.
  - Add deterministic hand-flow tests (join -> blinds -> actions -> showdown -> next hand).
- Ensure `npm run build` and `npm run test:run` are both required CI gates.

### P2 (Usability/Hardening)
- Replace SHA-256 table password hashing with bcrypt/argon2.
- Improve onboarding docs:
  - canonical message contracts,
  - local run modes (with and without DB),
  - troubleshooting matrix.

## Suggested "Usable" Definition for This Repo

Treat the engine as usable when all are true:
- `npm install`, `npm run build`, `npm run test:run` succeed on a clean machine.
- A table can run continuous hands (not one-and-stop) with 2+ players.
- Non-9 seat tables behave correctly.
- Private table auth uses a modern password hash.
- DB optional mode and DB-enabled mode both have passing smoke tests.

