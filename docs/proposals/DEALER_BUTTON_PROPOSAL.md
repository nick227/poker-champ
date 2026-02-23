# Dealer Button UI Implementation Proposal

## Overview

This proposal outlines the implementation of a dealer button UI component that visually indicates which player is the dealer for the current hand. The dealer button is a fundamental poker element that determines betting order and blind positions.

## Requirements

### Functional Requirements
- **Visual Indicator**: Small blue button with "D" text
- **Positioning**: Appears within player/opponent areas
- **Dynamic Movement**: Updates each hand when dealer position changes
- **Server-Authoritative**: Position determined by `dealerSeat` from server snapshot
- **Responsive**: Works across different screen sizes and orientations

### Technical Requirements
- **Component Architecture**: Reusable `DealerButton` component
- **Data Source**: Uses `TableSnapshotPayload.hand.dealerSeat`
- **Positioning Logic**: Maps dealer seat to player areas
- **Animation**: Smooth transitions between dealer changes
- **Accessibility**: Proper labeling for screen readers

## Current State Analysis

### Existing Infrastructure
- **TableSnapshotPayload**: Contains `hand.dealerSeat` (number, seat index)
- **Opponent Interface**: Already has `isDealer?: boolean` property
- **Player Areas**: `HeroZone` and `OpponentStrip` components exist
- **Styling System**: Uses Tailwind/Nativewind with consistent design tokens

### Data Flow
```
Server (dealerSeat) → TableSnapshot → HeroZone/OpponentStrip → DealerButton
```

## Implementation Plan

### Phase 1: Core DealerButton Component

```typescript
// DealerButton.tsx
export function DealerButton({ size = "small" }: { size?: "small" | "large" }) {
  return (
    <View 
      className={`rounded-full bg-blue-500 ui-center justify-center ${
        size === "small" ? "w-6 h-6" : "w-8 h-8"
      }`}
      accessibilityLabel="Dealer button"
      accessibilityRole="img"
    >
      <Text 
        className={`text-white font-bold ${
          size === "small" ? "text-xs" : "text-sm"
        }`}
      >
        D
      </Text>
    </View>
  );
}
```

### Phase 2: Integration with Player Areas

#### HeroZone Integration
```typescript
// HeroZone.tsx additions
interface HeroZoneProps {
  // ... existing props
  isDealer?: boolean;
}

export function HeroZone({ 
  cards, 
  stackCents, 
  isMyTurn, 
  heroStatus, 
  equity, 
  potOdds, 
  outs, 
  isWinner = false,
  isDealer = false, // New prop
}: HeroZoneProps) {
  return (
    <View className="ui-row items-center justify-between">
      {/* Existing hero content */}
      <View className="ui-col flex-1">
        {/* Current hero zone content */}
      </View>
      
      {/* Dealer button positioned in top-right */}
      {isDealer && (
        <View className="absolute top-2 right-2">
          <DealerButton size="small" />
        </View>
      )}
    </View>
  );
}
```

#### OpponentStrip Integration
```typescript
// OpponentStrip.tsx modifications
export function OpponentStrip({ 
  opponents, 
  winnerName, 
  onPlayerPress 
}: {
  opponents: Opponent[];
  winnerName?: string;
  onPlayerPress?: (opponent: Opponent) => void;
}) {
  return (
    <View className="max-h-[22vh] ui-row-wrap border-b border-border-subtle px-3 py-3" style={{ gap: 10 }}>
      {opponents.map((o) => {
        // ... existing logic
        
        const content = (
          <View className="relative">
            {/* Existing opponent content */}
            <View
              className={`ui-col ui-center rounded-lg px-3 py-2 min-w-[80px] ${
                o.isActive ? "border-brand bg-brand-soft/30 border-2" : "ui-surface"
              } ${inactive ? "opacity-50" : ""}`}
              style={{ gap: 6 }}
            >
              {/* Existing opponent info */}
            </View>
            
            {/* Dealer button overlay */}
            {o.isDealer && (
              <View className="absolute -top-1 -right-1">
                <DealerButton size="small" />
              </View>
            )}
          </View>
        );
        
        // ... rest of component
      })}
    </View>
  );
}
```

### Phase 3: Data Integration

