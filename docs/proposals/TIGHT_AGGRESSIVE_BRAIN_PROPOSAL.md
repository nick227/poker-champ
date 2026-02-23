# Tight Aggressive Brain Proposal (Declarative + Reusable)

## Purpose
Define a single `tight_aggressive_v1` brain design that is:
- expressive enough for strong behavior shaping
- declarative for easy tuning
- reusable across future bot personalities
- isolated from Dealer/Resolver/gameplay rules

This proposal builds on the current bot architecture:
- brain orchestrator returns `ActionPayload`
- `BotResolver` remains the authoritative legality clamp boundary

## Current Implementation Snapshot
- Preflop: implemented and actively tuned (`UNOPENED`, key `VS_RAISE`, `VS_ALLIN` slices across position buckets).
- Postflop Phase 0: implemented with minimal axis:
  - lookup by `street x pressure x handClass`
  - hand classes limited to `AIR | WEAK_MADE | STRONG_MADE`
  - no board texture axis yet
- Postflop Phase 1: implemented as additive overlays on top of the same lookup shape:
  - player-count overlays
  - pot-odds overlays
  - draw-flags overlays
  - no board texture axis yet
- Resolver clamp remains final legality membrane.

Phase 2+ items (planned, not in current runtime):
- optional board-texture axis (later, only if needed)

## Design Law
`Brain = Orchestrator + Config`

The orchestrator is fixed and reusable.  
Personality is encoded in weight tables (data), not branching game logic.

## Top-Level Architecture

## 1. Shared Core Engine (Reusable Across All Brains)
All non-random brains use one fixed decision pipeline:

```ts
deriveFeatures(ctx)
-> classifySituation(features)
-> resolveNode(features) // pure lookup
-> resolveActionWeights(features)
-> weightedPick(actionWeights)
-> if wager: resolveSizingRecipe(features)
-> return ActionPayload
-> (Resolver clamps)
```

Brains only provide:
- classification mapping rules
- weight tables

Everything else is shared.

## 2. Tight Aggressive Identity
`tight_aggressive_v1` should be defined by data traits:
- tight preflop in early position (many zero combo weights)
- raise-heavy and jam-capable around premium combos
- pressure-sensitive aggression (different action/sizing under stronger action)
- explicit premium handling (e.g., AA effectively always continue)
- reduction in aggression under extreme multi-all-in pressure

No custom branching engine required; identity is numeric profile design.

## Universal Derived Features

Use one shared feature model consumed by all brains:

```ts
type DerivedFeatures = {
  street: "PREFLOP" | "FLOP" | "TURN" | "RIVER";
  positionBucket: "EARLY" | "MIDDLE" | "LATE" | "BLINDS";
  pressureBucket: "UNOPENED" | "VS_RAISE" | "VS_3BET_PLUS" | "VS_ALLIN";
  betSizeBucket: "NONE" | "SMALL" | "MEDIUM" | "LARGE" | "MAX";
  stackBucket: "SHORT" | "MEDIUM" | "DEEP";
  activePlayersInHand: number; // Phase 1 input, used to derive playerCountBucket
  playerCountBucket: "HU" | "MW2" | "MW3_PLUS";
  comboIndex?: number; // preflop only (0..168)
  handTier?: HandTier; // preflop helper tier
  handClass?: PostflopHandClass; // postflop only
  drawFlags?: DrawFlags; // Phase 1 (implemented)
  boardTexture?: BoardTexture; // Phase 2+
  potOddsBucket?: PotOddsBucket; // Phase 1 (implemented)
}
```

Notes:
- `comboIndex` reuses fixed 169 non-equivalent preflop combos.
- Postflop Phase 0 uses best-5 output mapped to `AIR | WEAK_MADE | STRONG_MADE`.
- Phase 1 overlays are now live (player count, pot odds, draw flags); texture axis remains staged.
- `pressureBucket`, `betSizeBucket`, and `stackBucket` must be derived by shared deterministic rules (below), not per-brain interpretation.

## Deterministic Bucket Rules (Shared)

### Pressure bucket (structural only)
- `UNOPENED`: no bet to us.
- `VS_RAISE`: exactly one raise in round before our action.
- `VS_3BET_PLUS`: two or more raises in round before our action.
- `VS_ALLIN`: the largest facing bet is an opponent all-in amount (entire remaining stack), not inferred from pot ratio.

No opponent profiling or hand-strength inference is allowed in pressure classification.

