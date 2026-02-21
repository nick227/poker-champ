# Game Delete Button Analysis

## Overview

This document analyzes the current implementation of game delete buttons in the poker lobby, identifies issues with the existing logic, and proposes a more robust solution.

## Current Implementation Analysis

### Location
The delete button logic is implemented in `GameTableRow.tsx` at lines 19-23:

```typescript
const canDelete =
  onDelete &&
  currentUserId &&
  table.creatorId === currentUserId &&
  humanCount === 0;
```

### Data Flow
1. **Lobby Screen** (`lobby.tsx`) fetches table data and passes it to `GameTableRow`
2. **Table Normalization** (`lobbyTables.ts`) converts raw API data to `LobbyTableRow` format
3. **Delete Logic** (`GameTableRow.tsx`) determines button visibility based on normalized data

### Current Logic Breakdown

The delete button is shown when **ALL** of these conditions are met:

1. **onDelete function exists** - Ensures delete functionality is available
2. **currentUserId exists** - User must be authenticated
3. **User is table creator** - `table.creatorId === currentUserId`
4. **No human players** - `humanCount === 0`

### Data Sources

#### `humanCount` Calculation
```typescript
const humanCount = table.humanCount ?? table.players;
```
- **Primary**: `table.humanCount` from backend metadata
- **Fallback**: `table.players` (total player count)
- **Issue**: Fallback may include bots, leading to incorrect delete button visibility

#### `creatorId` Handling
- Set during table creation via backend
- Passed through normalization process
- May be `undefined` for legacy tables

## Root Cause Analysis

### The Real Problem: Wrong Definition of "Empty Table"

**Issue**: The delete button logic uses `humanCount` which counts seat/session records, not actually connected humans.

**Why This Happens**:
- Persistent seat/session records remain after disconnect for restore window (60s)
- Soft retention keeps seats for 12h
- Auto-sit-out behavior maintains seat state
- Recent reconnect hardening made these features more reliable

**Typical Failure Path**:
1. Creator leaves table
2. Seat session persists for restore window
3. Lobby aggregate shows 0/6 (disconnected players filtered out)
4. Metadata `humanCount` still counts the persisted seat session
5. Delete button hidden despite table being visually empty

### The Conceptual Mistake

Current code uses:
- `"seat exists"` as proxy for `"human is currently present"`

These are not the same thing.

### Correct Definition

Delete should be based on:
- **"Are any humans currently CONNECTED?"**

Not:
- Seats
- Sessions  
- Restorable players
- Offline humans

## The Fix: Use Connected Human Count

### Backend Change

When building lobby table rows, compute `connectedHumanCount` from server runtime state:

```typescript
connectedHumanCount = Object.values(room.clientsByUserId).length
// OR equivalent authoritative map of currently connected clients
```

Return in table API:
```typescript
{
  connectedHumanCount,
  seatsTotal,
  botsCount,
  // ... other fields
}
```

### Frontend Change

Update delete condition in `GameTableRow.tsx`:

```typescript
const canDelete =
  onDelete &&
  currentUserId &&
  table.creatorId === currentUserId &&
  table.connectedHumanCount === 0;
```

**No fallback, no inference, no heuristics.**

### Server-Side Safeguard

Enforce the same rule in delete endpoint:

```typescript
if (connectedHumanCount > 0) {
  throw new Error("TABLE_NOT_EMPTY");
}
```

## Why This Is The Right Solution

1. **Authoritative Source**: Uses actual connection state, not derived guesses
2. **Simple**: One-line fix on both frontend and backend
3. **Reliable**: No race conditions or stale data issues
4. **Secure**: Server enforces the same rule as UI

## Design Principle

UI permissions should rely on authoritative server state, not derived calculations.

## Implementation Priority

### Critical (Fix Now)
1. **Backend**: Add `connectedHumanCount` to lobby table API
2. **Frontend**: Update delete condition to use `connectedHumanCount`
3. **Backend**: Enforce connected human check in delete endpoint

### Optional (Future)
1. **Analytics**: Track delete button usage patterns
2. **Monitoring**: Alert on connection state mismatches

## Testing Strategy

### Unit Tests
```typescript
describe('Delete button with connectedHumanCount', () => {
  test('shows delete when no connected humans', () => {
    const table = { creatorId: 'user1', connectedHumanCount: 0 };
    const result = canDelete(table, 'user1', mockDeleteFn);
    expect(result).toBe(true);
  });
  
  test('hides delete when connected humans present', () => {
    const table = { creatorId: 'user1', connectedHumanCount: 2 };
    const result = canDelete(table, 'user1', mockDeleteFn);
    expect(result).toBe(false);
  });
});
```

### Integration Tests
- Test disconnect/reconnect scenarios
- Verify server-side enforcement
- Test concurrent user scenarios

## Final Diagnosis

✅ **Root Cause**: Using seat/session count instead of connected client count  
✅ **Related to**: Reconnect hardening (longer seat persistence)  
✅ **Fix Location**: Lobby table aggregation code  
❌ **Not**: UI logic problem  
❌ **Not**: Race condition  
❌ **Not**: Fallback issue  

## One-Line Fix Summary

Replace `humanCount` with `connectedHumanCount` sourced from server runtime state.

Once implemented, the delete button will stop behaving erratically.
