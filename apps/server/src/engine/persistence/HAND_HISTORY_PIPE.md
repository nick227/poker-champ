# Hand history persistence pipe (single path)

Hands are persisted only through this path. There are no other writers.

## Condition

- `PersistenceFacade.enabled === true` only when **both** `DATABASE_URL` is set **and** `NODE_ENV !== "test"` (see `PersistenceFacade` constructor).
- If `enabled` is false, all hand-history calls are no-ops and **no Hand rows are written**.
- **Important:** If the game server is started with `NODE_ENV=test` (e.g. some test script), persistence is disabled and played hands will never be saved. Use `NODE_ENV=development` or unset when running the real server.

## Call sequence (game code → persistence)

1. **ensureTableAndPlayers(roster)**  
   - Callers: `Dealer.ensurePlayerPersistence` (full roster), `PlayerLifecycleService.addBot` (full roster).  
   - Must receive the **full table roster** so `playerIdMap` has every seated player.  
   - Creates/updates `PokerPlayer` (with `userId` for humans) and populates the in-memory map used by steps 2–4.

2. **startHand(params)**  
   - Caller: `HandLifecycleService.startHand()` when `persistence.enabled && persistence.handHistory`.  
   - Creates `Hand` and `HandPlayer` rows using `resolvePlayerId` (requires step 1 to have run for this table).

3. **recordAction** / **recordPayout**  
   - Callers: `SettlementService.recordAcceptedAction`, `SettlementService.recordAcceptedPayout`.  
   - Only when `persistence.enabled && persistence.handHistory`.

4. **endHand(params)**  
   - Caller: `SettlementService.finalizePersistedHand(reason)` from:  
     - `HandLifecycleService.finishHandByLastStanding` (ALL_FOLDED),  
     - `HandLifecycleService.finishHandShowdownWithSidePots` (SHOWDOWN).  
   - Sets `Hand.endedAt`, `Hand.reason`, `Hand.boardJson`, and updates `HandPlayer.endingStackCents`.  
   - Only when `persistence.enabled && persistence.handHistory`.

## Redundant or alternate paths

- There are **no** other code paths that create or update `Hand` / `HandPlayer` for live play.  
- The HTTP layer (`HandHistoryRouter`) only **reads**; it does not write hand data.

## If hands are not appearing for a user

1. Confirm `DATABASE_URL` is set and `NODE_ENV !== "test"` where the server runs.
2. Confirm `ensureTableAndPlayers` is invoked with a **full roster** including that user before any hand (addPlayer/addBot and ensurePlayerPersistence).
3. Run `scripts/confirm-history-user.ts <email>` to see overview counts and `PokerPlayer` count for that user.
