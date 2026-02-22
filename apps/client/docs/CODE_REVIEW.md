# Table layout & children – code review

## 1. Bad practices & anti-patterns

| Location | Issue | Recommendation |
|---------|--------|----------------|
| **CommunityBoard** | `key={i}` on mapped community cards | Use stable keys (e.g. `communityCardKeys = ["flop1","flop2","flop3","turn","river"]` or `\`card-${i}\`` as fallback). Index keys are brittle when list can change. |
| ~~TableLayout~~ | ~~New object every render: hand summary~~ | ✅ **Done:** `useTableSnapshot` returns `handSummary`; TableLayout passes it to DealerAnnounceBar. |
| ~~ActionBar~~ | ~~Inline arrow: Fold button~~ | ✅ **Done:** `handleFold = useCallback(() => onAction({ type: "FOLD" }), [onAction])`. Check/Call and All-in already memoized. |

## 2. Redundancy

| Location | Issue | Recommendation |
|----------|--------|----------------|
| **Card type** | `HeroZone` and `CommunityBoard` both define `type Card = { rank: string; suit: string } \| null` | Use shared `UiCard` from `table.adapter` (or add `Card` to `table.types.ts`) and use in both. |
| **Connection status type** | `TableLayoutProps.connectionStatus` and `ActionBar` props use inline `"CONNECTED" \| "RECONNECTING" \| "DISCONNECTED"` | Define `ConnectionStatus` in `table.types.ts`; use in TableLayout, ActionBar, and actionBar.logic (`ActionBarConnectionStatus`). |
| **"Your turn"** | `ActionBar` uses literal `"Your turn"`; `TABLE.yourTurn` exists in copy | Use `TABLE.yourTurn` for consistency. |
| **Default table name** | `useTableSnapshot`: `?? "Table"` | Add `TABLE.defaultTableName` in copy and use it. |

## 3. Magic strings & numbers

| Location | Value | Recommendation |
|----------|--------|----------------|
| **useTableSnapshot** | `"Table"` | `TABLE.defaultTableName` in copy. |
| **DealerAnnounceBar** | `"Next deal: "`, `"Waiting for hand"`, `" - "` | Add to copy (e.g. `TABLE.nextDeal`, `TABLE.waitingForHand`, `TABLE.waitingForHandStatus`) and use. |
| **DealerAnnounceBar** | `250` (interval ms) | `NEXT_DEAL_TICK_MS = 250` in constants or at top of file. |
| **ActionBar** | `12` (paddingHorizontal) | Use `ACTION_BAR_*` constant from actionBar.constants if present, or add. |
| **ActionBar** | `"Reconnecting..."` | Add `TABLE.reconnecting` to copy. |
| **CommunityBoard** | `8` in `availableCardHeight` | Name constant (e.g. `CARD_ROW_GAP` or document as “gap between card row and pot row”). |

## 4. Inefficiencies

| Location | Issue | Recommendation |
|----------|--------|----------------|
| **useTableSnapshot** | Returns new object every call | `useMemo` with deps `[snapshot, handResultMessage]` (and possibly deep deps for nested fields) if any consumer ever relies on referential equality. |
| **TableLayout** | Theme picker `right` JSX created every render | Memoize: `const topBarRight = useMemo(() => <View>...</View>, [topBarRightProp, themePickerVisible setter])` if needed; or keep if children are cheap. |
| **CommunityBoard** | Inline style objects in map and container | Move to `communityBoard.styles.ts` with StyleSheet; stable card scale style. |

## 5. Consistency

| Location | Issue | Recommendation |
|----------|--------|----------------|
| **TableTopBar** | Inline props type; inline styles `{ flex: 1 }`, `{ minHeight: 44 }` | Export `TableTopBarProps`; move layout styles to `tableTopBar.styles.ts` or constants (e.g. `BALANCE_ROW_MIN_HEIGHT = 44`). |
| **DealerAnnounceBar** | Inline props type | Export `DealerAnnounceBarProps`; consider shared `Hand` type in table.types if used elsewhere. |
| **CommunityBoard** | Inline props type; no .styles.ts | Export `CommunityBoardProps`; add `communityBoard.styles.ts` and centralize constants (CARD_GAP, POT_ROW_MIN_HEIGHT, etc.) in `constants/communityBoard.constants.ts` or layoutHeights. |
| **ActionBar** | Inline props type; many inline styles | Export `ActionBarProps`; add `actionBar.styles.ts` and move style objects. |
| **ThemePickerSheet** | Inline props type | Export `ThemePickerSheetProps`. |

## 6. Improvements (DX / maintainability)

- ~~**Hand summary object**~~: ✅ **Done:** `useTableSnapshot` returns `handSummary`; TableLayout and DealerAnnounceBar use it.
- ~~**collapsable={false}**~~: ✅ **Done:** Documented at top of TableLayout.tsx.
- **Document height override**: TableLayout passes `height={opponentStripHeight}` and `height={heroZoneHeight}`; already clear. HeroZone/OpponentStrip “Override when viewport is small” is fine; optional: one-line note in layoutHeights that fallback is when `usableHeight < TOTAL_FIXED_HEIGHT`.
- **Connection overlay**: ActionBar’s “Reconnecting...” overlay could be a tiny presentational component for clarity and reuse.

## Priority order for fixes

1. **High**: Shared types (ConnectionStatus, Card/UiCard), copy strings (TABLE.defaultTableName, TABLE.nextDeal, TABLE.reconnecting, TABLE.yourTurn in ActionBar), CommunityBoard `key={i}`.
2. **Medium**: Named props types for TableTopBar, DealerAnnounceBar, CommunityBoard, ActionBar, ThemePickerSheet; move magic numbers to constants.
3. **Lower**: useTableSnapshot useMemo; hand summary from hook; TableLayout hand object memoization; ActionBar/CommunityBoard .styles.ts and inline style cleanup.
