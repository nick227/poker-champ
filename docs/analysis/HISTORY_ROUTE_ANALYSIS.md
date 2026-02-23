# Hand History Route and Page Analysis

## Overview

This document analyzes the `/history` route implementation in the poker-champ application, focusing on the overview values, how `HandHistoryScreen` works, and where it pulls data from.

---

## Route Architecture

### API Endpoints

The backend exposes three endpoints via `HandHistoryRouter` (`src/http/HandHistoryRouter.ts`):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/history/overview` | GET | Aggregate statistics for the authenticated user |
| `/api/history/hands` | GET | Paginated list of hand history |
| `/api/history/hands/:id` | GET | Detailed information for a specific hand |

All endpoints require authentication via `requireAuth` middleware.

---

## Overview Values

The `OverviewTab` component displays six key metrics, all sourced from the `/api/history/overview` endpoint:

### 1. Total Hands
- **Display**: `totalHands`
- **Source**: Count of all hands where `endedAt` is not null and the user was a participant
- **Calculation**: `hands.length` from Prisma query

### 2. Net Profit/Loss
- **Display**: `totalProfitCents`
- **Source**: Sum of (endingStackCents - startingStackCents) for all hands
- **Formula**: `endingStack - startingStackCents` per hand, accumulated
- **Display Format**: Converted to dollars (`cents / 100`)

### 3. Win Rate
- **Display**: `winRate`
- **Source**: Percentage of hands where net result > 0
- **Formula**: `(winningHands / totalHands) * 100`
- **Display Format**: Percentage with 1 decimal place

### 4. Average Pot
- **Display**: `avgPotCents`
- **Source**: Sum of all payouts divided by total hands
- **Formula**: `totalPotCents / totalHands`
- **Display Format**: Converted to dollars

### 5. Biggest Pot
- **Display**: `biggestPotCents`
- **Source**: Maximum pot size across all hands
- **Calculation**: Tracks maximum during iteration, initialized to 0
- **Display Format**: Converted to dollars

### 6. Winning Hands (Internal)
- **Display**: Not shown directly in UI
- **Source**: Count of hands where net result > 0
- **Used for**: Win rate calculation

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        HandHistoryScreen                        │
│                    (apps/client/app/history.tsx)                │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    historyService.getOverview()                │
│              (apps/client/src/services/history.service.ts)      │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      GET /api/history/overview                  │
│                  (src/http/HandHistoryRouter.ts)                │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Prisma Query                            │
│                    (src/db/prisma.js)                           │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Hand & HandPlayer Tables                   │
│                    (PostgreSQL Database)                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## HandHistoryScreen Component Analysis

### Component Structure

```
HandHistoryScreen (default export)
├── HistoryTabNavigation (inline)
│   └── Two tabs: Overview / Hands
├── OverviewTab (inline)
│   └── Displays HistoryOverview metrics
├── HandList (imported)
│   └── Displays paginated hand list
└── HandDetailModal (imported)
    └── Shows detailed hand information
```

### State Management

The component uses three sources of state:

1. **Local React State**:
   - `activeTab`: "overview" | "hands"
   - `selectedHandId`: string | null
   - `overview`: HistoryOverview | null

2. **Zustand Store** (via `storeRegistry.history()`):
   - `hands`: Array of hand list items
   - `isLoading`: boolean
   - `error`: string | null
   - `cursor`: string | null (pagination)
   - `hasMore`: boolean
   - `selectedHand`: HandHistoryDetail | null

3. **External Hooks**:
   - `useProfile()`: User profile data
   - `useAuthStore()`: Authentication token

### Data Loading

**On Mount** (when token exists):
1. `loadOverview()` - Fetches overview statistics
2. `loadHands()` - Fetches first page of hands (limit: 50)

**On Load More**:
- Calls `loadHands(cursor)` with pagination cursor
- Appends new hands to existing list

**On Hand Press**:
- Calls `loadHandDetail(handId)` 
- Opens `HandDetailModal` with selected hand

---

## Security Considerations

### Backend Security (HandHistoryRouter.ts)

The router implements a critical security guardrail on all endpoints:

```typescript
// Only return hands where the user was a participant
players: {
  some: {
    playerId: userId,
  },
}
```

This ensures users can only view their own hand history.

### Hole Card Privacy

In the hand detail endpoint, opponent hole cards are only revealed:
- At showdown (`hand.reason === "SHOWDOWN"`)
- Or when `ENABLE_LEARNING_REVEAL` environment variable is true

---

## Key Files

| File | Purpose |
|------|---------|
| `apps/client/app/history.tsx` | Main screen component |
| `apps/client/src/services/history.service.ts` | API client service |
| `src/http/HandHistoryRouter.ts` | Backend API router |
| `packages/sdk/src/types.gen.ts` | TypeScript type definitions |

---

## Summary

The `/history` route provides a complete hand history experience:

- **Overview tab** shows aggregate statistics calculated server-side from the user's hand history
- **Hands tab** provides paginated access to individual hand records
- All data is filtered to only show hands where the authenticated user participated
- The implementation follows a clean separation between UI (React), API client, and backend logic