### Bet-size bucket
Derived only when facing action (`pressureBucket !== "UNOPENED"`):

```ts
betSizePct = roundCurrentBetCents / max(potCents, 1)
if (betSizePct <= 0.33) SMALL
else if (betSizePct <= 0.75) MEDIUM
else if (betSizePct <= 1.25) LARGE
else MAX
```

For `UNOPENED`, use `betSizeBucket = "NONE"`.

### Stack bucket
Use effective stack in big blinds:

```ts
effectiveBb = effectiveStackCents / bigBlindCents
if (effectiveBb < 15) SHORT
else if (effectiveBb <= 40) MEDIUM
else DEEP
```

## Preflop Model (Fully Declarative)

## Core concept
Do not model "ranges" as hand sets.  
Model 169-combo weights directly.

For developer ergonomics, support a tier layer on top of 169:

```ts
type HandTier = "PREMIUM" | "STRONG" | "GOOD" | "SPEC" | "TRASH";
type HandTierByComboIndex = readonly HandTier[]; // length 169
```

Developers can author:
- easy mode: tier weights
- advanced mode: raw 169 weights

Tier-based authoring is compiled into 169-length arrays at brain initialization. Runtime always consumes `comboWeights169`.

## Preflop table shape

```ts
type ComboWeights169 = readonly number[]; // length 169, validated at load

type ActionWeights = {
  FOLD?: number;
  CHECK?: number;
  CALL?: number;
  BET?: number;
  RAISE?: number;
  ALL_IN?: number;
};

type SizingRecipe =
  | "OPEN_SMALL"
  | "OPEN_STD"
  | "OPEN_LARGE"
  | "THREEBET_SMALL"
  | "THREEBET_STD"
  | "THREEBET_LARGE"
  | "CBET_SMALL"
  | "CBET_STD"
  | "CBET_LARGE"
  | "JAM";

type SizingWeights = Partial<Record<SizingRecipe, number>>;

type PreflopNode = {
  id: string;
  comboWeights169?: ComboWeights169; // advanced mode
  comboTierWeights?: Partial<Record<HandTier, number>>; // easy mode
  actionWeights: ActionWeights;
  sizingWeights?: SizingWeights;
  notes?: string;
};
```

## Indexed lookup (reduced dimensionality)

```ts
type FacingMap = Record<Exclude<BetSizeBucket, "NONE">, PreflopNode>;

type PreflopWeightsTable = Record<
  PositionBucket,
  {
    UNOPENED: PreflopNode; // no bet-size axis
    VS_RAISE: FacingMap;
    VS_3BET_PLUS: FacingMap;
    VS_ALLIN: FacingMap;
  }
>;
```

Flow:
1. Compute `comboIndex` (0..168).
2. Lookup node by position + pressure (+ betSize only when facing action).
3. Runtime reads compiled combo weight `cw = comboWeights169[comboIndex]`.
4. Strict gate:
   - `cw === 0`: cannot voluntarily continue (fold/check path only)
   - `cw > 0`: eligible to continue
5. Use node action weights filtered to legal actions.
   - `cw` does not scale fold/check/call/raise weights directly.
   - Optional explicit aggression scalar by tier may boost aggressive actions only (`RAISE`/`ALL_IN`).
6. Normalize legal actions.
7. Weighted pick.
8. If wager action, weighted-pick sizing recipe and resolve to cents via shared sizing resolver (resolver owns legality bounds).

This creates tightness via table data, not algorithm branches.

## Postflop Model (Same Pipeline, Different Axis)

### Phase 0 (Implemented): Minimal Baseline
Reuse best-5 output and pressure, with no draw/texture dimension.

```ts
type PostflopHandClass =
  | "AIR"
  | "WEAK_MADE"
  | "STRONG_MADE";

type PostflopNode = {
  id: string;
  actionWeights: ActionWeights;
  sizingWeights?: SizingWeights;
  notes?: string;
};

type PostflopWeightsTable = Record<
  Street,
  Record<
    PressureBucket,
    Record<PostflopHandClass, PostflopNode>
  >
>;
```

### Phase 1 (Implemented): Overlay Enhancements, No New Lookup Axes
Keep lookup shape unchanged (`street x pressure x handClass`) and apply additive overlays:
- draw flags
- player count
- pot odds

