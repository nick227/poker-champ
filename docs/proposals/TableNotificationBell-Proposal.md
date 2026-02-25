# TableNotificationBell Integration Proposal

## Current State Analysis

### TableNotificationBell Component
- **Location**: `apps/client/src/components/domain/table/TableNotificationBell.tsx`
- **Purpose**: Displays notification count for active poker tables
- **Current Behavior**: Only renders when `count > 0` (returns `null` otherwise)
- **Usage**: Used in `lobby.tsx` and `slots.tsx` screens

### ProfileStrip Component
- **Location**: `apps/client/src/components/domain/lobby/ProfileStrip.tsx`
- **Purpose**: Displays user profile info with chat, voice, and online status controls
- **Current Layout**: Avatar + username/location (left), controls (right)

## Problem Statement

The current `TableNotificationBell` implementation causes UI layout shifting:
- Bell appears/disappears based on notification count
- Inconsistent positioning across screens (separate from ProfileStrip)
- Redundant import/usage in multiple screens

## Proposed Solution

### 1. Integrate Bell into ProfileStrip
- Move bell as first item in right-side controls
- Always render bell (even with 0 count) to prevent shifting
- Add bell props to ProfileStrip interface

### 2. Updated ProfileStrip Interface
```typescript
{
  // ... existing props
  tableNotificationCount?: number;
  onTableNotifications?: () => void;
}
```

### 3. Implementation Changes
- Modify `TableNotificationBell` to always render
- Remove bell imports from `lobby.tsx` and `slots.tsx`
- Update ProfileStrip to include bell as first control

### 4. Benefits
- Consistent UI positioning
- No layout shifting
- Reduced code duplication
- Centralized notification handling

## Implementation Steps

1. Update `TableNotificationBell` to always render
2. Add bell props to `ProfileStrip` interface
3. Integrate bell into ProfileStrip layout
4. Update `lobby.tsx` and `slots.tsx` to pass props
5. Remove redundant bell imports

## Files to Modify

- `TableNotificationBell.tsx` - Always render component
- `ProfileStrip.tsx` - Add bell integration
- `lobby.tsx` - Update ProfileStrip usage
- `slots.tsx` - Update ProfileStrip usage
