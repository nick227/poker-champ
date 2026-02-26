# Table Rejoin Behavior Specification

**Date:** February 26, 2026  
**Scope:** Define intended behavior for users leaving and rejoining poker tables  
**Status:** Proposed Specification  

## Problem Statement

Currently, when a user leaves a table (returns to lobby) and then rejoins the same table, the experience is inconsistent:

1. **Game hangs** - User appears stuck in previous state
2. **Bot conflicts** - User rejoins against their own bot, causing bot to be kicked
3. **Stack reset** - User's chip stack is reset instead of preserved
4. **State confusion** - No clear definition of what should happen during rejoin

This indicates we don't have a firmly defined rejoin behavior that balances user experience with multi-tabling requirements.

## Current Implementation Analysis

Based on codebase analysis, the current system has:

### Existing Infrastructure
- **Persistent Seat Sessions**: `TableSeatSession` schema with TTL-based retention
- **Session Replacement**: `SESSION_REPLACED` handling for multiple connections
- **Auto-action**: Disconnected players auto-check/fold when it's their turn
- **Seat Restoration**: Ability to restore previous seat/chips on rejoin

### Current Issues
1. **Race Conditions**: Navigation lifecycle creates overlapping sessions
2. **Bot Management**: Rejoining user can conflict with their own bot
3. **State Synchronization**: Client-side state may not properly reset on rejoin
4. **Multi-tabling Ambiguity**: No clear distinction between single and multi-table scenarios

## Intended Rejoin Behavior

### Core Principles

1. **Predictable Experience**: Users should know exactly what to expect when rejoining
2. **State Preservation**: Preserve meaningful game state when appropriate
3. **Clean Transitions**: Avoid hanging or confusing states
4. **Multi-tabling Ready**: Design should support future multi-tabling

### Rejoin Scenarios & Expected Behavior

#### Scenario 1: Clean Rejoin (Same Session)
**When:** User navigates away and back within 60 seconds, before session timeout

**Expected Behavior:**
- ✅ Preserve seat position
- ✅ Preserve chip stack exactly
- ✅ Maintain sitting out/active status
- ✅ Continue current hand if still in progress
- ✅ No bot replacement occurs

**Technical Flow:**
```
Leave Table → Mark Disconnected → Rejoin Within Window → Restore Session → Continue Playing
```

#### Scenario 2: Session Expired Rejoin
**When:** User returns after session timeout (>60 seconds) or after server restart

**Expected Behavior:**
- ✅ Treat as fresh join
- ✅ Require new buy-in if not already seated
- ✅ Place in first available seat
- ✅ Wait until next hand to play
- ✅ Bots remain unaffected

**Technical Flow:**
```
Leave Table → Session Expires → Rejoin → Fresh Join Process → New Buy-in → Wait for Next Hand
```

#### Scenario 3: Multi-tabling Support (Future)
**When:** User wants to play at multiple tables simultaneously

**Expected Behavior:**
- ✅ Each table maintains independent session
- ✅ User can have active seats at multiple tables
- ✅ Leaving one table doesn't affect others
- ✅ Rejoin logic applies per-table

## Technical Specification

### Server-Side Behavior

#### 1. Session Management
```typescript
// Session states and transitions
enum SessionState {
  ACTIVE = "ACTIVE",           // Connected and playing
  DISCONNECTED = "DISCONNECTED", // Temporarily disconnected
  SITTING_OUT = "SITTING_OUT", // Preserved but not playing
  LEFT = "LEFT",              // Voluntarily left
  ABANDONED = "ABANDONED"     // Timeout/forced removal
}
```

#### 2. Rejoin Decision Tree
```typescript
function handleRejoin(userId: string, tableId: string): RejoinResult {
  const existingSession = findSeatSession(userId, tableId);
  
  if (!existingSession) {
    return { mode: "FRESH_JOIN", requiresBuyIn: true };
  }
  
  if (existingSession.state === "LEFT" || existingSession.state === "ABANDONED") {
    return { mode: "FRESH_JOIN", requiresBuyIn: true };
  }
  
  if (isSessionExpired(existingSession)) {
    cleanupSession(existingSession);
    return { mode: "FRESH_JOIN", requiresBuyIn: true };
  }
  
  if (existingSession.state === "DISCONNECTED" && isWithinReconnectWindow(existingSession)) {
    return { 
      mode: "RESTORE_SESSION", 
      requiresBuyIn: false,
      preserveSeat: true,
      preserveStack: true 
    };
  }
  
  return { mode: "FRESH_JOIN", requiresBuyIn: true };
}
```

#### 3. Bot Conflict Resolution
```typescript
function handleBotConflictOnRejoin(userId: string, tableId: string): BotResolution {
  const userBot = findBotByOwner(userId, tableId);
  
  if (userBot) {
    // User is rejoining, remove their bot to make space
    removeBot(userBot.id);
    return { action: "REMOVE_USER_BOT", botId: userBot.id };
  }
  
  return { action: "NO_CONFLICT" };
}
```

### Client-Side Behavior

#### 1. Navigation State Management
```typescript
// Clean state transitions
const REJOIN_STATES = {
  LEAVING: "LEAVING",           // User initiated leave
  AWAY: "AWAY",                 // User is away from table
  REJOINING: "REJOINING",       // User is attempting to rejoin
  RESTORED: "RESTORED",         // Session successfully restored
  FRESH_JOIN: "FRESH_JOIN"      // Starting fresh session
};
```

