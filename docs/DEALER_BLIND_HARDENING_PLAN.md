# Dealer + Blind Rotation Hardening Plan

## Executive Summary

**Priority**: Server-side correctness before UI implementation
**Goal**: Ensure dealer/blind positions are mathematically correct and immutable
**Result**: Dealer button becomes trivial, safe UI rendering

## Phase 1: Lock Down Dealer + Blind Rotation Semantics

### 1.1 HandLifecycleService.startHand() Invariants

**Core Rules to Implement:**

```typescript
// In HandLifecycleService.startHand()
function determineDealerAndBlinds(seats: TableSeat[], previousDealerSeat?: number): {
  dealerSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
} {
  const activeSeats = seats.filter(s => s.status === "ACTIVE");
  
  if (activeSeats.length < 2) {
    throw new Error("Cannot start hand with fewer than 2 active players");
  }
  
  // Heads-up special case
  if (activeSeats.length === 2) {
    const dealerSeat = findNextActiveSeat(seats, previousDealerSeat);
    const bigBlindSeat = findNextActiveSeat(seats, dealerSeat);
    return {
      dealerSeat,
      smallBlindSeat: dealerSeat, // Dealer = small blind in heads-up
      bigBlindSeat
    };
  }
  
  // 3+ players: normal rotation
  const dealerSeat = findNextActiveSeat(seats, previousDealerSeat);
  const smallBlindSeat = findNextActiveSeat(seats, dealerSeat);
  const bigBlindSeat = findNextActiveSeat(seats, smallBlindSeat);
  
  return { dealerSeat, smallBlindSeat, bigBlindSeat };
}

function findNextActiveSeat(seats: TableSeat[], fromSeat?: number): number {
  const activeSeatNumbers = seats
    .filter(s => s.status === "ACTIVE")
    .map(s => s.seat)
    .sort((a, b) => a - b);
  
  if (activeSeatNumbers.length === 0) {
    throw new Error("No active seats found");
  }
  
  if (fromSeat === undefined) {
    return activeSeatNumbers[0]; // First active seat
  }
  
  const currentIndex = activeSeatNumbers.indexOf(fromSeat);
  if (currentIndex === -1) {
    return activeSeatNumbers[0]; // Previous dealer no longer active
  }
  
  const nextIndex = (currentIndex + 1) % activeSeatNumbers.length;
  return activeSeatNumbers[nextIndex];
}
```

### 1.2 Heads-Up Special Case Handling

**Rules:**
- Dealer = Small Blind
- Big Blind = Other player  
- First to act preflop = Dealer (small blind)
- First to act postflop = Small blind (dealer)

**Implementation:**
```typescript
function determineFirstToAct(
  dealerSeat: number,
  smallBlindSeat: number,
  bigBlindSeat: number,
  street: Street,
  activeSeats: TableSeat[]
): number {
  if (street === "PREFLOP") {
    // Heads-up: dealer (small blind) acts first
    if (activeSeats.length === 2) {
      return dealerSeat;
    }
    // 3+ players: first to act after big blind
    return findNextActiveSeat(activeSeats, bigBlindSeat);
  } else {
    // Postflop: first to act after dealer
    return findNextActiveSeat(activeSeats, dealerSeat);
  }
}
```

### 1.3 Invariant Assertions

**Create/Update assertState.ts:**
```typescript
export function assertDealerBlindInvariants(hand: HandState, seats: TableSeat[]): void {
  // Dealer seat exists and is active
  const dealerSeat = seats.find(s => s.seat === hand.dealerSeat);
  invariant(dealerSeat, `Dealer seat ${hand.dealerSeat} not found in seats`);
  invariant(dealerSeat.status === "ACTIVE", `Dealer seat ${hand.dealerSeat} is not active`);
  
  // Small blind seat exists and is active
  const smallBlindSeat = seats.find(s => s.seat === hand.smallBlindSeat);
  invariant(smallBlindSeat, `Small blind seat ${hand.smallBlindSeat} not found in seats`);
  invariant(smallBlindSeat.status === "ACTIVE", `Small blind seat ${hand.smallBlindSeat} is not active`);
  
  // Big blind seat exists and is active
  const bigBlindSeat = seats.find(s => s.seat === hand.bigBlindSeat);
  invariant(bigBlindSeat, `Big blind seat ${hand.bigBlindSeat} not found in seats`);
  invariant(bigBlindSeat.status === "ACTIVE", `Big blind seat ${hand.bigBlindSeat} is not active`);
  
  // All seats are different
  invariant(
    hand.dealerSeat !== hand.smallBlindSeat && 
    hand.dealerSeat !== hand.bigBlindSeat && 
    hand.smallBlindSeat !== hand.bigBlindSeat,
    "Dealer, small blind, and big blind seats must be different"
  );
  
  // Heads-up special case validation
  const activeSeats = seats.filter(s => s.status === "ACTIVE");
  if (activeSeats.length === 2) {
    invariant(
      hand.dealerSeat === hand.smallBlindSeat,
      "Heads-up: dealer must be small blind"
    );
  } else {
    invariant(
      hand.dealerSeat !== hand.smallBlindSeat,
      "3+ players: dealer cannot be small blind"
    );
  }
}
```

