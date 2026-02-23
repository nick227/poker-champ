# Active Player Turn Outline Proposal

## Objective
Add a consistent green outline around the player whose turn it is (`toActSeat`), for both:
- Hero panel (`HeroZone`)
- Opponent tiles (`OpponentStrip`)

This should match the existing active-opponent visual language and avoid introducing a second style variant.

## Why This Change
Current behavior is close but not fully unified:
- Opponents already get an active outline via `o.isActive` + `tileActive` styles.
- Hero does not currently receive the same turn-outline treatment.
- Turn detection for hero should be sourced directly from turn state (`toActSeat`) so highlight semantics stay exact.

## Existing References
- `docs/proposals/DEALER_BUTTON_PROPOSAL.md` (pattern for incremental UI proposal)
- `apps/client/src/components/domain/table/HeroZone.tsx`
- `apps/client/src/components/domain/table/OpponentStrip.tsx`
- `apps/client/src/components/domain/table/opponentStrip.styles.ts`
- `apps/client/src/components/domain/table/constants/style/tableColors.ts`
- `apps/client/src/components/domain/table/table.adapter.ts`
- `apps/client/src/components/domain/table/hooks/useTableSceneModel.ts`

## Functional Requirements
- Highlight exactly one seat when `snapshot.hand.toActSeat` is present.
- If hero seat is `toActSeat`, hero gets green outline.
- If opponent seat is `toActSeat`, only that opponent tile gets green outline.
- If no active hand / no `toActSeat`, no turn outline is shown.
- Winner ring and dealer button continue to render correctly with no overlap regressions.

## Visual Specification
Use the existing active tile token set so hero and opponents are visually identical:
- Border color: `ACTIVE_TILE_BORDER` from `tableColors.ts`
- Border width: `2`
- Soft glow/shadow: same as `opponentStripStyles.tileActive`
- Elevation: same as `opponentStripStyles.tileActive`

## Technical Approach

### 1. Normalize Active-Turn Source
Use `snapshot.hand.toActSeat` as the single source of truth.

Compute this directly in `useTableSceneModel.ts`:
- `const isHeroToAct = snapshot.hero.seat != null && snapshot.hand?.toActSeat != null && snapshot.hero.seat === snapshot.hand.toActSeat`

Then expose `isHeroToAct` in the scene model.

Reason: `canAct` currently depends on both turn state and action-options availability. For visual turn indicator, we only need turn ownership.

### 2. HeroZone API and Rendering
In `HeroZone.tsx`:
- Add prop: `isActiveTurn?: boolean` (default `false`)
- Apply active outline style to the main hero panel container when true.
- Keep baseline `borderWidth` with `borderColor: transparent` in the default style to prevent layout shift when active.

Recommended target container:
- The root content wrapper in `content` (the panel that encloses calc strip + cards + stack)

This creates parity with opponent tile-level highlighting.

### 3. Reuse Active Style Tokens
Avoid duplicating active style literals in both components.

Recommended:
- Create shared style fragment (e.g. `tableActiveOutline.styles.ts`) containing:
  - `activeOutlineBorderColor`
  - optional `activeOutlineShadow`
- Consume it in:
  - `opponentStrip.styles.ts` (`tileActive`)
  - `heroZone.styles.ts` (new `activeTurn` style)

If we want minimal churn, hero can import `ACTIVE_TILE_BORDER` and copy shadow/elevation values initially, then refactor shared style in a follow-up.

### 4. TableLayout Wiring
In `TableLayout.tsx`:
- Pass `isHeroToAct` from scene model into `<HeroZone isActiveTurn={isHeroToAct} />`

Opponents already use `isActive` from `mapSeatsToOpponents`, so no behavior change required there.

## Proposed File Changes
- `apps/client/src/components/domain/table/hooks/useTableSceneModel.ts`
  - Compute/expose `isHeroToAct`
- `apps/client/src/components/domain/table/TableLayout.tsx`
  - Pass `isHeroToAct` to `HeroZone`
- `apps/client/src/components/domain/table/HeroZone.tsx`
  - Add `isActiveTurn` prop and conditional active class/style
- `apps/client/src/components/domain/table/heroZone.styles.ts`
  - Add `activeTurn` style (border + shadow)
- Optional refactor:
  - shared active-outline constants/style module used by both hero and opponents

## Edge Cases
- Hero seated but disconnected while still `toActSeat`: highlight remains visible (turn ownership remains accurate).
- Fast server updates: outline should move cleanly between seats without stale state.
- End-of-hand transitions: outline disappears when hand snapshot no longer has `toActSeat`.

## Testing Plan

### Unit Tests
- `getIsHeroToAct` returns:
  - `true` when hero seat equals `hand.toActSeat`
  - `false` when not seated / no hand / different seat

### Component Tests
- `HeroZone` renders active outline when `isActiveTurn=true`
- `HeroZone` has no active outline when `isActiveTurn=false`
- `OpponentStrip` active tile behavior remains unchanged

### Integration / Visual Checks
- Manual table run-through:
  - Hero turn -> hero highlighted
  - Opponent turn -> matching tile highlighted
  - Highlight moves each action
- Verify no collision with `PotWinRing` and `DealerButton` placement.

## Rollout
1. Implement hero active-turn highlight with existing tokens.
2. Verify visual parity with opponent active tile.
3. (Optional) Refactor to shared active-outline style module if duplication appears.

## Acceptance Criteria
- Hero and opponents use the same green outline style when they are `toActSeat`.
- Exactly one active-turn outline is shown at a time during a hand.
- No regressions to dealer button, winner effects, or layout stability.
