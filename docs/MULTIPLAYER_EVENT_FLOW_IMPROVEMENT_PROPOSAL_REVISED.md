# Multiplayer Event Flow Improvement - Revised Proposal

## Executive Summary
The original proposal was directionally correct but over-scoped. We can achieve 80% of the benefit with two simple primitives while maintaining the existing authoritative server architecture.

## Core Principle
**Server is authoritative → Snapshots are truth → Client is pure projection**

## Two Primitives You Actually Need

### ✅ 1) Monotonic Server Snapshot Sequence

**Add to Contract:**
```typescript
// TableSnapshotPayloadSchema
snapshotSeq: number; // increments on every emitted snapshot
```

**Client Store Logic:**
```typescript
// In table.store.ts
lastSeqByTable: Record<string, number>;

setSnapshot: (tableId, snapshot) => {
  const lastSeq = lastSeqByTable[tableId] || 0;
  if (snapshot.snapshotSeq <= lastSeq) return; // drop outdated
  lastSeqByTable[tableId] = snapshot.snapshotSeq;
  // apply snapshot...
}
```

**Solves:**
- Out-of-order snapshots
- Race condition overwrites  
- Most "desync" complaints

**No per-table maps, no per-action ordering logic needed.**

### ✅ 2) Server-Auth Action Result Channel (Already Almost There)

**Use existing `actionId?: string` purely for diagnostics, not client-driven handshake.**

**Server Behavior:**
- Client sends action
- Server either:
  - Emits snapshot with `actionId`
  - Emits ERROR with same `actionId`

**Client Behavior:**
```typescript
// In snapshot handler
if (snapshot.actionId) clearOptimisticUI();
if (error.actionId) showInlineError();
```

**Do not block UI on pendingActions maps.**

**Why:** Your server is authoritative and snapshot-driven; building request/response semantics on top of a snapshot stream adds complexity without real safety.

## Where Original Proposal Overreached

### ❌ Pending Actions Map
**Unnecessary** if snapshots are monotonic. Snapshots already represent truth. If an action fails, server emits ERROR → UI reacts.

### ❌ Client Snapshot Business Validation  
**Dangerous long-term.** You already correctly enforce invariants on the server. Duplicating game rules in client risks divergence. Client should be a dumb renderer.

### ❌ Graceful Degradation With Partial Interaction
**Poker should be strict:**
- If not connected → you cannot act
- If reconnecting → read-only
- Anything else invites exploits

## Revised Implementation Plan

### Phase A (Immediate) - Monotonic Snapshots
```typescript
// Add to packages/realtime-contract/src/table.ts
export const TableSnapshotPayloadSchema = z.object({
  // ... existing fields
  snapshotSeq: z.number().int().positive(),
});
```

```typescript
// Update apps/client/src/stores/table.store.ts
type TableStoreState = {
  snapshotsByTableId: Record<string, TableSnapshotPayload | undefined>;
  lastSeqByTableId: Record<string, number>;
  // ... rest
};

export const useTableStore = create<TableStoreState>((set) => ({
  snapshotsByTableId: {},
  lastSeqByTableId: {},
  setSnapshot: (tableId, snapshot) =>
    set((s) => {
      const lastSeq = s.lastSeqByTableId[tableId] || 0;
      if (snapshot.snapshotSeq <= lastSeq) return s; // drop outdated
      
      return {
        snapshotsByTableId: {
          ...s.snapshotsByTableId,
          [tableId]: snapshot,
        },
        lastSeqByTableId: {
          ...s.lastSeqByTableId,
          [tableId]: snapshot.snapshotSeq,
        },
        errorByTableId: {
          ...s.errorByTableId,
          [tableId]: undefined,
        },
      };
    }),
  // ... rest
}));
```

### Phase B - Action ID Diagnostics Only
```typescript
// In ActionBar.tsx - simple optimistic UI clearing
const handleAction = useCallback((action: TableAction) => {
  // Send action
  onAction({ type: action, amount });
  
  // Clear optimistic state when matching snapshot arrives
  // (handled in snapshot handler via actionId match)
}, [onAction]);

// In useTableRealtime.ts snapshot handler
if (type === "TABLE_SNAPSHOT" && payload.actionId) {
  // Clear any optimistic UI state for this actionId
  // This is purely cosmetic, not flow control
}
```

### Phase C - Connection Status UI Rules
```typescript
// Add to table.store.ts
connectionStatusByTableId: Record<string, "CONNECTED" | "RECONNECTING" | "DISCONNECTED">;

// UI Rules:
// CONNECTED → normal interaction
// RECONNECTING → show overlay, disable ActionBar  
// DISCONNECTED → show reconnect screen
```

## Net Result

You get:
- ✅ Deterministic ordering
- ✅ No race conditions  
- ✅ Clean mental model
- ✅ No pending action queues
- ✅ No duplicated rules

**With ~10% of the code originally suggested.**

## Implementation Timeline

**Week 1:** Phase A - Add `snapshotSeq` to contract and store logic
**Week 2:** Phase B - Implement actionId diagnostics only
**Week 3:** Phase C - Add connection status UI rules

## Success Metrics

1. **Zero out-of-order snapshot issues** (verifiable via logs)
2. **Simplified debugging** with actionId correlation
3. **Clean connection state UI** during network issues
4. **Reduced client-side complexity** by 90%

## Final Verdict

**Accept concept, reject implementation shape.**

Keep your architecture:
- Server is authoritative
- Snapshots are truth  
- Client is pure projection

**At most: make snapshots monotonic and errors correlated, if there's real benefit for this MVP.**