#### 2. State Reset on Rejoin
```typescript
function resetTableStateForRejoin(previousState: TableState): TableState {
  return {
    ...previousState,
    // Reset UI state but preserve game state
    uiState: initialUIState,
    // Clear any temporary overlays
    overlays: [],
    // Reset action buttons
    availableActions: [],
    // Keep game state if session is being restored
    gameState: shouldPreserveGameState() ? previousState.gameState : null
  };
}
```

## Implementation Requirements

### Phase 1: Core Rejoin Logic
1. **Session State Machine**: Implement clear session state transitions
2. **Bot Conflict Resolution**: Automatic bot removal when owner rejoins
3. **Client State Reset**: Clean state reset on navigation away/back
4. **Error Handling**: Graceful fallback when rejoin fails

### Phase 2: Multi-tabling Foundation
1. **Per-Table Sessions**: Independent session management per table
2. **Session Registry**: Track user's active sessions across tables
3. **Resource Management**: Handle multiple concurrent connections
4. **UI State Coordination**: Manage multiple table states

### Phase 3: Advanced Features
1. **Quick Rejoin**: Optimized rejoin for rapid navigation
2. **Session Persistence**: Longer TTL for premium users
3. **Rejoin Analytics**: Track rejoin patterns and success rates
4. **A/B Testing**: Test different rejoin behaviors

## Configuration Options

### Environment Variables
```env
# Rejoin behavior
REJOIN_WINDOW_SECONDS=60          # How long to preserve session
MULTI_TABLE_MAX_SESSIONS=4        # Max concurrent tables (future)
BOT_AUTO_REMOVE_ON_REJOIN=true    # Remove user's bot on rejoin
CLEAN_STATE_RESET=true            # Reset UI state on rejoin
```

### Feature Flags
```typescript
const REJOIN_FEATURES = {
  PERSISTENT_SESSIONS: true,       // Enable session persistence
  BOT_CONFLICT_RESOLUTION: true,   // Handle bot conflicts
  CLEAN_STATE_RESET: true,         // Reset UI state on rejoin
  MULTI_TABLE_SUPPORT: false       // Future multi-tabling
};
```

## Testing Requirements

### Unit Tests
- Session state transitions
- Rejoin decision logic
- Bot conflict resolution
- Client state reset

### Integration Tests
- End-to-end rejoin flows
- Multi-tab scenarios
- Session timeout handling
- Bot removal on rejoin

### Manual Testing Checklist
1. **Basic Rejoin**: Leave and return within 60 seconds
2. **Expired Session**: Leave and return after 60+ seconds  
3. **Bot Conflict**: Have bot, leave, rejoin, verify bot removal
4. **State Reset**: Verify UI state is clean on rejoin
5. **Multi-tab**: Open same table in multiple tabs
6. **Navigation Stress**: Rapid navigation between lobby/table

## Success Metrics

### User Experience
- **Rejoin Success Rate**: >95% successful rejoins
- **State Consistency**: 0% hanging or confusing states
- **Bot Conflict Resolution**: 100% automatic bot removal
- **Navigation Speed**: <2 seconds from lobby back to table

### Technical Metrics
- **Session Recovery**: <500ms session restoration time
- **State Reset**: <100ms UI state reset
- **Error Rate**: <1% rejoin failures
- **Memory Usage**: No session leaks

## Rollout Plan

### Phase 1: Core Implementation (Week 1-2)
1. Implement session state machine
2. Add bot conflict resolution
3. Update client state management
4. Add comprehensive testing

### Phase 2: Staged Rollout (Week 3)
1. Enable in staging environment
2. Run automated test suite
3. Conduct manual testing
4. Monitor performance metrics

### Phase 3: Production Release (Week 4)
1. Feature flag controlled rollout
2. Monitor user feedback
3. Collect rejoin analytics
4. Prepare rollback plan

## Backward Compatibility

This specification maintains backward compatibility by:
- Preserving existing session persistence infrastructure
- Using feature flags to control new behavior
- Providing graceful fallbacks for edge cases
- Maintaining current API contracts

## Future Considerations

### Multi-tabling Enhancements
- Session prioritization (active table management)
- Resource allocation per table
- Cross-table state synchronization
- Multi-table tournament support

### Advanced Features
- Rejoin preferences (auto-sit out, preserve position)
- Session analytics and insights
- Premium session features
- Tournament rejoin logic

---

## Appendix: Key Files References

### Server-Side
- `src/engine/Dealer.ts` - Core table state management
- `src/rooms/PokerRoom.ts` - Room and session handling
- `src/engine/dealer/services/PlayerLifecycleService.ts` - Player state management
- `docs/implementation/REJOIN_REFRESH_IMPLEMENTATION_TASKS.md` - Current implementation

### Client-Side  
- `apps/client/app/table/useTablePageController.tsx` - Table page controller
- `apps/client/src/realtime/transport.ts` - Connection management
- `docs/analysis/PLAYER_JOIN_LEAVE_DISCONNECT_DEEP_DIVE.md` - Player lifecycle analysis

### Testing
- `src/tests/table-multiplayer-churn.integration.test.ts` - Multiplayer testing
- `apps/client/src/tests/useRealtimeChannel.guard.test.ts` - Connection testing
