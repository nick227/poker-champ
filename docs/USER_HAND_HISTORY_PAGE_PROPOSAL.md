# User Hand History Page Implementation Proposal

## Overview

This proposal outlines the implementation of a comprehensive User Hand History page that allows players to view their detailed poker hand history, statistics, and performance metrics. The feature will leverage our existing database schema and follow the established architectural patterns in the codebase.

## Database Schema Analysis

Based on our Prisma schema, we have rich data available for hand history:

### Core Tables for Hand History:
- **Hand**: Complete hand records with board, blinds, and timing
- **HandPlayer**: Player participation with starting/ending stacks and hole cards
- **HandAction**: Detailed action sequence (bets, folds, raises, etc.)
- **HandPayout**: Final pot distribution
- **BalanceTransaction**: Financial transactions linked to hands
- **PokerPlayer**: Player metadata and user associations
- **User**: User account information

### Available Data Points:
- Hand timing (createdAt, endedAt)
- Table configuration (blinds, dealer position)
- Player performance (starting/ending stacks, net profit/loss)
- Action sequence (street-by-street betting patterns)
- Showdown results (hole cards, board cards)
- Financial transactions (buy-ins, winnings, fees)

## Page Design & User Experience

### Navigation Structure

Following our existing screen registry pattern, we'll add a new "history" screen and replace the "Tables" bottom tab:

**Current Bottom Tabs:** Lobby, Tables, Settings  
**New Bottom Tabs:** Lobby, History, Settings

*Note: Lobby and Tables tabs are being consolidated into a single Lobby tab, creating space for the History tab.*

```typescript
// Updated ScreenKey type
type ScreenKey = "index" | "login" | "lobby" | "table" | "settings" | "history";

// New screen definition
history: {
  path: "/history",
  authRequired: true,
  title: "Hand History",
  showInBottomBar: true,
  bottomBarLabel: "History",
  componentPath: "app/history.tsx",
}

// Updated table screen (removed from bottom bar)
table: {
  path: "/table/[id]",
  authRequired: true,
  title: "Table",
  showInBottomBar: false, // Changed: no longer in bottom bar
  componentPath: "app/table/[id].tsx",
}
```

### Page Layout & Views

The Hand History page will feature two distinct views accessible via tab navigation:

#### 1. Overview Tab
Aggregate statistics and performance metrics:
- Total hands played
- Net profit/loss
- Win rate percentage
- Average pot size
- Biggest pot won/lost
- Session duration statistics
- Performance trends over time

*Note: Overview statistics will be calculated client-side initially, with potential server-side optimization in future phases.*

#### 2. Hands Tab
Paginated list of individual hand records:
- Hand summary with key details
- Tap to view detailed hand information
- Simple pagination with "Load More" functionality
- Basic filtering capabilities (added in future phases)

#### Hand Detail Integration
Each hand in the Hands tab will link to our upcoming **Hand Replayer** feature:
- Current MVP: Basic modal with text-based action sequence
- Future Phase 2: Dedicated hand replayer with animated playback
- Seamless transition from history list to interactive replay

### Component Hierarchy (Updated)
```
app/history.tsx (HandHistoryScreen)
├── components/domain/history/
│   ├── HistoryTabNavigation.tsx
│   ├── OverviewTab.tsx
│   ├── HandsTab.tsx
│   │   ├── HandList.tsx
│   │   ├── HandListItem.tsx
│   │   └── HandDetailModal.tsx (MVP)
│   └── HandReplayerLink.tsx (Future)
```

## Implementation Tasks

### Phase 1: Backend MVP Development (3-5 days)

#### 1.1 Create Hand History Router
- **File**: `src/http/HandHistoryRouter.ts`
- **Endpoints Only**:
  - `GET /api/history/hands?cursor=&limit=` - Cursor-based paginated hand list
  - `GET /api/history/hands/:id` - Detailed hand data
- **Authentication**: Require user authentication
- **Critical Security**: Only return hands involving the authenticated user

#### 1.2 Database Query Implementation
```sql
-- Core security guardrail
WHERE EXISTS (
  SELECT 1 FROM HandPlayer 
  WHERE HandPlayer.handId = Hand.id 
  AND HandPlayer.userId = currentUserId
)
```

