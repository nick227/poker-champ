# Phase 3: LedgerService as Sole Authority

## Objective
Make LedgerService the **sole authority** for all in-hand chip movement. Dealer must stop mutating stacks directly and instead delegate all financial operations to LedgerService.

## Current Problems

### 1. Direct Stack Mutation
Dealer currently mutates `PlayerState.stackCents` directly in many places:
- Blind posting
- Bet/raise actions
- Pot contributions
- Payouts

**Problem**: PlayerState and PlayerBalance can drift out of sync.

### 2. Missing Deterministic ExternalRef
Current `applyTx()` doesn't use deterministic externalRef for in-hand transactions.

**Problem**: Cannot guarantee idempotency for hand replays or crash recovery.

### 3. No Hand Balance Assertion
No enforcement that debits = credits at hand end.

**Problem**: Money can "leak" from the system without detection.

### 4. Incomplete Audit Trail
BalanceTransaction records exist but aren't comprehensive.

**Problem**: Cannot fully reconstruct hand economics from database alone.

## Required Changes

### A. LedgerService Enhancements

#### 1. Add Deterministic ExternalRef
```typescript
// Format: {operation}_{tableId}_{userId}_{handId}_{detail}
// Examples:
blind_sb_table1_user123_hand456
blind_bb_table1_user123_hand456
bet_table1_user123_hand456_preflop_1
call_table1_user123_hand456_flop_2
raise_table1_user123_hand456_turn_3
payout_table1_user123_hand456
```

#### 2. Add Specific Methods
```typescript
class LedgerService {
  // Blind posting
  async postBlind(params: {
    userId: string;
    handId: string;
    blindType: 'SB' | 'BB';
    amountCents: number;
  }): Promise<number>;

  // Bet/Raise/Call
  async debitBet(params: {
    userId: string;
    handId: string;
    street: Street;
    action: 'BET' | 'RAISE' | 'CALL' | 'ALL_IN';
    amountCents: number;
    sequenceNum: number; // For multiple actions in same street
  }): Promise<number>;

  // Refund (e.g., uncalled bet)
  async creditRefund(params: {
    userId: string;
    handId: string;
    amountCents: number;
    reason: string;
  }): Promise<number>;

  // Payout
  async creditPayout(params: {
    userId: string;
    handId: string;
    amountCents: number;
    potIndex?: number; // For side pots
  }): Promise<number>;

  // Hand balance check
  async assertHandBalanced(handId: string): Promise<void>;
}
```

#### 3. Return New Balance
All methods return the new `PlayerBalance.balanceCents` value.
Dealer uses this to **set** (not mutate) `PlayerState.stackCents`.

### B. Dealer Refactoring

#### 1. Remove Direct Stack Mutations
**Before**:
```typescript
p.stackCents -= amountCents; // ❌ Direct mutation
```

**After**:
```typescript
const newBalance = await this.ledger.debitBet({
  userId: p.id,
  handId: this.state.handId,
  street: this.state.street,
  action: 'BET',
  amountCents,
  sequenceNum: this.getActionSequence(p.id),
});
p.stackCents = newBalance; // ✅ Mirror ledger value
```

#### 2. Blind Posting
```typescript
// In startHand() or similar
const sbBalance = await this.ledger.postBlind({
  userId: sbPlayer.id,
  handId: this.state.handId,
  blindType: 'SB',
  amountCents: this.state.smallBlindCents,
});
sbPlayer.stackCents = sbBalance;

const bbBalance = await this.ledger.postBlind({
  userId: bbPlayer.id,
  handId: this.state.handId,
  blindType: 'BB',
  amountCents: this.state.bigBlindCents,
});
bbPlayer.stackCents = bbBalance;
```

#### 3. Bet/Raise/Call
```typescript
// In handleAction() or similar
const newBalance = await this.ledger.debitBet({
  userId: player.id,
  handId: this.state.handId,
  street: this.state.street,
  action: actionType,
  amountCents: betAmount,
  sequenceNum: this.getActionSequence(player.id),
});
player.stackCents = newBalance;
```

#### 4. Payouts
```typescript
// In finishHandShowdownWithSidePots()
for (const [userId, amountCents] of payouts.entries()) {
  const newBalance = await this.ledger.creditPayout({
    userId,
    handId: this.state.handId,
    amountCents,
    potIndex: 0, // or side pot index
  });
  const player = this.state.playersById.get(userId);
  if (player) player.stackCents = newBalance;
}
```

#### 5. Hand End Assertion
```typescript
// At end of every hand
await this.persistence.assertHandBalanced(this.state.handId);
```

### C. Wallet Boundary Enforcement

```
┌────────────────────────────────────────────────────────┐
│              User.bankrollCents                         │
│           (Managed by CashierService)                   │
└────────────────────────────────────────────────────────┘
                    ▲                  ▲
                    │                  │
              Buy-In Only        Cash-Out Only
                    │                  │
                    ▼                  ▼
┌────────────────────────────────────────────────────────┐
│           PlayerBalance.balanceCents                    │
│           (Managed by LedgerService)                    │
│                                                          │
│  ┌────────────────────────────────────────────────┐   │
│  │  In-Hand Transactions (LedgerService only):    │   │
│  │  - Blinds                                       │   │
│  │  - Bets, Raises, Calls                         │   │
│  │  - Refunds                                      │   │
│  │  - Payouts                                      │   │
│  └────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
                    ▲                  ▲
                    │                  │
              Debit Only          Credit Only
                    │                  │
                    ▼                  ▼
┌────────────────────────────────────────────────────────┐
│            PlayerState.stackCents                       │
│              (Read-Only Mirror)                         │
└────────────────────────────────────────────────────────┘
```

