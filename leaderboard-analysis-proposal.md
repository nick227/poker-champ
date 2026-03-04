# Leaderboard Analysis & Avatar Enhancement Proposal

## Current Implementation Analysis

### Basic Contracts & Types

**LeaderboardEntry Interface:**
```typescript
export type LeaderboardEntry = {
  rank: number;
  userId: string;
  displayName: string;
  value: string;
  valueNumerator: number;
  valueDenominator: number | null;
  handCount: number;
};
```

**API Response Structure:**
```typescript
export type LeaderboardResponse = {
  period: LeaderboardPeriod;
  category: LeaderboardCategory;
  computedAt: string | null;
  totalEntries: number;
  entries: LeaderboardEntry[];
};
```

### API Integration

**Service Method:**
- `leaderboardService.getLeaderboard()` - Fetches leaderboard data
- **Endpoint:** `GET /api/leaderboard`
- **Parameters:** token, period (weekly), category, limit (20)
- **Categories:** biggest_winner, showdown_sniper, all_in_maniac, heater

### Current UI Implementation

**Row Structure (lines 186-199):**
- Rank number (left)
- Display name and hand count (center)
- Value/metric (right)
- Surface container with row layout

**Missing Elements:**
- User avatars
- Mobile-optimized spacing
- Visual hierarchy improvements

---

## Avatar Enhancement Proposal

### 1. Backend API Changes

**Updated LeaderboardEntry Type:**
```typescript
export type LeaderboardEntry = {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl?: string; // NEW: Optional avatar URL
  value: string;
  valueNumerator: number;
  valueDenominator: number | null;
  handCount: number;
};
```

**API Implementation Requirements:**
- Backend should join with user profiles to fetch `avatarUrl`
- Fallback to default avatar if none exists
- Cache avatar URLs to reduce database load

### 2. Frontend Component Updates

**New Avatar Component:**
```typescript
// src/components/base/Avatar.tsx
interface AvatarProps {
  url?: string;
  username: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}
```

**Updated Row Structure:**
```typescript
<Surface key={`${entry.rank}-${entry.userId}`} styleId="surface.list.row">
  <View className="ui-row items-center justify-between">
    <View className="ui-row items-center gap-3">
      <Text variant="h2" className="text-base">{entry.rank}</Text>
      <Avatar 
        url={entry.avatarUrl} 
        username={entry.displayName}
        size="sm"
      />
      <View>
        <Text variant="body">{entry.displayName}</Text>
        <Text variant="muted">{entry.handCount} hands</Text>
      </View>
    </View>
    <Text variant="body">{entry.value}</Text>
  </View>
</Surface>
```

---

## Native Mobile Design Proposal

### Design Principles

1. **Thumb-Friendly Touch Targets** - Minimum 44px touch areas
2. **Visual Hierarchy** - Clear ranking progression
3. **Performance** - Smooth scrolling with lazy loading
4. **Contextual Information** - Quick scanning of key metrics

### Enhanced Mobile Layout

#### Row Container Geometry

**Container Specifications:**
- **Row Height:** 56px (native list sweet spot)
- **Horizontal Padding:** 16px
- **Vertical Padding:** 10-12px

**4-Column Grid Layout:**
```
| rank | avatar | name/hands | amount |
```

**Fixed Width Strategy:**
- **Rank:** 32px fixed
- **Avatar:** 32px fixed  
- **Name/Hands:** Flexible center
- **Amount:** 88px fixed

**Final Geometry:**
```
|16|32|8|32|12| FLEX TEXT |16| 88 |16|
```

**Why This Works:**
- Stable edges (rank + amount) for fast visual scanning
- Flexible center accommodates varying name lengths
- No layout jumping between entries
- Native list density that feels familiar
- Right edge forms clean visual column for amounts

#### Row Design Implementation

**Optimized Row Structure:**
```typescript
// Clean row with proper geometry
<View className="flex-row items-center h-14 px-4">
  {/* Rank - Right aligned */}
  <Text className="w-8 text-right text-sm text-muted pr-1">
    {entry.rank}
  </Text>

  {/* Avatar - 32px */}
  <Avatar
    url={entry.avatarUrl}
    username={entry.displayName}
    size="sm"
  />

  {/* Name block - Flexible center */}
  <View className="flex-1 ml-3">
    <Text className="text-base font-medium" numberOfLines={1}>
      {entry.displayName}
    </Text>
    <Text className="text-xs text-muted">
      {entry.handCount} hands
    </Text>
  </View>

  {/* Amount - Fixed width, right aligned */}
  <Text className="min-w-[88px] text-right text-base font-semibold">
    {entry.value}
  </Text>
</View>
```

