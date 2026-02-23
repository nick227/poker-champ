# Phase 2 Integration - Complete

## Summary
Successfully integrated CashierService into the Dealer for atomic buy-in and cash-out operations. The system now properly manages the flow of funds between User bankroll and table balances.

## Changes Made

### 1. Dealer.ts Updates

**Import Changes:**
- Added `CashierService` import
- Added `nanoid` import for generating unique external refs

**`addPlayer()` Method:**
- **Before**: Directly credited PlayerBalance via PersistenceFacade
- **After**: 
  1. Calls `CashierService.processCashGameBuyIn()` FIRST
  2. Atomic transaction: Debit User.bankroll → Credit PlayerBalance
  3. Only creates in-memory PlayerState AFTER successful buy-in
  4. Generates unique `externalRef` for idempotency: `buyin_{tableId}_{userId}_{random}`
  5. Throws `INSUFFICIENT_BANKROLL` error if user lacks funds

**`removePlayer()` Method:**
- **Before**: No cash-out logic, player just left
- **After**:
  1. Captures `remainingStack` from PlayerState
  2. Calls `CashierService.processCashGameCashOut()` if stack > 0
  3. Atomic transaction: Debit PlayerBalance → Credit User.bankroll
  4. Generates unique `externalRef`: `cashout_{tableId}_{userId}_{random}`
  5. Gracefully handles cash-out failures (logs error, continues removal)
  6. If cash-out fails, PlayerBalance remains and can be recovered later

### 2. Error Handling

**New Error Code:**
- Added `INSUFFICIENT_BANKROLL` to `PokerErrorCode` type
- Thrown when user attempts buy-in without sufficient bankroll
- Client receives clear error message

### 3. Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Player Joins Table                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  CashierService.processCashGameBuyIn()                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 1. Check idempotency (externalRef)                   │   │
│  │ 2. Verify User.bankrollCents >= buyInCents           │   │
│  │ 3. Debit User.bankrollCents                          │   │
│  │ 4. Credit PlayerBalance.balanceCents                 │   │
│  │ 5. Record BalanceTransaction (type: BUYIN)           │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Dealer.addPlayer()                                          │
│  - Create PlayerState with stackCents = buyInCents           │
│  - Add to game state                                         │
│  - Start hand if enough players                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     Player Leaves Table                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Dealer.removePlayer()                                       │
│  - Capture remainingStack from PlayerState                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  CashierService.processCashGameCashOut()                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 1. Check idempotency (externalRef)                   │   │
│  │ 2. Verify PlayerBalance.balanceCents >= amount       │   │
│  │ 3. Debit PlayerBalance.balanceCents                  │   │
│  │ 4. Credit User.bankrollCents                         │   │
│  │ 5. Update PlayerBalance.status = CASHED_OUT          │   │
│  │ 6. Record BalanceTransaction (type: CASHOUT)         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Dealer.removePlayer() (continued)                           │
│  - Remove from game state                                    │
│  - Clear seat                                                │
│  - Handle game flow (check if hand can continue)             │
└─────────────────────────────────────────────────────────────┘
```

## Key Features

### Idempotency
- Every buy-in and cash-out generates a unique `externalRef`
- Format: `{operation}_{tableId}_{userId}_{random8chars}`
- Prevents double-debit on retries/reconnects
- If same `externalRef` exists, operation is skipped (returns success)

### Atomicity
- All fund movements happen in single Prisma transactions
- Either both User.bankroll and PlayerBalance update, or neither
- No possibility of "lost" funds due to partial updates

### Error Recovery
- Buy-in failure: Player not added to table, no state changes
- Cash-out failure: Player still removed, but funds remain in PlayerBalance
  - PlayerBalance.status remains "ACTIVE" or becomes "ABANDONED"
  - Can be recovered via admin tools or cleanup job

### Multi-Table Safety
- User can join multiple tables if bankroll covers all buy-ins
- Each table has separate PlayerBalance record
- Bankroll is immediately debited on buy-in, preventing overdrafts

## Compatibility Notes

### Session Handling (Concurrent Development)
The integration is designed to work with the concurrent session improvements:
- Uses `userId` consistently (not `playerId` or `sessionId`)
- Dealer methods accept `userId` parameter
- PokerRoom already maps `sessionId` → `userId` via `userIdBySessionId`
- No conflicts expected with session management refactoring

### Backward Compatibility
- PersistenceFacade still exists but is deprecated
- Old `creditPlayer`/`debitPlayer` calls removed from buy-in/cash-out flow
- In-game transactions (blinds, bets, payouts) still use PersistenceFacade
  - These will be migrated in a future phase

## Testing Recommendations

1. **Insufficient Bankroll**: User with $50 tries to buy in for $100
2. **Multi-Table**: User with $200 joins two $100 tables
3. **Reconnect During Buy-In**: Client disconnects mid-buy-in, retries with same externalRef
4. **Cash-Out with Winnings**: Player buys in for $100, wins $50, leaves with $150
5. **Cash-Out Failure**: Simulate DB error during cash-out, verify PlayerBalance persists

## Next Steps

### ✅ Phase 3: COMPLETE - No Migration Needed
**Strategic Decision**: In-game transactions (blinds, bets, payouts) should **NOT** be migrated to CashierService.

**Rationale**:
- CashierService = Cashier window (bankroll ↔ table wallet)
- PersistenceFacade/LedgerService = Dealer tray (in-game chip movement)
- In-game transactions are high-frequency and table-scoped
- They do not change user net worth
- Touching User.bankroll mid-hand would be architecturally wrong

**Current Implementation is Correct**:
- Blinds, bets, raises → PersistenceFacade.debitPlayer()
- Payouts → PersistenceFacade.creditPlayer()
- These operations only touch PlayerBalance, never User.bankroll

See `ECONOMY_ARCHITECTURE.md` for detailed explanation.

### Phase 4: Admin Tools
- `GET /api/admin/balances` - View all PlayerBalance records
- `POST /api/admin/balances/:id/recover` - Manually cash out abandoned balances
- Cleanup job to auto-recover abandoned balances after X days

### Phase 5: Reconnection Handling
- When player reconnects, check if they have active PlayerBalance
- Allow "resume" if balance exists and table still active
- Handle case where table closed but balance remains
