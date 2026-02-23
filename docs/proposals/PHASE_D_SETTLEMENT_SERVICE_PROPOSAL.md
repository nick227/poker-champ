# Multiplayer Event Flow - Next Steps: Phase D Settlement Service

## Current Status: Phases A-C Complete ✅

**Phase A - Monotonic Snapshots**: ✅ Eliminated snapshot races
**Phase B - ActionId Diagnostics**: ✅ Made actions observable  
**Phase C - Connection Status Management**: ✅ Clarified connection state

**Result**: Professional-grade multiplayer infrastructure with 80% benefit, 10% complexity.

## Phase D: Money Safety - SettlementService Tests

### Why This is Critical

You've already locked down:
- ✅ Betting invariants
- ✅ Side pots  
- ✅ Showdown determinism

**Settlement is the last unchecked money boundary.** This completes the chip-safety triangle:
```
Betting → Side Pots → Showdown → Settlement
```

### Goal

Given:
- Pots (main + side pots)
- Winners (with eligibility)
- Player commitments

Ensure:
- ✅ Correct payouts
- ✅ No negative stacks
- ✅ No chip creation
- ✅ No chip loss

### Test Harness Structure

**File**: `src/tests/settlement.service.test.ts`

**Test Cases**:
1. **Single winner, single pot**
   - Basic settlement verification
2. **Tie split even**  
   - Multiple winners split pot evenly
3. **Tie split odd chip**
   - Handle odd chip distribution rules
4. **Multiple side pots, different winners**
   - Complex multi-pot scenarios
5. **Folded player never receives chips**
   - Folded players excluded from settlement
6. **All-in player never wins above commitment**
   - All-in players capped at their contribution

**Key Assertion**:
```typescript
sum(stacks after) === sum(stacks before) + pot
```

### Implementation Approach

Same style as existing side-pot and showdown tests:
- Deterministic input scenarios
- Clear assertions for monetary correctness
- Edge case coverage for all money boundaries

## UI Next Step (Low Risk)

After Settlement tests complete:
- **CONNECTED** → ActionBar enabled
- **RECONNECTING** → ActionBar disabled + overlay  
- **DISCONNECTED** → Reconnect screen

Pure presentation. No gameplay risk.

## What NOT to Do Yet

- ❌ Client business validation
- ❌ Pending action maps
- ❌ State diff inference
- ❌ Complex optimistic systems

You've already chosen the better path.

## Bottom Line

You now have:
- ✔ Eliminated snapshot races
- ✔ Made actions observable  
- ✔ Clarified connection state

**Next**: Complete the money safety triangle with SettlementService tests.

Ready to implement Phase D when you give the word!
