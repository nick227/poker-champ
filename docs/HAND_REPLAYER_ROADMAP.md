# Hand Replayer Roadmap

## 🎯 **Goal**
Extend lesson mode architecture to create a hand replayer that leverages existing hand history data and TableLayout components.

## 🏗️ **Architecture Overview**

The hand replayer reuses 100% of lesson mode infrastructure:

```
Lesson Mode:    [LessonSnapshot] → TableLayout
Replay Mode:     [HandSnapshots] → TableLayout
```

Both use the same frozen `TableProvider` contract and headless `TableLayout`.

## 📦 **MVP Implementation (Week 1)**

### **Core Components**

#### 1. Hand Replay Provider
**File**: `src/hooks/useHandReplayProvider.ts`
```typescript
interface UseHandReplayProviderProps {
  handId: string;
  initialStep?: number;
}

export function useHandReplayProvider({ handId, initialStep = 0 }): TableProvider & {
  currentStep: number;
  totalSteps: number;
  nextStep: () => void;
  prevStep: () => void;
  isPlaying: boolean;
  togglePlay: () => void;
}
```

#### 2. Replay Controls Component
**File**: `src/components/replay/ReplayControls.tsx`
```typescript
interface ReplayControlsProps {
  currentStep: number;
  totalSteps: number;
  onPrev: () => void;
  onNext: () => void;
  onPlay: () => void;
  isPlaying: boolean;
}
```

#### 3. Replay Screen
**File**: `app/replay/[handId].tsx`
```typescript
export default function ReplayScreen() {
  const { handId } = useLocalSearchParams<{ handId: string }>();
  const provider = useHandReplayProvider({ handId });
  
  return (
    <Screen>
      <View className="flex-1">
        <TableLayout 
          snapshot={provider.snapshot} 
          onAction={provider.onAction}
          opponents={opponents}
          balanceCents={balanceCents}
          tableStatus="REPLAY"
          connectionStatus="CONNECTED"
        />
        <ReplayControls
          currentStep={provider.currentStep}
          totalSteps={provider.totalSteps}
          onPrev={provider.prevStep}
          onNext={provider.nextStep}
          onPlay={provider.togglePlay}
          isPlaying={provider.isPlaying}
        />
      </View>
    </Screen>
  );
}
```

### **Data Layer**

#### Hand Snapshot Service
**File**: `src/services/handReplayService.ts`
```typescript
export function getHandSnapshots(handId: string): TableSnapshotPayload[] {
  // Extract from existing hand history storage
  // Return chronological snapshots of hand
}
```

## 🚀 **MVP Feature Set**

### **Core Functionality**
- ✅ Load hand from history
- ✅ Navigate through hand steps (prev/next)
- ✅ Play/pause functionality
- ✅ Step counter display
- ✅ Reuse TableLayout without changes

### **User Flow**
1. User opens History tab
2. Finds hand in their history
3. Clicks "Replay Hand" button
4. Opens replay screen with hand loaded
5. Uses controls to navigate through hand
6. Sees exact table state at each moment

## 🔧 **Technical Implementation Steps**

## 🚀 **Data Source Decision: Server-Side Snapshots**

### **Current State**
- ✅ `HandHistoryDetail.actions[]` - Available
- ❌ `HandHistoryDetail.snapshots[]` - Missing
- ✅ Architecture correct - Provider, UI, contracts all perfect

### **Solution: Capture Snapshots in Dealer**
```typescript
// Inside Dealer class - capture after every state mutation
class Dealer {
  private handSnapshots: TableSnapshotPayload[] = [];
  
  private captureSnapshot() {
    const snapshot = this.createSnapshot();
    this.handSnapshots.push(snapshot);
  }
  
  // Capture at key boundaries
  startHand() {
    this.initializeHandState();
    this.captureSnapshot(); // PREFLOP_INITIAL
  }
  
  advanceToFlop() {
    this.dealFlop();
    this.captureSnapshot(); // FLOP_DEALT
  }
  
  resolveHand() {
    this.computeWinners();
    this.captureSnapshot(); // SHOWDOWN
  }
}
```

### **Backend Changes Required**
```sql
-- Add snapshots column to hand history
ALTER TABLE hand_history ADD COLUMN snapshots JSONB;

-- Store as ordered array of TableSnapshotPayload
```

### **API Update**
```typescript
// New HandHistoryDetail interface
export interface HandHistoryDetail {
  id: string;
  snapshots: TableSnapshotPayload[]; // ✅ ADD THIS
  boardCards: string[];
  bigBlindCents: number;
  reason: string | null;
  players: Array<{...}>;
  actions: Array<{...}>; // Keep for analysis
  payouts: Array<{...}>;
}
```

### **Client Implementation (One Line Change)**
```typescript
// Replace getHandSnapshots implementation
export function getHandSnapshots(handId: string): TableSnapshotPayload[] {
  const handDetail = storeRegistry.history().selectedHand;
  return handDetail?.snapshots || [];
}
```

## 🧪 **Validation Steps**

### **Step 1: Verify Current Data**
```typescript
// Expected console output today:
[HAND_REPLAY_VALIDATION] Hand 123 contains: {
  hasSnapshots: false,
  hasActions: true,
  actionsCount: 15,
  snapshotsCount: 0,
  handDetailKeys: ['id', 'boardCards', 'bigBlindCents', 'reason', 'players', 'actions', 'payouts']
}
```