## Phase 2: Emit Blind Seats in Snapshot

### 2.1 Update TableSnapshotPayload Schema

**File: packages/realtime-contract/src/table.ts**
```typescript
export const TableSnapshotPayloadSchema = z.object({
  // ... existing fields
  
  hand: z.object({
    handId: z.string(),
    handNumber: z.number().int().nonnegative(),
    street: StreetEnum,
    dealerSeat: z.number().int().min(0),
    smallBlindSeat: z.number().int().min(0),
    bigBlindSeat: z.number().int().min(0),
    toActSeat: z.number().int().min(0),
    actionCount: z.number().int().nonnegative(),
    roundCurrentBetCents: z.number().int().nonnegative(),
    minRaiseCents: z.number().int().nonnegative(),
    potCents: z.number().int().nonnegative(),
    board: z.array(z.string().min(2).max(2)).max(5),
  }).optional(),
  
  // ... rest of schema
});
```

### 2.2 Update SnapshotService

**File: src/engine/dealer/services/SnapshotService.ts**
```typescript
export function createTableSnapshot(
  tableState: TableState,
  handState: HandState | null,
  heroUserId: string
): TableSnapshotPayload {
  // ... existing logic
  
  const handSnapshot = handState ? {
    handId: handState.handId,
    handNumber: handState.handNumber,
    street: handState.street,
    dealerSeat: handState.dealerSeat,
    smallBlindSeat: handState.smallBlindSeat,
    bigBlindSeat: handState.bigBlindSeat,
    toActSeat: handState.toActSeat,
    actionCount: handState.actionCount,
    roundCurrentBetCents: handState.roundCurrentBetCents,
    minRaiseCents: handState.minRaiseCents,
    potCents: handState.potCents,
    board: handState.board,
  } : undefined;
  
  return {
    // ... existing fields
    hand: handSnapshot,
    // ... rest of snapshot
  };
}
```

## Phase 3: Characterization Tests

### 3.1 Heads-Up Rotation Test

**File: src/tests/dealer.rotation.heads-up.test.ts**
```typescript
describe("Heads-Up Dealer Rotation", () => {
  test("dealer rotates correctly across 10 hands", async () => {
    const table = await setupTableWithPlayers(["player1", "player2"]);
    const dealerRotations: number[] = [];
    
    for (let i = 0; i < 10; i++) {
      await startNewHand(table);
      
      const hand = table.getState().hand;
      invariant(hand, "Hand should exist");
      
      dealerRotations.push(hand.dealerSeat);
      
      // Heads-up invariants
      expect(hand.dealerSeat).toBe(hand.smallBlindSeat);
      expect(hand.dealerSeat).not.toBe(hand.bigBlindSeat);
      
      // Dealer should alternate between the two players
      const expectedDealer = i % 2 === 0 ? 0 : 1; // Assuming seats 0 and 1
      expect(hand.dealerSeat).toBe(expectedDealer);
      
      await playOutHand(table);
    }
    
    // Verify alternation pattern
    expect(dealerRotations).toEqual([0, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
  });
});
```

### 3.2 Multi-Player with Join/Leave Test

**File: src/tests/dealer.rotation.multi-player.test.ts**
```typescript
describe("Multi-Player Dealer Rotation", () => {
  test("dealer skips abandoned/empty seats", async () => {
    const table = await setupTableWithPlayers(["p1", "p2", "p3", "p4"]);
    
    // Hand 1: All players active
    await startNewHand(table);
    let hand = table.getState().hand!;
    expect(hand.dealerSeat).toBe(0); // First active seat
    expect(hand.smallBlindSeat).toBe(1);
    expect(hand.bigBlindSeat).toBe(2);
    
    await playOutHand(table);
    
    // Hand 2: Player 1 (seat 0) sits out
    await setPlayerStatus(table, "p1", "ABANDONED");
    await startNewHand(table);
    hand = table.getState().hand!;
    expect(hand.dealerSeat).toBe(1); // Next active after abandoned seat 0
    expect(hand.smallBlindSeat).toBe(2);
    expect(hand.bigBlindSeat).toBe(3);
    
    await playOutHand(table);
    
    // Hand 3: Player 2 (seat 1) leaves, new player joins seat 0
    await removePlayer(table, "p2");
    await addPlayer(table, "p5", 0);
    await startNewHand(table);
    hand = table.getState().hand!;
    expect(hand.dealerSeat).toBe(2); // Continues from seat 2
    expect(hand.smallBlindSeat).toBe(3);
    expect(hand.bigBlindSeat).toBe(0); // New player in seat 0
  });
});
```

