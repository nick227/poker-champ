# Smart Active Table Notifications Proposal

## Overview
Enhance the ActiveTableView's waiting messages to provide more specific, context-aware feedback and add variety to reduce repetitive messaging.

## Current State Analysis

The current logic (lines 160-170) shows a generic message:
```tsx
} else if (
  waitingBetweenHands ||
  !hasActionOptions ||
  !actionContext.showActions ||
  isPendingHeroAction
) {
  bottom = (
    <View className="ui-p-inline-4">
      <Text className="text-center">Waiting for next hand…</Text>
    </View>
  );
}
```

This single message covers **four distinct conditions**:
1. `waitingBetweenHands` - Between hands, no active hand
2. `!hasActionOptions` - Hand active but no action options available
3. `!actionContext.showActions` - Actions not ready to display
4. `isPendingHeroAction` - Hero action submitted, waiting for server response

## Proposed Enhancement

### 1. Context-Specific Messages

#### Between Hands
- **Condition**: `waitingBetweenHands` only
- **Messages**: 
  - "Next hand starting soon…"
  - "Shuffling up for the next hand…"
  - "Ante up! Next hand dealing…"
  - "Taking a quick breather between hands…"

#### Waiting for Other Players
- **Condition**: Hand active but `!hasActionOptions` (not hero's turn)
- **Messages**:
  - "Waiting for other players to act…"
  - "Thinking time for the opposition…"
  - "The table is deciding their moves…"
  - "Patience is a virtue in poker…"

#### Processing Action
- **Condition**: `isPendingHeroAction` (hero just acted)
- **Messages**:
  - "Processing your action…"
  - "Your move is being registered…"
  - "Good call! Let's see what happens…"
  - "Action received, updating the table…"

#### System Processing
- **Condition**: `!actionContext.showActions` (UI not ready)
- **Messages**:
  - "Updating the table state…"
  - "Synchronizing with the server…"
  - "Just a moment, getting everything ready…"
  - "Almost there, finalizing the details…"

### 2. Implementation Strategy

#### New Hook: `useActiveTableNotification`
```typescript
interface ActiveTableNotification {
  message: string;
  variant?: 'default' | 'processing' | 'waiting';
}

function useActiveTableNotification(
  waitingBetweenHands: boolean,
  hasActionOptions: boolean,
  actionContextShowActions: boolean,
  isPendingHeroAction: boolean,
  opponents?: Opponent[]
): ActiveTableNotification
```

#### Message Pool with Randomness
```typescript
const MESSAGE_POOLS = {
  betweenHands: [
    "Next hand starting soon…",
    "Shuffling up for the next hand…",
    "Ante up! Next hand dealing…",
    "Taking a quick breather between hands…"
  ],
  waitingForOthers: [
    "Waiting for other players to act…",
    "Thinking time for the opposition…",
    "The table is deciding their moves…",
    "Patience is a virtue in poker…"
  ],
  processingAction: [
    "Processing your action…",
    "Your move is being registered…",
    "Good call! Let's see what happens…",
    "Action received, updating the table…"
  ],
  systemProcessing: [
    "Updating the table state…",
    "Synchronizing with the server…",
    "Just a moment, getting everything ready…",
    "Almost there, finalizing the details…"
  ]
};

function getRandomMessage(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}
```

#### Priority Logic
```typescript
function getActiveTableNotification(
  waitingBetweenHands: boolean,
  hasActionOptions: boolean,
  actionContextShowActions: boolean,
  isPendingHeroAction: boolean
): ActiveTableNotification {
  // Priority 1: Hero just acted (most specific)
  if (isPendingHeroAction) {
    return {
      message: getRandomMessage(MESSAGE_POOLS.processingAction),
      variant: 'processing'
    };
  }
  
  // Priority 2: Between hands (no hand active)
  if (waitingBetweenHands) {
    return {
      message: getRandomMessage(MESSAGE_POOLS.betweenHands),
      variant: 'default'
    };
  }
  
  // Priority 3: System not ready
  if (!actionContextShowActions) {
    return {
      message: getRandomMessage(MESSAGE_POOLS.systemProcessing),
      variant: 'processing'
    };
  }
  
  // Priority 4: Waiting for others (hand active, not hero's turn)
  if (!hasActionOptions) {
    return {
      message: getRandomMessage(MESSAGE_POOLS.waitingForOthers),
      variant: 'waiting'
    };
  }
  
  // Fallback (shouldn't reach here in normal flow)
  return {
    message: "Getting ready…",
    variant: 'default'
  };
}
```

### 3. Enhanced Context Awareness

#### Smart Waiting Messages
Add context about who we're waiting for:
```typescript
function getWaitingMessage(opponents: Opponent[], activePlayerSeat?: number): string {
  const activePlayer = opponents.find(o => o.isActive);
  
  if (activePlayer) {
    const messages = [
      `Waiting for ${activePlayer.name} to act…`,
      `${activePlayer.name} is thinking…`,
      `The pressure's on ${activePlayer.name}…`,
      `${activePlayer.name} has a big decision…`
    ];
    return getRandomMessage(messages);
  }
  
  return getRandomMessage(MESSAGE_POOLS.waitingForOthers);
}
```

#### Hand Progress Context
```typescript
function getProgressMessage(hand: any): string {
  if (!hand) return getRandomMessage(MESSAGE_POOLS.betweenHands);
  
  const streetMessages = {
    PREFLOP: ["Pre-flop action underway…", "First betting round active…"],
    FLOP: ["The flop is out…", "Post-flop strategy time…"],
    TURN: ["Turn card revealed…", "Fourth street action…"],
    RIVER: ["River is here…", "Final betting round…"],
    SHOWDOWN: ["Time for the showdown…", "Revealing the hands…"]
  };
  
  const pool = streetMessages[hand.street] || MESSAGE_POOLS.waitingForOthers;
  return getRandomMessage(pool);
}
```

### 4. Visual Enhancements

#### Message Variants
```typescript
const messageVariants = {
  default: "text-center text-muted",
  processing: "text-center text-info animate-pulse",
  waiting: "text-center text-warning"
};
```

#### Loading Indicators
```typescript
{notification.variant === 'processing' && (
  <ActivityIndicator size="small" className="mr-2" />
)}
```

### 5. Integration with ActiveTableView

```typescript
// Replace the current waiting logic
const notification = useActiveTableNotification(
  waitingBetweenHands,
  hasActionOptions,
  actionContext.showActions,
  isPendingHeroAction,
  opponents
);

// Update the bottom rendering
} else if (
  waitingBetweenHands ||
  !hasActionOptions ||
  !actionContext.showActions ||
  isPendingHeroAction
) {
  bottom = (
    <View className="ui-p-inline-4 gap-y-2">
      <Text className={messageVariants[notification.variant || 'default']}>
        {notification.message}
      </Text>
      {notification.variant === 'processing' && (
        <ActivityIndicator size="small" className="self-center" />
      )}
    </View>
  );
}
```

## Benefits

1. **Reduced Repetition**: Random messages prevent the UI from feeling stale
2. **Better Context**: Users understand exactly what's happening
3. **Personality**: Adds character to the poker experience
4. **Clarity**: Distinguishes between different waiting states
5. **Professional Polish**: Shows attention to user experience details

## Testing Strategy

- Unit tests for message selection logic
- Visual regression tests for different message variants
- User testing for message clarity and variety
- Performance testing for randomization overhead

## Future Enhancements

- **Personalization**: Learn user preferences for message styles
- **Themed Messages**: Special messages for tournaments, holidays, events
- **Interactive Elements**: Mini-games or tips during long waits
- **Sound Integration**: Audio cues that match message types

This enhancement would significantly improve the user experience by making waiting periods more informative and engaging!
