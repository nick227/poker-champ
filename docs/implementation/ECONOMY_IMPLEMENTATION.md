# Economy Implementation Summary

## Completed: Phase 1 - Core Economy Infrastructure

### Schema Changes (prisma/schema.prisma)

**Updated Models:**
- **PlayerBalance**: Now links to `User` (via `userId`) instead of `PokerPlayer`
  - Added `status` field: `ACTIVE | CASHED_OUT | ABANDONED`
  - Unique constraint: `@@unique([tableId, userId])`

- **BalanceTransaction**: Refactored for user-centric economy
  - Changed from `playerId` to `userId`
  - Made `tableId` optional (for tournament transactions)
  - Added `tournamentId` (optional link to Tournament)
  - Renamed `kind` → `type`, `deltaCents` → `amountCents`
  - Added `externalRef` (unique) for idempotency
  - Removed `balanceAfterCents` (not needed with new model)

**New Models:**
- **Tournament**:
  - `id`, `name`, `status` (REGISTERING | RUNNING | FINISHED | CANCELLED)
  - `entryFeeCents`, `prizePoolCents`
  - `startTime`

- **TournamentRegistration**:
  - Links `userId` to `tournamentId`
  - `entryTxId` for idempotent registration
  - `@@unique([tournamentId, userId])`

### Services Implemented

**CashierService** (`src/engine/economy/CashierService.ts`):
- `processCashGameBuyIn({ userId, tableId, amountCents, externalRef })`
  - Atomic transaction: Debit User.bankroll → Credit PlayerBalance
  - Idempotency via `externalRef`
  - Returns new table balance

- `processCashGameCashOut({ userId, tableId, amountCents, externalRef })`
  - Atomic transaction: Debit PlayerBalance → Credit User.bankroll
  - Updates PlayerBalance status to `CASHED_OUT` if balance reaches 0

- `processTournamentRegister({ userId, tournamentId, entryFeeCents, externalRef })`
  - Atomic transaction: Debit User.bankroll → Credit Tournament.prizePool
  - Creates TournamentRegistration record
  - Validates tournament status (REGISTERING or LATE_REG)

### Updated Services

**LedgerService** (`src/engine/persistence/LedgerService.ts`):
- Updated to use `userId` instead of `playerId`
- Marked as DEPRECATED (use CashierService for new code)
- Kept for backward compatibility with existing Dealer code

**PersistenceFacade** (`src/engine/persistence/PersistenceFacade.ts`):
- Updated all methods to use `userId` instead of `playerId`
- Fixed `assertHandBalanced` to use `amountCents` instead of `deltaCents`

**Dealer** (`src/engine/Dealer.ts`):
- Updated all `persistence.creditPlayer()` calls to use `userId`
- Updated all `persistence.debitPlayer()` calls to use `userId`

## Key Design Decisions

### 1. Idempotency
All CashierService methods require an `externalRef` parameter:
- Prevents double-debit on retries/reconnects
- Stored in `BalanceTransaction.externalRef` (unique constraint)
- If transaction with same `externalRef` exists, operation is skipped

### 2. Implicit Fund Locking
- No separate lock table needed
- Funds are "locked" by moving from `User.bankrollCents` to `PlayerBalance`
- `User.bankrollCents` = liquid funds
- `PlayerBalance` = funds locked per table

### 3. Multi-Tabling Safety
- Atomic operations prevent overdrafts
- User can join multiple tables if bankroll covers all buy-ins
- Each table has separate `PlayerBalance` record

### 4. Tournament vs Cash Game
- **Cash Games**: Chips = Real money, can cash out anytime
- **Tournaments**: Chips = Points, entry fee goes to prize pool
- Rake handling deferred (tournaments typically take rake upfront in entry fee)

## Next Steps (Not Implemented)

### Phase 2: Dealer Integration
- Update `Dealer.addPlayer` to call `CashierService.processCashGameBuyIn`
- Update `Dealer.removePlayer` to call `CashierService.processCashGameCashOut`
- Handle cases where user has no `userId` (guest players)

### Phase 3: HTTP Routes
- `POST /api/economy/deposit` - Add funds to user bankroll (testing/mock)
- `GET /api/economy/balance` - Get current bankroll
- `POST /api/economy/buyin` - Manual buy-in to table
- `POST /api/economy/cashout` - Manual cash-out from table

### Phase 4: Crash Recovery
- Implement cleanup job to refund abandoned `PlayerBalance` → `User.bankroll`
- Handle disconnected players (auto-cashout after timeout)

### Phase 5: Tournament Payouts
- `processTournamentPayouts({ tournamentId, payouts[], externalRef })`
- Distribute prize pool based on finishing positions

## Migration Notes

**Breaking Changes:**
- `PlayerBalance` now requires `userId` (not `playerId`)
- `BalanceTransaction` schema changed significantly
- Existing code using `PersistenceFacade` updated but marked deprecated

**Database Migration Required:**
- Run `npx prisma migrate dev` to apply schema changes
- Existing data will need manual migration if any exists
