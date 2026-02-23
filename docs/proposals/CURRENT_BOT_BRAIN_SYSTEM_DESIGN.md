# Current Bot Brain System Design

## Goal
Document the current bot brain system exactly as implemented today, then define a clean structure for adding new brains and attaching them to named bots.

This is an architecture/reference doc, not a poker-strategy doc.

## Current Architecture (As Implemented)

### Core Objects
- `BotCatalog` (`src/engine/bots/BotCatalog.ts`)
  - Defines named bot characters (`id`, `name`, `brainType`, `isEnabled`, `avatarUrl?`).
  - Current bots are enabled and mapped to `random_v1`.
  - Provides enabled listing, deterministic sorting, default fallback, and add-bot resolution.

- `BotBrain` contract (`src/engine/bots/BotBrain.ts`)
  - `pickAction(ctx: BotActionContext): ActionPayload`
  - Current concrete implementation: `RandomBotBrain`.
  - Brains must be deterministic given `(ctx + RNG source)`; randomness should be injectable or centrally controlled (even though `random_v1` currently uses global RNG).

- `BotBrainRegistry` (`src/engine/bots/BotBrainRegistry.ts`)
  - `createBotBrain(brainType)` resolves brain implementation from `brainType`.
  - `random_v1` is implemented.
  - `weighted_v1` and `ai_v1` currently log warning and fallback to `RandomBotBrain`.

- `BotResolver` (`src/engine/bots/BotResolver.ts`)
  - Resolves runtime player -> catalog bot -> brain type -> brain.
  - Uses `player.botId` and catalog fallback.
  - Calls `brain.pickAction(ctx)`.

- Turn automation (`src/engine/dealer/services/TurnAutomationService.ts`)
  - Builds bot action context each bot turn.
  - Calls `botResolver.pickAction(player, ctx)`.
  - Enqueues action through existing action pipeline.

### Bot Identity vs Runtime Identity (Current)
- Runtime seat/player id for a bot is generated (`newBotId()`).
- Character id is persisted in `player.botId` (catalog id like `nash_nate`).
- Brain mapping is based on catalog entry for `player.botId`.

This already matches the mental model:
- Character identity in catalog
- Brain mapping in catalog + registry
- Runtime seat binds character via `player.botId`

## Current Script Flow

### 1. List selectable bots
1. Client sends `LIST_BOTS`.
2. `PokerRoom` returns `BOTS_LIST` from `listEnabledBotSummaries()`.
3. Only enabled bots are returned, sorted deterministic by `name ASC`, then `id ASC`.
4. No `brainType` or stats are exposed to client.

### 2. Add a bot to table
1. Client sends `ADD_BOT { botId?, buyInCents, name? }`.
2. `PokerRoom` validates payload and resolves bot via `resolveBotSelectionForAdd()`.
3. `Dealer.addBot()` is called with:
   - runtime bot id
   - display name
   - buy-in
   - `catalogBotId` (character id)
4. `PlayerLifecycleService.addBot()` creates `PlayerState`:
   - `kind = "BOT"`
   - `id = runtime bot id`
   - `botId = catalog bot id`
5. Bot is seated and enters normal table lifecycle.

### 3. Bot acts on turn
1. `TurnAutomationService.maybeActForBot()` identifies current actor.
2. If actor is bot, constructs `BotActionContext` from live table state.
3. Calls `botResolver.pickAction(player, ctx)`.
4. `BotResolver`:
   - reads `player.botId`
   - loads catalog entry
   - resolves brain with `createBotBrain(catalogEntry.brainType)`
5. Brain returns `ActionPayload`.
6. Action is queued via existing dealer enqueue path (`BOT_ACTION_DELAY_MS`).

## Current Brain Input Contract (`BotActionContext`)

Defined in `src/engine/bots/BotBrain.ts`:

```ts
type BotActionContext = {
  heroActionOptions: HeroActionOptions;
  handSnapshot: {
    street: Street;
    potCents: number;
    roundCurrentBetCents: number;
    board: string[];
  };
  seatSnapshot: {
    stackCents: number;
    roundBetCents: number;
    seat: number;
  };
}
```

### What this gives a brain today
- Legal action surface (`heroActionOptions`) including min/max wager constraints.
- Street and pot context.
- Bot stack and round contribution.
- Seat index.

### What is intentionally absent today
- Opponent profiling/history.
- Explicit position labels (UTG/BTN/etc).
- Hand strength/equity features.
- Long-term bot stats.

This is sufficient for `random_v1` and for bootstrapping deterministic/weighted brains in phases.

## Current Random Brain Behavior

`RandomBotBrain`:
- Collects legal actions from `heroActionOptions`.
- Picks one uniformly random.
- For `BET`/`RAISE`, picks random step-based amount between `minRaiseTo` and `maxRaiseTo` (100-cent step).
- Falls back to `FOLD` if no legal actions are discovered.

## Proposed Structure For Adding New Brains

## 1. Keep interfaces stable
- Preserve:
  - `BotCatalogEntry.brainType`
  - `BotBrain.pickAction(ctx)`
  - `BotResolver.pickAction(player, ctx)`
- Add brains by extending registry resolution only.

## 2. Add brains in registry first
- Implement new brain class in `src/engine/bots/brains/` (or `strategies/`).
- Register in `createBotBrain()` switch.
- Keep unknown/unimplemented fallback to `RandomBotBrain`.

## 3. Attach brain to character via catalog
- Add/update catalog row:
  - `id`
  - `name`
  - `brainType: "new_brain_v1"`
  - `isEnabled`
- No Dealer changes required.

