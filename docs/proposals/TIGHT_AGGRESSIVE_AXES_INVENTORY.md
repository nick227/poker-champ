# Tight Aggressive Axis Inventory And Roadmap

## Purpose
Define a clean inventory of poker-relevant decision axes for the declarative axis engine (`applyAxes`) used by `tight_aggressive_v1`.

This document is a planning/reference map for axis selection and rollout order.

## Core Rule
Every new behavior should be expressed as:

`base node weights -> ordered axis multipliers -> weightedPick`

If behavior can be represented as action-weight multipliers, it should be added as an axis, not as custom branching logic.

Axes compose multiplicatively and are applied in deterministic order; later axes may override earlier ones only by weight magnitude, not by legality.

## Currently Implemented Axes
### 1) `playerCountBucket`
- Buckets: `HU`, `MW2`, `MW3_PLUS`
- Role: tighten aggression as player count increases.

### 2) `potOddsBucket`
- Buckets: `EXCELLENT`, `GOOD`, `NEUTRAL`, `BAD`
- Role: bias `CALL` vs `FOLD` from call-cost math.

### 3) `drawBucket`
- Buckets: `NONE`, `FLUSH_DRAW`, `OPEN_ENDED`, `COMBO_DRAW`
- Role: bias continuation/semi-bluff behavior when drawing.

## High-Leverage Next Axes
These provide strong realism per unit complexity and fit cleanly into current architecture.

### 4) `positionBucket` (postflop)
- Suggested buckets: `IN_POSITION`, `OUT_OF_POSITION`
- Effect: increase betting/raising IP, tighten OOP.

### 5) `stackBucket`
- Buckets: `SHORT`, `MEDIUM`, `DEEP`
- Effect: short-stack jam bias, deep-stack lower jam / higher postflop maneuvering.

### 6) `facingPressureBucket` (as explicit axis)
- Buckets: `UNOPENED`, `VS_RAISE`, `VS_3BET_PLUS`, `VS_ALLIN`
- Effect: stronger folding/tightening under escalating aggression.

### 7) `initiative`
- Buckets: `HAS_INITIATIVE`, `NO_INITIATIVE`
- Effect: c-bet/barrel frequency shifts.

### 8) `street`
- Buckets: `FLOP`, `TURN`, `RIVER`
- Effect: controlled bluff decay and value concentration by street.

### 9) `initiativeStreetCount`
- Buckets: `FIRST_BARREL`, `SECOND_BARREL`, `THIRD_BARREL`
- Effect: decay bluff frequency across multiple barrels without opponent-memory requirements.

### 10) `sprBucket`
- Buckets: `LOW`, `MID`, `HIGH`
- Effect: low SPR raises all-in/value pressure; high SPR supports smaller sizing and wider maneuvering.

## Texture / Board Axes (Phase 2+)
### 11) `boardPaired`
- Buckets: `TRUE`, `FALSE`
- Effect: lower bluff pressure on paired boards.

### 12) `boardWetness`
- Buckets: `DRY`, `SEMI_WET`, `WET`
- Effect: adjust bluff/value and protection frequency.

### 13) `boardMonotone`
- Buckets: `TRUE`, `FALSE`
- Effect: flush-dynamic adaptation.

### 14) `straightConnectivity`
- Buckets: `LOW`, `MEDIUM`, `HIGH`
- Effect: adapt aggression to straight-heavy board structures.

## Hand-Structure Axes (Advanced, Still Declarative)
### 15) `hasOverpair`
- Buckets: `TRUE`, `FALSE`
- Effect: boost value aggression.

### 16) `topPairKickerStrength`
- Buckets: `WEAK`, `MEDIUM`, `STRONG`
- Effect: value bet/call calibration.

### 17) `madeHandStrengthBucket`
- Buckets: `WEAK`, `MEDIUM`, `STRONG`, `NUTTY`
- Effect: broader postflop hand-shape control.

### 18) `blockerStrength`
- Buckets: `NONE`, `SINGLE_BLOCKER`, `DOUBLE_BLOCKER`
- Effect: bluff modulation by blocker quality.

## Opponent / Meta Axes (Phase 3+)
These require memory/state and should be staged later.

### 19) `opponentTightness`
- Buckets: `NIT`, `BALANCED`, `LOOSE`

### 20) `opponentAggression`
- Buckets: `PASSIVE`, `AGGRESSIVE`

### 21) `recentAggressionHistory`
- Buckets: `NONE`, `ONE_BARREL`, `TWO_BARRELS`

### 22) `tableImage`
- Buckets: `TIGHT`, `BALANCED`, `LOOSE`

## Situational Axes
### 23) `betSizeRelativeToStack`
- Buckets: `SMALL`, `COMMITTING`, `ALL_IN`

### 24) `callCostRelativeToStack`
- Buckets: `TRIVIAL`, `MODERATE`, `COMMITTING`

### 25) `tournamentICMPressure`
- Buckets: `LOW`, `MEDIUM`, `HIGH`

### 26) `multiwayEquityPenalty`
- Buckets: `NONE`, `MODERATE`, `HIGH`

## Style/Flavor Axes (Optional)
### 27) `riskTolerance`
- Buckets: `LOW`, `NORMAL`, `HIGH`

### 28) `tiltLevel`
- Buckets: `CALM`, `AGITATED`, `TILTED`

### 29) `timePressure`
- Buckets: `LOW`, `HIGH`

## Preflop-Specific Opportunity Axes
### 30) `openOpportunity`
- Buckets: `FIRST_TO_ACT`, `ISOLATE`, `SQUEEZE`

### 31) `squeezeOpportunity`
- Buckets: `TRUE`, `FALSE`

### 32) `limpPresent`
- Buckets: `TRUE`, `FALSE`

These axes are evaluated only during `PREFLOP` street and ignored otherwise.

## Axis Categories
- Structural: position, stack depth, SPR
- Mathematical: pot odds, call-cost ratios
- Board-based: wetness, pairing, monotone/connectivity
- Hand-based: overpair, blockers, hand-strength buckets
- Opponent-based: tightness/aggression tendencies
- Meta-based: image/tilt/risk profile
- Situational: ICM, commitment pressure, multiway penalties

## Recommended Next Order
Highest realism gain per complexity:
1. `stackBucket`
2. `initiative`
3. `positionBucket` (IP/OOP postflop)
4. `sprBucket`
5. `boardWetness`

Axis stability levels:
- Tier A (always useful): `stackBucket`, `initiative`, `positionBucket`, `sprBucket`
- Tier B (board texture): `boardWetness`, `boardPaired`, `boardMonotone`
- Tier C (opponent memory): `opponentTightness`, `opponentAggression`

## Guardrails
- Axis values are multipliers only; no legality logic in axes.
- Axis modifiers must be positive real numbers (`0` allowed to suppress an action).
- No cent sizing math in axes.
- No Dealer/Resolver branching by brain type.
- Keep axis derivation deterministic and cheap.

## Axis Smell Test
An axis is valid if:
1. It can be expressed as a multiplier on action weights.
2. It does not require inspecting specific card identities.
3. It does not require mutating state.
4. It does not require new lookup tables.

If any check fails, it is likely not an axis.

## Definition Of Done For Any New Axis
1. Feature is derived deterministically in `deriveFeatures`.
2. Axis definition is added in config (`id`, `order`, `feature`, `buckets`).
3. No pipeline code changes beyond feature derivation.
4. Add at least one smoke test showing intended directional behavior.
5. Optional: trace output includes applied bucket and modifier map.