```ts
type DrawFlags = {
  hasFlushDraw: boolean;
  hasOpenEnded: boolean;
};

type PotOddsBucket = "EXCELLENT" | "GOOD" | "NEUTRAL" | "BAD";

type DrawBucket = "NONE" | "FLUSH_DRAW" | "OPEN_ENDED" | "COMBO_DRAW";

type AxisDefinition = {
  id: string;
  order: number;
  feature: "playerCountBucket" | "potOddsBucket" | "drawBucket";
  buckets: Record<string, Partial<ActionWeights>>;
};
```

This preserves low dimensionality and keeps tuning declarative.

## Ergonomic Config Schema (Developer-Friendly)

Proposed config file shape:

```ts
export type TightAggressiveConfigV1 = {
  version: 1;
  metadata: {
    id: "tight_aggressive_v1";
    label: string;
    description?: string;
  };
  normalization: {
    maxWeight: number; // e.g. 100
    zeroIsFoldGate: boolean; // true
  };
  preflop: {
    comboIndexMap: "STANDARD_169_V1";
    handTierByComboIndex: HandTierByComboIndex;
    table: PreflopWeightsTable;
  };
  postflop: {
    evaluator: "BEST5_V1";
    table: PostflopWeightsTable;
  };
  axes?: AxisDefinition[]; // defaults to []
  sizing: {
    recipes: "CASH_STANDARD_V1";
  };
  safety: {
    fallbackActionOrder: readonly ["CHECK", "FOLD", "CALL", "ALL_IN"];
  };
  debug?: {
    emitDecisionTrace: boolean;
  };
};
```

Schema design goals:
- versioned
- explicit IDs for reusable maps/evaluators/recipes
- declarative data only
- no code-level branching encoded in config
- low-dimensional lookups with additive overlays for realism

## Config Load and Compile Step (Required)

At brain initialization:
1. Validate config shape and required keys.
2. Validate no negative weights.
3. For each preflop node:
   - if `comboTierWeights` exists, compile it to `comboWeights169` using `handTierByComboIndex`
   - if raw `comboWeights169` exists, validate length 169
4. Freeze compiled config object in memory.

Runtime must consume only compiled, frozen `comboWeights169` arrays.

## Modular File Layout Proposal

```txt
src/engine/bots/brains/tight_aggressive/
  TightAggressiveBrain.ts             // orchestrator only
  config/
    tightAggressive.config.ts         // main tables
    preflop.169.map.ts                // combo index mapping metadata
    handTierByComboIndex.ts           // tier map (easy authoring mode)
  classifiers/
    deriveFeatures.ts                 // shared feature derivation adapter
    classifyPosition.ts
    classifyPressure.ts
    classifyBetSize.ts
    classifyBoardTexture.ts           // Phase 2+ only
  lookup/
    resolvePreflopNode.ts             // pure table lookup
    resolvePostflopNode.ts            // pure table lookup
  transforms/
    resolveActionWeights.ts           // legal filtering + optional tier scalar
    resolveSizingRecipe.ts            // weighted recipe pick + legal cents resolution
    applyAxes.ts                      // Phase 1+ declarative axis overlay engine
  runtime/
    loadAndCompileConfig.ts           // validate + compile tier->169 + freeze
```

Keep the logic thin and composable.  
Most tuning should happen in config tables.

## Orchestrator Contract

`TightAggressiveBrain` should:
1. call shared `deriveFeatures(ctx)`
2. pick preflop or postflop node via pure table lookup
3. resolve action weights
4. weighted pick legal action candidate
5. resolve sizing recipe for wager actions
6. return raw `ActionPayload`

It should not:
- clamp legality (Resolver owns clamp)
- access persistence
- mutate global state

### Sizing recipe legality ownership
Sizing resolver must:
- respect `minRaiseTo` / `maxRaiseTo`
- respect available stack constraints
- clamp to nearest legal bound when recipe target overshoots

Brains do not compute wager cents directly.

### Overlay Application Order (Phase 1 Implemented)
Base node resolution remains unchanged. Overlays are additive:

```ts
weights = resolveActionWeights(node)
weights = applyAxes(weights, axes, features)
action = weightedPick(weights)
```

Combo gate still runs first; overlays never resurrect gated (`cw === 0`) hands.

### Declarative Axis Model (Implemented)
Phase 1 overlays are represented as ordered axis definitions in config:

```ts
type AxisDefinition = {
  id: string;
  order: number;
  feature: "playerCountBucket" | "potOddsBucket" | "drawBucket";
  buckets: Record<string, Partial<ActionWeights>>;
};
```

