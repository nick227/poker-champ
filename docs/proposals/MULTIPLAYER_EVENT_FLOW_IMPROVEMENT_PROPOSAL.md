# Multiplayer Event Flow Improvement Proposal

## Current State Analysis

### Architecture Overview
The multiplayer event flow follows this sequence:
```
WebSocket → useRealtimeChannel → useTableRealtime → realtime-channel.registry → storeRegistry.table → TableLayout → ActionBar
```

### Key Components
- **useTableRealtime**: Manages table-specific WebSocket connections and message routing
- **useRealtimeChannel**: Handles low-level WebSocket transport and connection management
- **realtime-channel.registry**: Message dispatch and validation layer
- **storeRegistry.table**: Zustand store for table state management
- **TableLayout**: Main UI component consuming table state
- **ActionBar**: User action input component

## Identified Issues

### 1. Race Conditions in State Updates
**Location**: `apps/client/src/stores/table.store.ts`

**Problem**: 
- Snapshot updates are immutable but don't handle concurrent updates properly
- Multiple rapid snapshots could overwrite each other without proper sequencing
- The `actionId` field exists in the contract but isn't used for ordering updates

**Impact**: UI state can become inconsistent with server reality during rapid gameplay.

### 2. Action Validation Gap
**Location**: `apps/client/src/components/domain/table/ActionBar.tsx`

**Problem**:
- Client actions are sent without correlation tracking
- Server responds with `actionId` in snapshots but client doesn't verify response matches sent action
- Bet amount clamping (line 88) happens client-side but no validation of server acceptance

**Impact**: Actions may appear successful but actually fail silently, causing state desync.

### 3. Error Handling Inconsistency
**Location**: `apps/client/src/realtime/useTableRealtime.ts`

**Problem**:
- Two separate error paths: transport-level (line 63) and message-level (line 56)
- Both call `storeRegistry.table().setError()` but could overwrite each other
- No error recovery mechanism or retry logic

**Impact**: Users see unclear error messages and connection issues may not resolve properly.

### 4. Connection State Management
**Location**: `apps/client/src/realtime/useRealtimeChannel.ts`

**Problem**:
- Immediate disconnection on auth issues (line 44) without graceful degradation
- No cached state preservation during reconnection
- Status updates in registry but UI might show inconsistent states

**Impact**: Poor user experience during network instability or auth refresh.

### 5. Message Validation Weakness
**Location**: `apps/client/src/registry/realtime-channel.registry.ts`

**Problem**:
- Message structure validation (line 99) but no business logic consistency checks
- Missing validation for snapshot sequence integrity
- No verification that state transitions are valid

**Impact**: Invalid or out-of-order messages could corrupt client state.

## Proposed Improvements

### Phase 1: Action Correlation Tracking (High Priority)

**Objective**: Ensure client actions are properly correlated with server responses.

**Changes**:
1. **Enhance Action Payload**
   ```typescript
   // Add to ActionBarOnAction
   export type ActionBarOnAction = (payload: { 
     type: TableAction; 
     amount?: number;
     clientActionId: string; // Add correlation ID
   }) => void;
   ```

2. **Track Pending Actions**
   ```typescript
   // Add to table.store.ts
   pendingActions: Record<string, {
     type: TableAction;
     timestamp: number;
     timeout?: NodeJS.Timeout;
   }>;
   ```

3. **Validate Action Responses**
   ```typescript
   // In setSnapshot, verify actionId matches pending action
   if (snapshot.actionId && pendingActions[snapshot.actionId]) {
     // Clear pending action on successful response
   }
   ```

### Phase 2: Snapshot Sequence Validation (High Priority)

**Objective**: Ensure state updates are applied in correct order.

**Changes**:
1. **Add Sequence Tracking**
   ```typescript
   // In table.store.ts
   lastSequenceByTable: Record<string, number>;
   ```

2. **Validate Snapshot Order**
   ```typescript
   // Reject out-of-order snapshots
   if (snapshot.seq <= lastSequence) {
     console.warn('Ignoring outdated snapshot');
     return;
   }
   ```

### Phase 3: Enhanced Error Handling (Medium Priority)

**Objective**: Separate transport errors from business logic errors and add recovery.

**Changes**:
1. **Separate Error Types**
   ```typescript
   // In table.store.ts
   transportError?: string;
   businessError?: string;
   ```

2. **Add Error Recovery**
   ```typescript
   // Auto-retry for transport errors
   // Clear state on business errors
   ```

### Phase 4: Connection Resilience (Medium Priority)

**Objective**: Improve user experience during connection issues.

**Changes**:
1. **State Caching**
   ```typescript
   // Preserve last known good state
   cachedSnapshot?: TableSnapshotPayload;
   ```

2. **Graceful Degradation**
   ```typescript
   // Show cached state with "Reconnecting..." indicator
   // Allow limited actions during reconnection
   ```

### Phase 5: Message Validation Enhancement (Low Priority)

**Objective**: Add business logic validation to prevent state corruption.

**Changes**:
1. **State Transition Validation**
   ```typescript
   // Validate street transitions, pot changes, etc.
   function validateSnapshotTransition(prev: TableSnapshot, next: TableSnapshot): boolean;
   ```

## Implementation Plan

### Week 1: Phase 1 - Action Correlation
- [ ] Update ActionBar to generate and track clientActionId
- [ ] Modify table.store.ts to track pending actions
- [ ] Add action response validation
- [ ] Add timeout handling for pending actions

### Week 2: Phase 2 - Sequence Validation
- [ ] Add sequence tracking to table store
- [ ] Implement snapshot ordering validation
- [ ] Add logging for sequence violations
- [ ] Handle sequence gap recovery

### Week 3: Phase 3 - Error Handling
- [ ] Separate transport and business error types
- [ ] Implement error-specific recovery strategies
- [ ] Add user-friendly error messages
- [ ] Add error reporting for debugging

### Week 4: Phase 4 - Connection Resilience
- [ ] Implement state caching
- [ ] Add reconnection UI indicators
- [ ] Implement graceful degradation modes
- [ ] Test network instability scenarios

### Week 5: Phase 5 - Validation & Testing
- [ ] Add business logic validation
- [ ] Implement comprehensive test suite
- [ ] Performance testing under load
- [ ] Documentation updates

## Success Metrics

1. **Reduced State Desync**: 90% reduction in UI/server state mismatches
2. **Improved Error Recovery**: 95% successful recovery from transient network issues
3. **Better User Experience**: Eliminate confusing error messages during gameplay
4. **Enhanced Debugging**: Clear logs for troubleshooting multiplayer issues

## Risk Assessment

**Low Risk**: Phase 1-2 (Action correlation and sequencing)
**Medium Risk**: Phase 3-4 (Error handling and connection resilience)
**High Risk**: Phase 5 (Business logic validation)

Each phase includes rollback strategies and can be deployed independently.

## Conclusion

The current multiplayer event flow has several areas where state consistency and error handling could be significantly improved. The proposed phased approach addresses the most critical issues first while maintaining system stability throughout the implementation process.

The action correlation tracking (Phase 1) should provide immediate benefits with minimal risk, making it an ideal starting point for these improvements.
