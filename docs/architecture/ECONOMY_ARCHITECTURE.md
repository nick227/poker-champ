# Economy Architecture - Strategic Separation

## Two Separate Domains

### 🏦 CashierService = "Cashier Window"
**Purpose**: Manage funds between User bankroll and table wallet
**Scope**: Entry/Exit transactions only
**Touches**: `User.bankrollCents` ↔ `PlayerBalance.balanceCents`

**Operations**:
- ✅ Buy-in (bankroll → table)
- ✅ Cash-out (table → bankroll)
- ✅ Tournament registration (bankroll → prize pool)
- ✅ Tournament payout (prize pool → bankroll)

### 🎲 LedgerService/PersistenceFacade = "Dealer Tray"
**Purpose**: Track in-hand chip movement
**Scope**: All in-game transactions
**Touches**: `PlayerBalance.balanceCents` only (never User.bankroll)

**Operations**:
- ✅ Blind posting (SB, BB)
- ✅ Bets, Calls, Raises
- ✅ Pot contributions
- ✅ Payouts (pot → winner stacks)
- ✅ All in-hand ledger entries

## Why This Separation?

### 1. **Performance**
- In-hand transactions happen at **extremely high frequency**
- Blinds, bets, raises happen every few seconds
- CashierService involves User table lookups and complex validation
- LedgerService is lightweight, table-scoped only

### 2. **Correctness**
- In-hand transactions **do not change user net worth**
- Money moves within the table ecosystem only
- User.bankroll should only change on entry/exit
- Touching User.bankroll mid-hand would be architecturally wrong

### 3. **Isolation**
- Game logic should not depend on user account system
- Tables can run even if User table is unavailable
- Clear separation of concerns

### 4. **Atomicity Scope**
- CashierService: Atomic across User + PlayerBalance
- LedgerService: Atomic within PlayerBalance only
- Different transaction boundaries for different purposes

## Current Implementation Status

### ✅ Correctly Using CashierService
- `Dealer.addPlayer()` → `CashierService.processCashGameBuyIn()`
- `Dealer.removePlayer()` → `CashierService.processCashGameCashOut()`

### ✅ Correctly Using PersistenceFacade
- `Dealer.debitAndPayExact()` → `persistence.debitPlayer()` (blinds, bets)
- `Dealer.finishHandByLastStanding()` → `persistence.creditPlayer()` (payout)
- `Dealer.finishHandShowdownWithSidePots()` → `persistence.creditPlayer()` (payout)

### ❌ DO NOT Change
The current in-game transaction flow is **correct as-is**. Do not migrate these to CashierService.

## Conceptual Model

```
┌─────────────────────────────────────────────────────────────┐
│                    User.bankrollCents                        │
│                   (Global Net Worth)                         │
└─────────────────────────────────────────────────────────────┘
                    ▲                    ▲
                    │                    │
         CashierService.buyIn   CashierService.cashOut
                    │                    │
                    ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│              PlayerBalance.balanceCents                      │
│                  (Table Wallet)                              │
└─────────────────────────────────────────────────────────────┘
         ▲                                        ▲
         │                                        │
    LedgerService                           LedgerService
    .debitPlayer()                          .creditPlayer()
    (blinds, bets)                          (payouts)
         │                                        │
         ▼                                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  PlayerState.stackCents                      │
│                   (In-Memory Chips)                          │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow Examples

### Example 1: Player Joins and Plays
```
1. User has bankrollCents = 10000
2. Buy-in for 5000
   → CashierService: bankroll 10000 → 5000, PlayerBalance 0 → 5000
3. PlayerState.stackCents = 5000
4. Post BB (100 cents)
   → LedgerService: PlayerBalance 5000 → 4900
   → PlayerState.stackCents 5000 → 4900
5. Win pot (300 cents)
   → LedgerService: PlayerBalance 4900 → 5200
   → PlayerState.stackCents 4900 → 5200
6. Player leaves
   → CashierService: PlayerBalance 5200 → 0, bankroll 5000 → 10200
```

### Example 2: What NOT to Do
```
❌ WRONG: Bet 100 cents
   → CashierService: bankroll 10000 → 9900, PlayerBalance 5000 → 5100
   
Why wrong:
- User net worth didn't change (still has 10000 total)
- Unnecessary User table access
- Breaks separation of concerns
- Performance overhead
```

## Migration Notes

### Phase 3 Decision: Keep PersistenceFacade
- **Do NOT migrate in-game transactions to CashierService**
- PersistenceFacade/LedgerService is the correct tool for this job
- Only deprecate PersistenceFacade for buy-in/cash-out (already done)

### Future Enhancements
- Consider renaming `PersistenceFacade` → `TableLedger` for clarity
- Add explicit documentation that it's for in-game only
- Keep CashierService and LedgerService as separate, focused services

## Summary

| Operation | Service | Touches User.bankroll? | Frequency |
|-----------|---------|------------------------|-----------|
| Buy-in | CashierService | ✅ Yes | Low (once per session) |
| Cash-out | CashierService | ✅ Yes | Low (once per session) |
| Blinds | LedgerService | ❌ No | High (every hand) |
| Bets | LedgerService | ❌ No | Very High (multiple per hand) |
| Payouts | LedgerService | ❌ No | High (every hand) |

**Golden Rule**: If it happens during a hand, use LedgerService. If it's entry/exit, use CashierService.