### 3.3 Integration Test for Button Correctness

**File: src/tests/dealer.rotation.integration.test.ts**
```typescript
describe("Dealer Button Integration", () => {
  test("dealer button moves correctly between hands", async () => {
    const table = await setupTableWithPlayers(["p1", "p2", "p3"]);
    
    // Track dealer positions across hands
    const dealerPositions: number[] = [];
    
    for (let i = 0; i < 5; i++) {
      await startNewHand(table);
      
      const hand = table.getState().hand!;
      dealerPositions.push(hand.dealerSeat);
      
      // Verify invariants
      assertDealerBlindInvariants(hand, table.getState().seats);
      
      await playOutHand(table);
    }
    
    // Should rotate through active seats (0, 1, 2, 0, 1)
    expect(dealerPositions).toEqual([0, 1, 2, 0, 1]);
  });
});
```

## Phase 4: UI Implementation (After Server Hardening)

### 4.1 Update TableAdapter

```typescript
// table.adapter.ts additions
export function getIsDealer(snapshot: TableSnapshotPayload): boolean {
  if (!snapshot.hero.youAreSeated || !snapshot.hand) return false;
  return snapshot.hero.seat === snapshot.hand.dealerSeat;
}

export function getIsSmallBlind(snapshot: TableSnapshotPayload): boolean {
  if (!snapshot.hero.youAreSeated || !snapshot.hand) return false;
  return snapshot.hero.seat === snapshot.hand.smallBlindSeat;
}

export function getIsBigBlind(snapshot: TableSnapshotPayload): boolean {
  if (!snapshot.hero.youAreSeated || !snapshot.hand) return false;
  return snapshot.hero.seat === snapshot.hand.bigBlindSeat;
}

export function getOpponentsWithBlindInfo(
  snapshot: TableSnapshotPayload
): Opponent[] {
  // Existing opponent mapping logic...
  return opponents.map(opponent => ({
    ...opponent,
    isDealer: opponent.seat === snapshot.hand?.dealerSeat,
    isSmallBlind: opponent.seat === snapshot.hand?.smallBlindSeat,
    isBigBlind: opponent.seat === snapshot.hand?.bigBlindSeat,
  }));
}
```

### 4.2 DealerButton Component (Trivial Implementation)

```typescript
// DealerButton.tsx
export function DealerButton({ size = "small" }: { size?: "small" | "large" }) {
  return (
    <View 
      className={`rounded-full bg-blue-500 ui-center justify-center ${
        size === "small" ? "w-6 h-6" : "w-8 h-8"
      }`}
      accessibilityLabel="Dealer button"
      accessibilityRole="img"
    >
      <Text 
        className={`text-white font-bold ${
          size === "small" ? "text-xs" : "text-sm"
        }`}
      >
        D
      </Text>
    </View>
  );
}
```

## Phase 5: Optional Blind Badges

### 5.1 BlindBadge Component

```typescript
// BlindBadge.tsx
export function BlindBadge({ type }: { type: "SB" | "BB" }) {
  return (
    <View 
      className={`rounded px-1.5 py-0.5 ${
        type === "SB" ? "bg-orange-500" : "bg-red-500"
      }`}
    >
      <Text className="text-white text-xs font-bold">
        {type}
      </Text>
    </View>
  );
}
```

## Implementation Timeline

### Week 1: Server Semantics
- [ ] Implement dealer/blind rotation logic
- [ ] Add invariant assertions
- [ ] Update snapshot schema

### Week 2: Testing & Validation
- [ ] Write characterization tests
- [ ] Add integration tests
- [ ] Validate against existing hand histories

### Week 3: UI Implementation
- [ ] Update table adapters
- [ ] Implement DealerButton component
- [ ] Add blind badges (optional)

### Week 4: Polish & Documentation
- [ ] Add visual regression tests
- [ ] Update API documentation
- [ ] Performance optimization

## Success Criteria

### Server-Side
- [ ] All dealer/blind invariants pass in production
- [ ] No hand history inconsistencies
- [ ] Tests cover edge cases (join/leave, heads-up)

### Client-Side
- [ ] Dealer button always matches server state
- [ ] Zero client-side poker logic
- [ ] Blind badges accurately reflect server state

### User Experience
- [ ] Clear visual indication of dealer position
- [ ] Intuitive blind position understanding
- [ ] Smooth transitions between hands

## Conclusion

This plan ensures dealer/blind correctness at the engine level before any UI work. The dealer button becomes a simple, safe rendering of authoritative server state rather than a fragile visual guess.

The approach maintains your core architectural principle: **UI never infers poker rules, UI only mirrors authoritative state.**