**Rules**:
1. CashierService touches: `User.bankrollCents` ↔ `PlayerBalance.balanceCents`
2. LedgerService touches: `PlayerBalance.balanceCents` only
3. Dealer touches: `PlayerState.stackCents` only (as mirror of PlayerBalance)
4. PlayerState.stackCents is **always set from** LedgerService return values

## Implementation Checklist

### LedgerService
- [ ] Add `postBlind()` method with deterministic externalRef
- [ ] Add `debitBet()` method with deterministic externalRef
- [ ] Add `creditRefund()` method with deterministic externalRef
- [ ] Add `creditPayout()` method with deterministic externalRef
- [ ] Update `assertHandBalanced()` to check specific handId
- [ ] All methods return new balance value
- [ ] All transactions use deterministic externalRef

### Dealer
- [ ] Remove all direct `p.stackCents +=` mutations
- [ ] Remove all direct `p.stackCents -=` mutations
- [ ] Replace with `p.stackCents = await ledger.method()`
- [ ] Add `getActionSequence()` helper for sequenceNum
- [ ] Call `assertHandBalanced()` at end of every hand
- [ ] Handle ledger errors gracefully

### PersistenceFacade
- [ ] Update `assertHandBalanced()` to accept handId parameter
- [ ] Delegate to `ledger.assertHandBalanced(handId)`

### Tests
- [ ] Test blind posting creates correct transactions
- [ ] Test bet/raise/call creates correct transactions
- [ ] Test refund creates correct transactions
- [ ] Test payout creates correct transactions
- [ ] Test hand balance assertion passes for balanced hands
- [ ] Test hand balance assertion fails for unbalanced hands
- [ ] Test crash recovery using deterministic externalRef
- [ ] Test PlayerState.stackCents always matches PlayerBalance

## Benefits

### 1. Fully Isolated Wallet Boundaries
- CashierService: Entry/exit only
- LedgerService: In-hand only
- No overlap, no confusion

### 2. Fully Auditable Hand Economics
- Every chip movement has BalanceTransaction record
- Deterministic externalRef allows replay
- Can reconstruct entire hand from database

### 3. Crash-Safe Recovery
- Deterministic externalRef prevents double-debit on retry
- PlayerBalance is source of truth
- PlayerState can be rebuilt from PlayerBalance

### 4. Deterministic Money Math
- All calculations in LedgerService
- PlayerState is read-only mirror
- No drift between in-memory and database

### 5. Fail-Fast on Errors
- `assertHandBalanced()` catches money leaks immediately
- Hard failure prevents corruption from spreading
- Easy to debug with full audit trail

## Migration Strategy

### Step 1: Enhance LedgerService
Add new methods without changing existing code.

### Step 2: Update Dealer (One Operation at a Time)
1. Blind posting
2. Bet/raise/call
3. Refunds
4. Payouts

### Step 3: Add Assertions
Add `assertHandBalanced()` calls at hand end.

### Step 4: Remove Old Code
Remove deprecated `applyTx()` and direct mutations.

### Step 5: Test Thoroughly
Run full test suite, verify all hands balance.

## Example: Complete Hand Flow

```typescript
// 1. Blinds
const sbBal = await ledger.postBlind({
  userId: sb.id, handId, blindType: 'SB', amountCents: 50
});
sb.stackCents = sbBal; // Mirror

const bbBal = await ledger.postBlind({
  userId: bb.id, handId, blindType: 'BB', amountCents: 100
});
bb.stackCents = bbBal; // Mirror

// 2. Preflop betting
const callBal = await ledger.debitBet({
  userId: utg.id, handId, street: 'PREFLOP', action: 'CALL',
  amountCents: 100, sequenceNum: 1
});
utg.stackCents = callBal; // Mirror

const raiseBal = await ledger.debitBet({
  userId: co.id, handId, street: 'PREFLOP', action: 'RAISE',
  amountCents: 300, sequenceNum: 2
});
co.stackCents = raiseBal; // Mirror

// 3. Payouts
const payoutBal = await ledger.creditPayout({
  userId: winner.id, handId, amountCents: 800, potIndex: 0
});
winner.stackCents = payoutBal; // Mirror

// 4. Assert balanced
await ledger.assertHandBalanced(handId);
// If debits (50+100+100+300) != credits (800), throws error
```

## Success Criteria

✅ All in-hand chip movements go through LedgerService
✅ Zero direct mutations of PlayerState.stackCents
✅ Every hand has complete BalanceTransaction audit trail
✅ All transactions use deterministic externalRef
✅ assertHandBalanced() passes for all hands
✅ PlayerState.stackCents always equals PlayerBalance.balanceCents
✅ Crash recovery works via idempotent replay