Runtime behavior:
- compile and sort axes at config-load time
- derive bucket from `features` using `feature`
- apply bucket modifiers through one generic `applyAxes(...)` pass

This keeps overlays data-driven and avoids adding transform files per axis.

## Special Behavior Examples (Data-Driven)

## AA behavior target
- preflop combo weight near max across all nodes
- strong raise/jam action weights
- sizing:
  - later position + minimal action: bias small/medium
  - early or high pressure: bias large/max

## QQ behavior target
- high continue/aggression default
- under `VS_ALLIN` + `MW3_PLUS`, reduce jam weight and increase call/fold share

These are config outcomes, not hard-coded per-hand branches.

## Reuse Guarantees

The following components are reused across all future brains:
- 169 combo index system
- hand-tier map on top of 169
- best-5 evaluator
- universal feature derivation
- weighted picker
- shared sizing recipe resolver
- legality clamp membrane in `BotResolver`
- decision pipeline shape

Adding a new bot personality should require:
1. new config table set
2. catalog mapping change (`botId -> brainType`)

No Dealer changes.

## Non-Goals (For v1)
- no strategy DSL/runtime interpreter
- no DB-driven strategy trees
- no per-table special logic
- no opponent memory model
- no solver-level equilibrium engine

## Incremental Build Plan

### Slice A: Skeleton + schema
- Build config loader/validator first (`loadAndCompileConfig`).
- Add typed config schema (`version: 1`).
- Add tier-authoring path (`comboTierWeights`) plus compile-to-169 support.
- Freeze validated compiled config.
- Add `TightAggressiveBrain` orchestrator with empty/default tables.
- Wire registry entry `tight_aggressive_v1` (behind fallback-safe path).

### Slice B: Preflop only
- Implement 169 index lookup + preflop table resolution.
- Add minimal position/pressure/betSize buckets (`UNOPENED` direct node, facing pressure via bet-size map).
- Implement shared sizing recipes with `OPEN_STD` and `JAM` first.
- Implement recipe-to-cents legality resolver.
- Ensure AA/KK/QQ behavior constraints via tests.

### Slice C: Postflop Phase 0 (Implemented)
- Plugged in best-5 evaluator and mapped to `AIR | WEAK_MADE | STRONG_MADE`.
- Added baseline postflop action/sizing nodes across `UNOPENED` and `VS_RAISE` (with fallback entries for other pressure buckets).
- No draw modeling and no texture axis in Phase 0.

### Slice D: Postflop Phase 1 (Implemented)
- Added player-count overlays (`HU`, `MW2`, `MW3_PLUS`) as additive modifiers.
- Added pot-odds overlays (`EXCELLENT`, `GOOD`, `NEUTRAL`, `BAD`) as additive modifiers.
- Added draw overlays (`hasFlushDraw`, `hasOpenEnded`) as additive modifiers.
- Kept lookup shape unchanged (`street x pressure x handClass`).

### Slice E: Tuning + telemetry (Next)
- Add or expand decision trace fields for debugging:
  - selected buckets
  - combo index + hand tier + combo weight
  - selected node id
  - chosen action + sizing recipe
- optional overlay contributions (draw/playerCount/potOdds)
- Keep output clamped by Resolver boundary.

## Dev Trace Payload (Internal)

Use a unified trace shape in debug mode:

```ts
type BotDecisionTrace = {
  brainId: "tight_aggressive_v1";
  street: DerivedFeatures["street"];
  positionBucket: DerivedFeatures["positionBucket"];
  pressureBucket: DerivedFeatures["pressureBucket"];
  betSizeBucket: DerivedFeatures["betSizeBucket"];
  comboIndex?: number;
  handTier?: HandTier;
  comboWeight?: number;
  comboWeightSource?: "TIER" | "RAW_169";
  nodeId: string;
  legalActions: string[];
  chosenAction: string;
  chosenSizingRecipe?: SizingRecipe;
};
```

This makes tuning fast without changing Dealer/Resolver contracts.

## Definition Of Done (Tight Aggressive v1)
- Brain implemented as orchestrator + declarative config.
- Preflop action distribution varies by position and pressure.
- Weighted decisions are legal after Resolver clamp.
- AA/KK almost never fold preflop under normal nodes.
- Behavior tuning requires config edits, not pipeline edits.