#### 1.3 MVP Response Schema
```typescript
// List item response
interface HandHistoryListItem {
  id: string;
  playedAt: Date;
  tableName: string;
  netResultCents: number;
  bigBlindCents: number;
  potCents: number;
  heroActionSummary?: string; // optional: "Folded preflop", "Won at showdown", "Called river", "Lost all-in on turn"
}

// Detail response
interface HandHistoryDetail {
  id: string;
  boardCards: string[];
  players: Array<{
    userId: string;
    seat: number;
    holeCards?: string[]; 
    // Hero: always included
    // Opponents: showdown-only unless learning-reveal enabled
    finalStack: number;
  }>;
  actions: Array<{
    street: string;
    actorUserId: string;
    action: string;
    amountCents: number;
  }>;
  payouts: Array<{
    userId: string;
    amountCents: number;
  }>;
}
```

#### 1.4 Critical Implementation Rules

**Security & Privacy Rules:**
- **Cursor-based pagination**: `WHERE id < cursor ORDER BY id DESC LIMIT 50`
- **Hole card privacy**: 
  - Hero hole cards are always included
  - Opponent hole cards only when `hand.reason === "SHOWDOWN"`
  - **Feature flag ready**: `ENABLE_LEARNING_REVEAL=false` (default). When enabled for premium/learning mode, opponent hole cards may be returned even when hand did not reach showdown
- **Read-only design**: No mutations or state modifications
- **User isolation**: Never expose other users' private data

**Hand Inclusion Semantics:**
- **Include folded hands**: Any hand where the user has a HandPlayer row is returned, regardless of whether they folded, went all-in, or reached showdown
- **Learning material**: Folded hands are critical for VPIP, aggression, and leak detection statistics
- **Complete participation**: User appears in HandPlayer = hand is included in their history

**MVP Scope Lock:**
- **Explicitly OUT of scope for MVP**:
  - No advanced filters (date ranges, stake levels, table selection)
  - No charts or graphical statistics
  - No server-side aggregate calculations
  - No animated replay functionality
  - No export features (PDF, CSV)
  - No hand sharing capabilities
  - **Visual fidelity**: MVP will not attempt to perfectly reconstruct table visuals or seat-relative positions; detail view is informational, not a replay

**Overview Tab Implementation:**
- **Client-side derivation**: Overview tab derives aggregates from currently loaded hand pages in memory
- **No separate summary endpoint**: Keeps backend smaller and focused for MVP
- **Progressive enhancement**: Server-side optimization can be added in Phase 2+

### Phase 2: Frontend MVP Implementation (4-6 days)

#### 2.1 Screen Registration & Navigation
- Update `screen.registry.ts` to include history screen
- Update table screen to remove from bottom bar (`showInBottomBar: false`)
- Add navigation helper function in `lib/nav.ts`
- Update `BottomBar.tsx` to replace Tables tab with History tab
- Update `ScreenKey` types throughout the codebase

#### 2.2 API Client Development
- Create `src/services/history.service.ts`
- Implement TypeScript interfaces for MVP responses
- Add error handling and loading states
- Implement cursor-based pagination logic

#### 2.3 MVP Component Structure
```
app/history.tsx (HandHistoryScreen)
├── components/domain/history/
│   ├── HistoryTabNavigation.tsx
│   ├── OverviewTab.tsx
│   ├── HandsTab.tsx
│   │   ├── HandList.tsx
│   │   ├── HandListItem.tsx
│   │   └── HandDetailModal.tsx (MVP)
```

#### 2.4 Core Components (MVP)

##### HandHistoryScreen
- Container with tab navigation (Overview/Hands)
- Manages active tab state
- Handles authentication and loading states

##### HistoryTabNavigation
- Simple tab switcher between Overview and Hands
- Follows existing design system patterns
- Visual indication of active tab

##### OverviewTab Component
- **Client-side calculations** from hand data
- Display key metrics: total hands, net profit, win rate
- Simple stat cards with clear typography
- Loading state while calculations process

##### HandsTab Component
- Contains HandList with pagination
- "Load More" button for cursor-based pagination
- Empty state when no hands found
- Basic loading and error states

##### HandListItem Component
```typescript
interface HandListItemProps {
  hand: HandHistoryListItem;
  onPress: (handId: string) => void;
}
```
- Display: time, table, result, pot size
- Tap to open detail modal

##### HandDetailModal Component
- **Current MVP**: Simple modal with basic hand information
  - Board display with card representation
  - Player list showing seats, stacks, hole cards (if showdown)
  - Text-based action sequence by street
  - Final payout distribution
  - Close button for dismiss

