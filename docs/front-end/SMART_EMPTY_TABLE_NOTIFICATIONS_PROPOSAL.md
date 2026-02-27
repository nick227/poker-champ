# Smart Empty Table Notifications Proposal

## Overview
Enhance the "Next hand starting soon…" message in `EmptyTableView.tsx` to provide intelligent, context-aware notifications that explain why a game is stopped and suggest appropriate actions.

## Current State
The current implementation shows a generic message:
```tsx
<Text className="text-center poker-notification">Next hand starting soon…</Text>
```

This message appears whenever:
- Hero is seated but no active hand exists
- Hero is not a spectator
- No rebuy option is available

## Proposed Enhancement

### 1. Game State Analysis
Add logic to detect specific game stop conditions:

#### All Bots Busted
- **Condition**: All seated bots have `stackCents === 0` and `status === "OUT"`
- **Message**: "All bots are out of chips. Add a new bot or invite a player to continue."
- **Suggested Actions**: Show buttons for "Add Bot" and "Invite Player"

#### Hero Only Player (No Active Opponents)
- **Condition**: Hero is seated, but no other active players with chips
- **Message**: "You're the only player at the table. Add bots or invite friends to play."
- **Suggested Actions**: Show buttons for "Add Bot" and "Invite Player"

#### Waiting for Players
- **Condition**: Table has empty seats but no busted bots
- **Message**: "Waiting for more players to join the game."
- **Suggested Actions**: Show "Add Bot" button

#### Game Paused/Manual Stop
- **Condition**: Table state indicates manual pause (if available in snapshot)
- **Message**: "Game is paused. Waiting for host to resume."
- **Suggested Actions**: Show "Resume Game" button (if hero is host)

### 2. Implementation Strategy

#### New Hook: `useEmptyTableNotification`
```typescript
interface EmptyTableNotification {
  message: string;
  actions?: Array<{
    title: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary';
  }>;
}

function useEmptyTableNotification(snapshot: TableSnapshotPayload, opponents: Opponent[]): EmptyTableNotification
```

#### Detection Logic
```typescript
function detectGameStopReason(snapshot: TableSnapshotPayload, opponents: Opponent[]): EmptyTableNotification {
  const activeBots = opponents.filter(o => o.isBot && o.stackCents > 0);
  const bustedBots = opponents.filter(o => o.isBot && o.stackCents === 0);
  const activeHumans = opponents.filter(o => !o.isBot && o.stackCents > 0);
  
  // All bots busted scenario
  if (bustedBots.length > 0 && activeBots.length === 0 && activeHumans.length === 0) {
    return {
      message: "All bots are out of chips. Add a new bot or invite a player to continue.",
      actions: [
        { title: "Add Bot", onPress: () => {/* open add bot modal */}, variant: 'primary' },
        { title: "Invite Player", onPress: () => {/* open invite modal */}, variant: 'secondary' }
      ]
    };
  }
  
  // Hero only player
  if (opponents.length === 0 && snapshot.hero.youAreSeated) {
    return {
      message: "You're the only player at the table. Add bots or invite friends to play.",
      actions: [
        { title: "Add Bot", onPress: () => {/* open add bot modal */}, variant: 'primary' },
        { title: "Invite Player", onPress: () => {/* open invite modal */}, variant: 'secondary' }
      ]
    };
  }
  
  // Default fallback
  return {
    message: "Next hand starting soon…"
  };
}
```

#### Updated EmptyTableView Integration
```typescript
// Replace the generic bottom section (lines 82-86)
const notification = useEmptyTableNotification(snapshot, opponents);

bottom = (
  <View className="ui-p-inline-4 gap-y-2">
    <Text className="text-center poker-notification">{notification.message}</Text>
    {notification.actions && (
      <View className="ui-row gap-x-2 justify-center">
        {notification.actions.map((action, index) => (
          <Button
            key={index}
            title={action.title}
            onPress={action.onPress}
            variant={action.variant}
          />
        ))}
      </View>
    )}
  </View>
);
```

### 3. Required Props & Dependencies

#### New Props for EmptyTableView
```typescript
export type EmptyTableViewProps = {
  // ... existing props
  onAddBot?: () => void;
  onInvitePlayer?: () => void;
  onResumeGame?: () => void;
  isHost?: boolean;
};
```

#### Integration Points
- **Add Bot Modal**: Connect to existing bot management system
- **Invite Player**: Connect to multiplayer invitation system  
- **Resume Game**: Connect to table host controls

### 4. Message Prioritization
1. **All Bots Busted** (highest priority)
2. **Hero Only Player**
3. **Waiting for Players**
4. **Game Paused**
5. **Default "Next hand starting soon…"** (fallback)

### 5. Accessibility & UX Considerations
- Screen reader friendly messages
- Clear action hierarchy (primary vs secondary actions)
- Consistent styling with existing `.poker-notification` class
- Smooth transitions when game state changes

### 6. Testing Strategy
- Unit tests for `useEmptyTableNotification` hook
- Integration tests for various game states
- E2E tests for user interaction flows
- Accessibility testing with screen readers

### 7. Future Enhancements
- **Smart Bot Suggestions**: Suggest bot difficulty based on hero's stack
- **Player Matchmaking**: Auto-suggest players from friends list
- **Tournament Mode**: Special messages for tournament waiting periods
- **Analytics**: Track which notifications lead to user actions

## Implementation Benefits
1. **Improved User Experience**: Clear communication about game state
2. **Increased Engagement**: Actionable suggestions reduce friction
3. **Reduced Confusion**: Users understand why games aren't starting
4. **Better Retention**: Clear paths to continue playing

## Technical Impact
- Minimal changes to existing `EmptyTableView` component
- New hook encapsulates all detection logic
- Backward compatible with current prop interface
- No changes required to backend or snapshot structure