**With Divider:**
```typescript
// Row container with separator
<View className="border-b border-border/30">
  <View className="flex-row items-center h-14 px-4">
    {/* Row content as above */}
  </View>
</View>
```

**Optional Rank Tint (Top 3):**
```typescript
// Add subtle background to rank cell for top 3
<View className={`
  w-8 text-right pr-1
  ${entry.rank === 1 ? 'bg-yellow-500/10' : ''}
  ${entry.rank === 2 ? 'bg-gray-400/10' : ''}
  ${entry.rank === 3 ? 'bg-orange-600/10' : ''}
`}>
  <Text className="text-sm text-muted">
    {entry.rank}
  </Text>
</View>
```

#### Final Clean Geometry
```
|16| rank(32) |12| avatar(32) |12| text(flex) |12| amount(88) |16|
```

**Row Height:** 56px (h-14)

**Key Improvements:**
- Consistent `h-14` instead of mixed py + fixed height
- Right-aligned rank for clean digit alignment
- Tight 2-line text stack (text-base + text-xs)
- `min-w-[88px]` prevents number clipping
- Row separators for visual completion
- Optional rank tint without layout changes

#### Edge Alignment Strategy

**Left Edge - Identity Anchor:**
- Rank number provides positional context
- Avatar creates visual recognition
- Name establishes user identity

**Right Edge - Metadata Anchor:**
- Amount values align perfectly
- Forms clean vertical column
- Easy comparison between entries

**Visual Example:**
```
1   ○  nick rios            +$1,842
2   ○  acecrusher           +$1,230
3   ○  riverking            +$1,104
4   ○  pokerface2023        +$987
5   ○  allinpro             +$856
```

#### Category Selector Enhancement

**Mobile-Optimized Tabs:**
- Horizontal scrollable tabs
- Active state with underline indicator
- Better touch targets (48px height)
- Smooth transitions between categories

```typescript
// Enhanced category selector
<ScrollView horizontal showsHorizontalScrollIndicator={false}>
  <View className="flex-row gap-2 px-4">
    {CATEGORY_OPTIONS.map((option) => (
      <TouchableOpacity
        key={option.key}
        onPress={() => setCategory(option.key)}
        className={`px-4 py-3 rounded-lg ${
          active ? 'bg-blue-500' : 'bg-gray-100'
        }`}
      >
        <Text className={`font-medium ${
          active ? 'text-white' : 'text-gray-700'
        }`}>{option.label}</Text>
      </TouchableOpacity>
    ))}
  </View>
</ScrollView>
```

### Performance Optimizations

1. **Avatar Caching:**
   - Local storage cache for avatar URLs
   - Image preloading for top 10 entries
   - Lazy loading for off-screen avatars

2. **List Virtualization:**
   - Implement `FlatList` for better performance
   - 50-item buffer for smooth scrolling
   - Maintained scroll position during refresh

3. **Skeleton Loading:**
   - Enhanced skeleton with avatar placeholders
   - Staggered animation for natural feel
   - Progressive content reveal

### Accessibility Improvements

1. **Screen Reader Support:**
   - Proper accessibility labels
   - Announce rank changes
   - Semantic HTML structure

2. **Visual Accessibility:**
   - High contrast mode support
   - Scalable fonts
   - Color-blind friendly rank indicators

---

## Implementation Roadmap

### Phase 1: Backend Integration
- [ ] Add `avatarUrl` to LeaderboardEntry
- [ ] Update API endpoint to fetch avatar data
- [ ] Implement avatar caching strategy

### Phase 2: Avatar Component
- [ ] Create reusable Avatar component
- [ ] Implement fallback avatar system
- [ ] Add image loading states

### Phase 3: Mobile UI Enhancement
- [ ] Redesign leaderboard rows with avatars
- [ ] Implement rank badges for top 3
- [ ] Enhance category selector
- [ ] Add micro-interactions and animations

### Phase 4: Performance & Polish
- [ ] Implement list virtualization
- [ ] Add avatar caching
- [ ] Optimize loading states
- [ ] Accessibility testing

---

## Expected Benefits

1. **User Engagement:** Visual recognition increases social connection
2. **Competitive Feel:** Enhanced ranking visualization drives competition
3. **Mobile Experience:** Native feel improves user satisfaction
4. **Performance:** Optimized loading and smooth scrolling
5. **Accessibility:** Better experience for all users

## Technical Considerations

1. **Image Loading:** Handle slow/failed avatar loads gracefully
2. **Cache Strategy:** Balance performance with data freshness
3. **Memory Usage:** Optimize avatar storage for mobile devices
4. **Network Impact:** Minimize additional API calls through caching
