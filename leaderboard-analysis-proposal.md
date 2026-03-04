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

**Minimal Data Contract:**
```typescript
export type LeaderboardEntry = {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  value: string;
  handCount: number;
};
```

**Removed Fields:**
- `valueNumerator` and `valueDenominator` - server-side only unless UI needs them
- Keep contract minimal for faster serialization

**Avatar Storage Strategy:**
```sql
leaderboard_cache
-----------------
rank
userId
displayName
avatarUrl
value
handCount
```

**Benefits:**
- Zero joins
- Predictable latency
- Easy CDN caching
- Simple serialization
- Recomputed periodically

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

// Important fallback to avoid broken images
if (!url) {
  return <InitialAvatar username={username} />;
}

// Common fallback: colored circle + first letter
// This prevents layout shift
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

**Fixed Layout:**
```
|16| rank(32) |12| avatar(32) |12| name/flex |12| amount(88) |16|
```

**Row Height:** 56px (h-14)

**This Achieves:**
- Predictable geometry
- Stable number column
- Fast scanning
- Native list density
- Minimal render work

#### Row Design Implementation

**Final Row Implementation:**
```typescript
// Clean row with proper geometry and stability
<View className="border-b border-border/30">
  <View className="flex-row items-center h-14 px-4">

    {/* Rank - Right aligned */}
    <View className="w-8 items-end pr-1">
      <Text className="text-sm text-muted">
        {entry.rank}
      </Text>
    </View>

    {/* Avatar - 32px with fallback */}
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

    {/* Amount - Fixed width, tabular numbers */}
    <Text
      className="min-w-[88px] text-right text-base font-semibold"
      style={{ fontVariant: ["tabular-nums"] }}
    >
      {entry.value}
    </Text>

  </View>
</View>
```

**With Optional Press Handling:**
```typescript
<TouchableOpacity
  delayPressIn={50} // Prevents accidental flashes during fast scroll
>
  {/* Row content as above */}
</TouchableOpacity>
```

**Key Improvements:**
- `tabular-nums` font variant prevents number wobbling
- `delayPressIn={50}` disables row highlight on scroll
- Stable key strategy: `key={entry.userId}` (not rank-based)
- Proper rank cell structure (no tint backgrounds)
- Avatar fallback prevents layout shift

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

2. **List Rendering:**
   - Use `ScrollView` (avoid FlatList re-renders during frequent polling)
   - Maintained scroll position during refresh
   - Efficient key strategy for row updates

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

## Leaderboard Upgrade Implementation Tasklist

### Phase 1: Backend API & Data Contract
- [ ] **Update LeaderboardEntry type** - Remove unused fields, keep minimal contract
- [ ] **Create leaderboard_cache table** - Include avatarUrl field for zero-join queries
- [ ] **Implement avatar caching** - Copy avatarUrl during leaderboard computation
- [ ] **Update API endpoint** - Return simplified LeaderboardEntry with avatarUrl
- [ ] **Add periodic recomputation** - Schedule leaderboard cache updates
- [ ] **Test API performance** - Verify zero-join query performance

### Phase 2: Avatar Component System
- [ ] **Create Avatar component** - Base component with size variants
- [ ] **Implement InitialAvatar fallback** - Colored circle + first letter
- [ ] **Add image loading states** - Handle loading/error gracefully
- [ ] **Implement avatar caching** - Local storage for avatar URLs
- [ ] **Add image preloading** - Preload top 10 avatar images
- [ ] **Test avatar fallbacks** - Ensure no layout shift on missing images

### Phase 3: Leaderboard Row Redesign
- [ ] **Update row geometry** - Implement 56px height with fixed layout
- [ ] **Add right-aligned rank** - Implement proper rank cell structure
- [ ] **Integrate Avatar component** - Replace placeholder with actual avatars
- [ ] **Implement tabular numbers** - Add fontVariant for stable amount column
- [ ] **Add row separators** - Implement border dividers
- [ ] **Update text styling** - Implement tight 2-line stack (base + xs)

### Phase 4: Interaction & Polish
- [ ] **Add TouchableOpacity wrapper** - Implement press handling with delayPressIn
- [ ] **Implement stable key strategy** - Use userId instead of rank for keys
- [ ] **Add micro-interactions** - Subtle press states and transitions
- [ ] **Test scroll performance** - Verify smooth scrolling with 20 rows
- [ ] **Implement accessibility** - Screen reader support and semantic markup
- [ ] **Add responsive testing** - Verify layout on different screen sizes

### Phase 5: Performance Optimization
- [ ] **Implement avatar lazy loading** - Load off-screen avatars on demand
- [ ] **Add image optimization** - Compress and cache avatar images
- [ ] **Test memory usage** - Monitor avatar storage impact
- [ ] **Implement error boundaries** - Handle avatar loading failures
- [ ] **Add performance monitoring** - Track render times and scroll FPS
- [ ] **Optimize bundle size** - Ensure minimal impact on app size

### Phase 6: Testing & Validation
- [ ] **Unit test Avatar component** - Verify fallback behavior and sizing
- [ ] **Integration test leaderboard API** - Test new data contract
- [ ] **Visual regression testing** - Ensure consistent row layout
- [ ] **Performance testing** - Verify scroll performance with avatars
- [ ] **Accessibility testing** - Screen reader and navigation testing
- [ ] **Cross-device testing** - Test on various mobile devices

### Phase 7: Deployment & Monitoring
- [ ] **Backend deployment** - Deploy updated API with avatar caching
- [ ] **Frontend deployment** - Release updated leaderboard component
- [ ] **Add analytics tracking** - Monitor leaderboard engagement metrics
- [ ] **Implement error tracking** - Monitor avatar loading failures
- [ ] **Performance monitoring** - Track API response times
- [ ] **User feedback collection** - Gather feedback on new design

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
