# Economy Services Proposal (Revised)

## 1. Overview
The economy system manages `User.bankrollCents` (global wallet) and `PlayerBalance` (table/context wallet). This revision incorporates **Tournament** logic (entry fees, prize pools) and ensures **Multi-tabling** safety (locking funds per active table).

## 2. Core Concepts

### A. Wallet Separation
1.  **Bankroll Wallet**: `User.bankrollCents`. Central liquidity.
2.  **Table Wallet (Cash Game)**: `PlayerBalance`. Chips currently on a specific Ring Game table.
3.  **Tournament Wallet**: "Chips" are virtual points. The economic transaction is the **Entry Fee**.

### B. Multi-Tabling Safety
*   **Problem**: A user with $100 could try to join two $100 tables simultaneously if validation isn't atomic.
*   **Solution**: `CashierService` performs atomic checks + decrements. Since each table is a unique context, the user's central bankroll is deducted *immediately* upon join/registration.
    *   **Cash Game**: Funds move from `Bankroll` -> `TableBalance`.
    *   **Tournament**: Funds move from `Bankroll` -> `TournamentPrizePool` (House takes fee immediately).

## 3. Architecture Components

### A. `CashierService`
Responsible for atomic balance transfers and entry fees.

*   `processCashGameBuyIn(userId, tableId, amountCents)`:
    *   **Atomic Tx**:
        1.  Debit `User.bankroll`. Fail if insufficient.
        2.  Credit `PlayerBalance` (Table).
        3.  Record `BalanceTransaction` (Type: `BUYIN`).

*   `processCashGameCashOut(userId, tableId, amountCents)`:
    *   **Atomic Tx**:
        1.  Zero out `PlayerBalance` (or reduce).
        2.  Credit `User.bankroll`.
        3.  Record `BalanceTransaction` (Type: `CASHOUT`).

*   `processTournamentRegister(userId, tournamentId, feeCents, rakeCents)`:
    *   **Transaction**:
        1.  Debit `User.bankroll` (Total = Fee + Rake).
        2.  Credit `Tournament.prizePool` (Fee).
        3.  Credit `System.revenue` (Rake).
        4.  Create `TournamentRegistration` record.

### B. Tournament Considerations
Tournaments differ conceptually from cash games:
*   **Chips != Cash**: Tournament chips have no cash value. They are points.
*   **Rake**: Collected *upfront* as part of the entry fee (e.g., $10 + $1). Rake is *rarely* taken from pots in tournaments.
*   **Payouts**: Prizes are distributed from the `TournamentPrizePool` to `User.bankroll` based on finishing position (Structure).

### C. Multi-Tabling Implementation
*   **Concurrency**: User can be connected to multiple `PokerRoom` instances (SocketIO multiplexing or multiple sockets).
*   **Identity**: `userId` connects all sessions.
*   **Restrictions**:
    *   User cannot sit at the *same* table twice (already enforced by `@@unique([tableId, userId])`).
    *   User *can* sit at different tables as long as they have bankroll covers the buy-in.

## 4. Revised Implementation Plan

### Phase 1: Core Cashier (Cash Games)
1.  Implement `CashierService.ts` with `processBuyIn` and `processCashOut`.
2.  Integrate into `Dealer.addPlayer` / `removePlayer`.

### Phase 2: Tournament Support (Foundation)
*   *Note: Requires Tournament Models (`Tournament`, `TournamentLevel`, `TournamentPlayer`)*.
*   Implement `processTournamentRegister`.
*   Implement `processTournamentPayout` (Administrator triggers this at tourney end).

### Phase 3: Rake & Revenue Support
*   **Cash Games**: Classic "Rake the Pot" (Post-hand deduction).
*   **Tournaments**: "Entry Fee Rake" (Pre-game deduction).

## 5. Security & Edge Cases
*   **Disconnects**: Funds remain in `PlayerBalance`. User can reconnect and sit back down, or the system auto-cashes them out after X minutes of inactivity.
*   **Server Crash**:
    *   **Cash Game**: PersistenceFacade ensures `PlayerBalance` is correct. Reconciliation script restores `PlayerBalance` -> `Bankroll` if table doesn't recover.
    *   **Tournament**: Complex. Requires pausing tournament state and restoring from last checkpoint.
