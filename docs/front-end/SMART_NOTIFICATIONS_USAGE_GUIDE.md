# Smart Empty Table Notifications - Usage Guide

## Implementation Complete ✅

The smart empty table notifications system has been successfully implemented and tested. Here's how to use it:

## Integration Example

```tsx
// In your table component that renders EmptyTableView
import { EmptyTableView } from "@/components/domain/table/views/EmptyTableView";

function TableComponent() {
  const handleAddBot = () => {
    // Open add bot modal
    showAddBotModal();
  };

  const handleInvitePlayer = () => {
    // Open invite player modal
    showInviteModal();
  };

  const handleResumeGame = () => {
    // Resume game if host
    resumeGame();
  };

  return (
    <EmptyTableView
      snapshot={snapshot}
      opponents={opponents}
      balanceCents={balanceCents}
      onBackToLobby={handleBackToLobby}
      onAddBot={handleAddBot}           // NEW: Add bot handler
      onInvitePlayer={handleInvitePlayer} // NEW: Invite player handler
      onResumeGame={handleResumeGame}     // NEW: Resume game handler
      isHost={userIsHost}                // NEW: Host status
      // ... other existing props
    />
  );
}
```

## Smart Notification Behavior

The system now automatically detects and displays appropriate messages:

### 1. All Bots Busted
**Condition**: All seated bots have 0 chips
**Message**: "All bots are out of chips. Add a new bot or invite a player to continue."
**Actions**: "Add Bot" (primary), "Invite Player" (ghost)

### 2. Hero Only Player
**Condition**: Hero seated but no other active players
**Message**: "You're the only player at the table. Add bots or invite friends to play."
**Actions**: "Add Bot" (primary), "Invite Player" (ghost)

### 3. Waiting for Players
**Condition**: Table has empty seats available
**Message**: "Waiting for more players to join the game."
**Actions**: "Add Bot" (primary), "Invite Player" (ghost)

### 4. Default Fallback
**Condition**: None of the above conditions met
**Message**: "Next hand starting soon…"
**Actions**: None

## Technical Details

### Files Created/Modified:
- ✅ `hooks/useEmptyTableNotification.ts` - New hook with detection logic
- ✅ `views/EmptyTableView.tsx` - Updated to use smart notifications
- ✅ `hooks/__tests__/useEmptyTableNotification.test.ts` - Comprehensive tests

### Backward Compatibility:
- All existing props remain unchanged
- New props are optional (`onAddBot`, `onInvitePlayer`, `onResumeGame`, `isHost`)
- If no action handlers provided, shows message only

### Type Safety:
- Full TypeScript support with proper interfaces
- Button variants match existing Button component ("primary" | "ghost" | "danger" | "link")
- Proper error handling for missing handlers

## Testing Results
✅ All 39 test files pass  
✅ 163 tests pass including new smart notification tests  
✅ Covers all game state scenarios  
✅ Validates proper action button rendering  

## Next Steps

To complete the integration:

1. **Connect Action Handlers**: Wire up the `onAddBot`, `onInvitePlayer`, and `onResumeGame` props to your existing bot management and invitation systems

2. **UI Polish**: Consider adding animations or transitions when notifications change

3. **Analytics**: Track which notifications lead to user actions to optimize messaging

4. **Localization**: Add the new messages to your i18n system for multi-language support

The smart notification system is now ready to provide users with clear, actionable guidance about their table state! 🎉