- **Future Integration**: Will link to dedicated Hand Replayer
  - "Replay Hand" button for animated playback
  - Seamless navigation to interactive replayer component
  - Timeline scrubbing and street-by-street analysis
  - Pot size visualization and betting patterns

#### 2.5 State Management (Minimal)
- Add basic history store for pagination state
- Cache current page of hands
- Handle modal open/close state

### Phase 3: Testing & Quality Assurance (2-3 days)

#### 3.1 Server Testing Priorities
- **Security**: User only receives their own hands
- **Accuracy**: Payout sums match SettlementService output
- **Integrity**: Action ordering preserved correctly
- **Privacy**: Hole cards only shown at showdown

#### 3.2 Client Testing Priorities
- **Rendering**: List and modal render without crashes
- **Navigation**: Pagination works correctly
- **Error Handling**: Graceful handling of missing fields
- **Performance**: No memory leaks with pagination

#### 3.3 Integration Testing
- End-to-end user flow: list → detail → close
- Authentication requirements enforced
- Data consistency between list and detail views

## Timeline Estimation (MVP Focus)

- **Backend MVP**: 3-5 days
- **Frontend MVP**: 4-6 days  
- **Testing**: 2-3 days

**Total Estimated Duration**: ~2 weeks for solid MVP

## Strategic Importance

Hand history is not a "nice to have" feature. It becomes:

- **Support Tool**: For resolving player disputes
- **Analytics Foundation**: For future performance insights
- **Trust-Building Feature**: Transparency builds player confidence
- **Product Decision**: Strong competitive advantage

## Post-MVP Enhancements (Future Phases)

### Phase 2+ Features
- **Advanced Hand Replayer**: Interactive animated playback with timeline controls
- **Enhanced Overview**: Charts showing profit trends, win rates over time
- **Advanced Filtering**: Date ranges, stake levels, table selection
- **Export Functionality**: PDF, CSV hand history exports
- **Hand Sharing**: Share specific hands with other players
- **Tournament History Integration**: Separate tournament hand tracking
- **Performance Analytics**: Advanced leak detection and playing pattern analysis
- **Overview Optimization**: Server-side aggregate calculations for better performance

### Technical Debt to Address Later
- Infinite scroll implementation
- Advanced filtering UI
- Real-time updates
- Caching strategies for large datasets

## Success Metrics (MVP)

- **Functionality**: Users can view their hand history without errors
- **Performance**: Page loads under 2 seconds, pagination responsive
- **Security**: Zero data leaks between users
- **Usability**: Intuitive navigation from list to detail views
- **Reliability**: Consistent data display across app sessions

## Final MVP Positioning

This MVP delivers a focused, high-value hand history feature:

**Core Functionality:**
- Secure list of user-involved hands (including folded hands)
- Click into any hand for detailed view
- See board, actions, and payouts
- View opponent hole cards only when poker-correct (showdown)
- Hero hole cards always visible for learning

**Strategic Foundation:**
- Architecturally sound and low-risk
- High value for player learning and support
- Extendable into replay and analytics later
- Aligns with learning site direction
- No overbuilding or scope creep

**Implementation Clarity:**
✅ Folded hands included for complete learning material  
✅ Hero cards always shown for self-analysis  
✅ Opponent cards showdown-only (for now)  
✅ Overview derived client-side (no backend complexity)  
✅ MVP scope locked to prevent feature bloat  

Once this foundation is in place, we'll have a serious base for replay tools, coaching features, and premium analytics in future phases.

## Final Architecture Verdict

✅ **Architecture**: Correct and sound  
✅ **Scope**: Tight and focused  
✅ **Learning-first philosophy**: Clear and intentional  
✅ **Monetization-ready**: Feature flag infrastructure in place  
✅ **Engineering risk**: Low with clear implementation path  

This design follows the mature evolution pattern of successful poker platforms:

**History → Detail → Replay → Analysis → Premium Tools**

The feature flag for learning reveal provides a clean monetization switch without future refactoring, while the MVP scope ensures rapid delivery of core value.

## Conclusion

This MVP-focused proposal delivers core hand history functionality quickly while maintaining security and performance standards. The phased approach allows for rapid iteration based on user feedback, with a clear path to advanced features in future releases.

The 2-week timeline provides a solid foundation that immediately adds value as a support tool and analytics foundation, while keeping the implementation manageable and focused on critical user needs.