## 4. Brain instancing rule (explicit default)
- Brains are expected to be stateless and pure.
- Registry may safely return singleton instances for compliant brains.
- If a brain requires internal mutable state (for example AI session context), it must be:
  - explicitly documented in the brain implementation
  - isolated behind a dedicated adapter
  - treated as an exception, not the norm

## 5. Keep ownership boundaries
- `BotCatalog` maps `botId -> brainType`.
- `BotBrainRegistry` maps `brainType -> code`.
- `BotResolver` composes both.
- Dealer/turn logic only consumes `pickAction()` output.

## Rough Brain Process Slices (For Future Brains)

Use this internal pipeline shape for any non-random brain:

1. Input normalization
- Normalize context and precompute derived values.
- Guard missing/invalid fields.

2. Feature derivation
- Derive cheap features from provided context (street bucket, effective stack bucket, facing bet/call pressure).
- Keep features pure and deterministic.

3. Candidate policy construction
- Build candidate actions from legal options only.
- Optionally assign scores/weights to legal actions.

4. Amount policy (for wager actions)
- Resolve amount candidates inside `[minRaiseTo, maxRaiseTo]`.
- Keep all amounts legal by construction.

5. Selection
- Choose action (deterministic policy or weighted sampling).

6. Output validation (brain-local)
- Brains should attempt to produce legal actions by construction.

7. Telemetry
- Emit structured logs for:
  - selected brain type
  - fallback reason
  - illegal-output clamps

This keeps new brains safe without polluting Dealer.

Note: The authoritative legality clamp is enforced in `BotResolver` for all brains.

## Recommended Incremental Roadmap

### Slice 1: Registry hardening
- Keep `random_v1` primary.
- Add small helper utilities:
  - legal action extraction
  - amount clamping
  - shared `computeDerived(ctx)` helper (brain-owned opt-in derivations; caller does not prepopulate)

### Slice 2: First non-random brain stub
- Implement `weighted_v1` as thin policy skeleton using current context only.
- At minimum: weights vary by street (`PREFLOP`/`FLOP`/`TURN`/`RIVER`).
- Maintain fallback behavior for unsupported branches.

### Slice 3: Context expansion (optional)
- Add derived/explicit features only when needed by actual brain logic.
- Expand `BotActionContext` minimally and version consciously.

### Slice 4: Brain observability
- Add counters/logging around fallback frequency and action distribution.

## Risks and Guardrails
- Risk: brain emits illegal actions.
  - Guardrail: strict legality clamp before enqueue.
- Risk: over-coupling strategy code into Dealer.
  - Guardrail: keep all strategy branching in brain layer only.
- Risk: silent fallback hides implementation bugs.
  - Guardrail: structured warnings with brain type and fallback cause.

## Summary
Current system is already character-first and pluggable:
- Named bot characters are selected from catalog.
- Runtime seats bind a character id (`botId`).
- Brain resolution is delegated via resolver + registry.
- Dealer flow remains strategy-agnostic.

Adding new brains should remain a catalog + registry concern, with no gameplay-rule coupling in Dealer.

## Addendum: Brain Architecture Clarifications

### 1. Brain Purity Invariant
- Brains should be stateless pure functions.
- Brain behavior should be deterministic given `(ctx + RNG source)`.
- Registry can safely return singleton brain instances when a brain implementation is truly stateless.
- If a brain requires internal mutable state (for example AI session context), that requirement must be explicitly documented and justified.

### 2. Legality Clamp Is Mandatory
- All brain output must pass through strict legality clamping before enqueue.
- Required flow:

```ts
brain.pickAction(ctx)
  -> clampToLegalAction(...)
  -> enqueueAction(...)
```

- Clamp requirements:
  - validate against `heroActionOptions`
  - degrade safely (prefer `CHECK`, then `FOLD`)
  - emit structured warning when clamping occurs
- Dealer must never receive illegal actions from bot paths.

### 3. Context Derivation Is Brain-Owned
- Do not expand `BotActionContext` speculatively.
- Keep the core context minimal.
- Use shared `computeDerived(ctx)` helpers for optional feature derivation.
- Derived features must be:
  - deterministic
  - cheap
  - independent of Dealer changes

### 4. Registry Structure
- Prefer a static map registry shape over expanding switch complexity as brains grow.
- Unknown `brainType` must fallback to `random_v1`.
- Ownership boundaries remain:
  - registry does not depend on catalog
  - catalog does not depend on registry

### 5. Weighted Brain Minimum Standard
- First non-random brain must be at least street-aware.
- Minimum baseline:
  - weights indexed by street
  - legal-only action weighting
  - amount resolution constrained to legal bounds
- Position/equity modeling is optional for the first weighted slice.

### 6. Shared Utilities Layer
- Centralize shared bot decision helpers under `bots/utils/` (or equivalent):
  - `getLegalActions(heroActionOptions)`
  - `clampToLegalAction(action, heroActionOptions)`
  - `computeDerived(ctx)`
  - `weightedPick(...)`
- Random and weighted brains should share the same legal-action extraction logic to avoid rule drift.

### 7. Brain Failure Telemetry
- Emit structured logs when:
  - action clamp occurs
  - unknown `brainType` triggers fallback
  - brain returns no viable legal action
- Fallbacks are acceptable; silent fallbacks are not.

### 8. Architectural Non-Goals
- Do not introduce in this phase:
  - strategy DSL/config engine
  - database-driven strategy trees
  - per-table brain instancing complexity
  - Dealer-level branching by bot type
- Adding a brain should remain:
  - new class
  - registry entry
  - catalog mapping change

### 9. System Law
- A bot is a character that references a brain.
- A brain is a pure function that returns a legal action.
- If a future change breaks this law, re-evaluate the design.