#### TableLayout Updates
```typescript
// TableLayout.tsx modifications
export function TableLayout({
  snapshot,
  opponents,
  balanceCents,
  tableStatus,
  handResultMessage,
  topBarLeft,
  topBarRight,
  onAction,
  onPlayerPress,
}: TableLayoutProps) {
  // Determine if hero is dealer
  const heroIsDealer = snapshot.hero.youAreSeated && 
                      snapshot.hero.seat === snapshot.hand?.dealerSeat;
  
  // Update opponents with dealer info
  const opponentsWithDealer = opponents.map(opponent => ({
    ...opponent,
    isDealer: opponent.seat === snapshot.hand?.dealerSeat
  }));
  
  return (
    <View className="flex-1 ui-col">
      {/* ... existing layout */}
      
      <HeroZone
        // ... existing props
        isDealer={heroIsDealer}
      />
      
      <OpponentStrip
        opponents={opponentsWithDealer}
        // ... existing props
      />
      
      {/* ... rest of layout */}
    </View>
  );
}
```

#### Adapter Function Updates
```typescript
// table.adapter.ts additions
export function getIsDealer(snapshot: TableSnapshotPayload): boolean {
  if (!snapshot.hero.youAreSeated || !snapshot.hand) return false;
  return snapshot.hero.seat === snapshot.hand.dealerSeat;
}

export function getOpponentsWithDealer(
  snapshot: TableSnapshotPayload
): Opponent[] {
  // Existing opponent mapping logic...
  return opponents.map(opponent => ({
    ...opponent,
    isDealer: opponent.seat === snapshot.hand?.dealerSeat
  }));
}
```

### Phase 4: Animation & Polish

#### Transition Animation
```typescript
// DealerButton.tsx with animation
import { Animated } from "react-native";

export function DealerButton({ size = "small", isNewDealer = false }: { 
  size?: "small" | "large"; 
  isNewDealer?: boolean;
}) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    if (isNewDealer) {
      // Bounce animation when dealer changes
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.2, duration: 150, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1.0, duration: 150, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(1);
    }
  }, [isNewDealer]);
  
  return (
    <Animated.View 
      style={{ transform: [{ scale: scaleAnim }] }}
      className={`rounded-full bg-blue-500 ui-center justify-center ${
        size === "small" ? "w-6 h-6" : "w-8 h-8"
      }`}
    >
      <Text className={`text-white font-bold ${
        size === "small" ? "text-xs" : "text-sm"
      }`}>
        D
      </Text>
    </Animated.View>
  );
}
```

## Design Specifications

### Visual Design
- **Color**: Blue-500 (`bg-blue-500`)
- **Shape**: Perfect circle (`rounded-full`)
- **Text**: White "D" character, bold font
- **Sizes**: Small (24x24px) for player areas, Large (32x32px) for potential use in other contexts

### Positioning Strategy
- **HeroZone**: Top-right corner overlay
- **OpponentStrip**: Top-right corner overlay with negative margins
- **Responsive**: Maintains relative positioning across screen sizes

### Accessibility
- **Label**: "Dealer button" for screen readers
- **Role**: `img` role for semantic meaning
- **Focus**: Not focusable (decorative element)

## Implementation Timeline

### Week 1: Foundation
- [ ] Create `DealerButton` component
- [ ] Add basic styling and accessibility
- [ ] Write unit tests

### Week 2: Integration
- [ ] Update `HeroZone` with dealer prop
- [ ] Update `OpponentStrip` with dealer display
- [ ] Modify `TableLayout` data flow

### Week 3: Polish & Testing
- [ ] Add transition animations
- [ ] Implement responsive design testing
- [ ] Write integration tests
- [ ] User acceptance testing

## Testing Strategy

### Unit Tests
- `DealerButton` rendering and accessibility
- Dealer position calculation logic
- Data transformation functions

### Integration Tests
- End-to-end dealer button movement
- Server snapshot → UI rendering flow
- Animation behavior on dealer changes

### Visual Regression Tests
- Screenshots for different dealer positions
- Various screen sizes and orientations
- Dark/light theme compatibility

## Future Enhancements

### Potential Improvements
- **Dealer Chip Animation**: Animated chip movement between players
- **Dealer History**: Visual indicator of recent dealer changes
- **Blind Indicators**: Small blind/big blind indicators near dealer button
- **Customization**: User-selectable dealer button styles

### Performance Considerations
- **Memoization**: Cache dealer position calculations
- **Animation Optimization**: Use `useNativeDriver` for smooth animations
- **Minimal Re-renders**: Optimize component update patterns

## Conclusion

The dealer button implementation provides a critical visual cue for poker gameplay while maintaining the existing architectural patterns. The phased approach ensures incremental delivery with thorough testing at each stage.

The solution leverages existing infrastructure and maintains the server-authoritative data flow pattern established throughout the application.