### **Step 2: Verify After Backend Update**
```typescript
// Expected console output after backend change:
[HAND_REPLAY_VALIDATION] Hand 123 contains: {
  hasSnapshots: true,
  hasActions: true,
  actionsCount: 15,
  snapshotsCount: 8, // Preflop → Flop → Turn → River → Showdown
  handDetailKeys: ['id', 'snapshots', 'boardCards', 'bigBlindCents', 'reason', 'players', 'actions', 'payouts']
}
```

## 🔒 **Replay Snapshot Requirements**

Every replay snapshot must ensure:
```typescript
{
  hero: {
    isToAct: false,        // Prevents "Your turn" UI
    actionOptions: {          // Disables all action buttons
      canFold: false,
      canCheck: false,
      canCall: false,
      canBet: false,
      canRaise: false,
      canAllIn: false,
    }
  }
}
```

## 🎯 **Implementation Priority**

### **Phase 1: Backend (Week 1)**
1. Add `snapshots` column to hand history table
2. Capture snapshots in Dealer at state boundaries
3. Update HandHistoryDetail interface
4. Test snapshot persistence

### **Phase 2: Client (Day 1)**
1. Update `getHandSnapshots()` to return `handDetail.snapshots`
2. Remove validation logging (no longer needed)
3. Test with real hand data

### **Phase 3: Validation (Day 2)**
1. Load History tab
2. Click "Replay Hand" 
3. Verify multi-step navigation works
4. Confirm ActionBar is properly disabled

### **Step 3: UI Components (Day 5-6)**
```typescript
// 1. Create ReplayControls.tsx
export function ReplayControls({ currentStep, totalSteps, onPrev, onNext, onPlay, isPlaying }) {
  return (
    <View className="bg-white border border-gray-200 rounded-lg p-4 m-4">
      <View className="flex-row justify-between items-center mb-4">
        <Button title="◀" onPress={onPrev} disabled={currentStep === 0} />
        <Text>Step {currentStep + 1}/{totalSteps}</Text>
        <Button title="▶" onPress={onNext} disabled={currentStep === totalSteps - 1} />
      </View>
      <View className="flex-row justify-center">
        <Button title={isPlaying ? "⏸" : "▶"} onPress={onPlay} />
      </View>
    </View>
  );
}
```

### **Step 4: Screen Integration (Day 7)**
```typescript
// 1. Create app/replay/[handId].tsx
export default function ReplayScreen() {
  const { handId } = useLocalSearchParams<{ handId: string }>();
  const provider = useHandReplayProvider({ handId });
  const { cents: balanceCents } = useBankroll();
  
  const opponents = useMemo(() => 
    provider.snapshot ? mapSeatsToOpponents(provider.snapshot) : [], 
    [provider.snapshot]
  );

  return (
    <Screen>
      <View className="flex-1">
        <TableLayout 
          snapshot={provider.snapshot} 
          onAction={provider.onAction}
          opponents={opponents}
          balanceCents={balanceCents}
          tableStatus="REPLAY"
          connectionStatus="CONNECTED"
        />
        <ReplayControls
          currentStep={provider.currentStep}
          totalSteps={provider.totalSteps}
          onPrev={provider.prevStep}
          onNext={provider.nextStep}
          onPlay={provider.togglePlay}
          isPlaying={provider.isPlaying}
        />
      </View>
    </Screen>
  );
}
```

### **Step 5: History Integration (Day 8-10)**
```typescript
// 1. Update HistoryList.tsx
{handHistory.map(hand => (
  <View key={hand.handId}>
    <HandSummary hand={hand} />
    <Button 
      title="Replay Hand" 
      onPress={() => router.push(`/replay/${hand.handId}`)} 
    />
  </View>
))}
```

## 📋 **Testing Strategy**

### **Unit Tests**
```typescript
test("useHandReplayProvider navigates snapshots", () => {
  const { result } = renderHook(() => useHandReplayProvider({ handId: "test-hand" }));
  
  act(() => result.current.nextStep());
  expect(result.current.currentStep).toBe(1);
});
```

## 🧪 **Minimum Acceptance Checklist**

Before calling MVP done, verify all pass:

- ✅ **Can open `/replay/[handId]`** - Route loads without errors
- ✅ **Table renders without warnings** - TableLayout renders snapshots cleanly
- ✅ **Next/Prev moves street + bets correctly** - Navigation updates table state
- ✅ **Play auto-advances** - Auto-play functionality works
- ✅ **Zero changes in TableLayout/ActionBar** - No UI component modifications

If all pass → green light for production.

## 📅 **Implementation Timeline**

| Week | Tasks | Deliverable |
|-------|---------|-------------|
| 1 | Data service + provider foundation | Hand loading works |
| 2 | UI components + screen integration | Basic replay functional |
| 3 | History tab integration | End-to-end flow complete |

## 🎮 **User Experience Impact**

### **Educational Value**
- Students can review their own hands
- See exact table state at each decision point
- Learn from mistakes by replaying critical moments

### **Technical Benefits**
- Reuses existing lesson mode architecture
- Zero UI duplication
- Maintains frozen provider contract
- One provider = one state owner
- 🔒 Contract enforcement prevents drift
- 🔒 No-op onAction prevents crashes

---

**Result**: A powerful hand replayer built on lesson mode foundation with minimal development effort! 🚀
