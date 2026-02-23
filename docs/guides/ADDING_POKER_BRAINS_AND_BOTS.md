# Adding Poker Brains And Bots

## Purpose
This guide explains how to:
1. Add a new bot brain implementation.
2. Add one or more new bot characters that use an existing or new brain.

The core rule is:
`Dealer` does not know strategy details.  
Brains propose a candidate action; `BotResolver` clamps legality.

## Conceptual Model
Brains are pure decision oracles:

`Context -> Brain -> ProposedAction -> BotResolver -> LegalAction`

Key properties:
- Brains never mutate game state.
- Brains never enforce legality.
- Brains never read persistence.
- Brains are deterministic in structure and use seeded randomness for final sampling.
- Brains must not instantiate their own RNG; randomness must flow through provided seeded utilities.

Why this matters:
It prevents strategy/state leakage and keeps the resolver as the single legality authority.
It also keeps stochastic behavior reproducible for debugging and tests.

## Current Architecture (Quick Map)
- `src/engine/bots/BotBrain.ts`
  Defines `BotActionContext`, `BotBrain`, and `RandomBotBrain`.
- `src/engine/bots/BotCatalog.ts`
  Declares visible bot characters (`id`, `name`, `brainType`, `isEnabled`).
- `src/engine/bots/BotBrainRegistry.ts`
  Maps `brainType -> BotBrain` singleton.
- `src/engine/bots/BotResolver.ts`
  Selects catalog entry + brain, calls `pickAction`, clamps via `clampToLegalAction(...)`.
- `src/engine/bots/brains/tight_aggressive/*`
  Example production brain with declarative config, loader, lookup, transforms, and tests.

Brain contract (conceptual shape):
```ts
export interface BotBrain {
  pickAction(ctx: BotActionContext): ProposedBotAction;
}

type ProposedBotAction =
  | { type: "FOLD" }
  | { type: "CHECK" }
  | { type: "CALL" }
  | { type: "BET"; amountCents?: number }
  | { type: "RAISE"; amountCents?: number }
  | { type: "ALL_IN" };
```
Note: runtime transport currently uses `ActionPayload` with `action` field; the snippet above is a mental model anchor for contributors.

## Current Brain And Bot Options

### Brain Types (`BotBrainType`)
Defined in `src/engine/bots/BotCatalog.ts`:
- `random_v1` (implemented)
- `weighted_v1` (currently falls back to `random_v1` with warning; sandbox slot for experimenting with policy styles before promoting to a governed production brain)
- `tight_aggressive_v1` (implemented)
- `tight_passive_v1` (implemented)
- `loose_aggressive_v1` (implemented)
- `loose_passive_v1` (implemented)
- `ai_v1` (currently falls back to `random_v1` with warning)

Registry behavior is defined in `src/engine/bots/BotBrainRegistry.ts`.

### Enabled Bot Characters (`BOT_CATALOG`)
Current enabled entries in `src/engine/bots/BotCatalog.ts`:
- `chaos_carl` -> `random_v1`
- `nash_nate` -> `tight_aggressive_v1`
- `loose_lucy` -> `random_v1`
- `foldy_fiona` -> `tight_passive_v1`
- `tiltie_trent` -> `loose_aggressive_v1`
- `callie_doyle` -> `loose_passive_v1`

These entries are exposed via:
- `GET /api/bots`
- `GET /api/bots/:id/stats`

## When To Create A New Brain vs New Bot
Create a new bot character when:
- Same strategy, different name/avatar/personality flavor.

Create a new brain type when:
- Different strategic philosophy.
- Different axis set.
- Different node lookup model.
- Different tuning surface.

Rule of thumb:
- If tuning tables alone can achieve it -> new bot.
- If pipeline shape must change -> new brain.

## Part A: Add A New Brain Type

## 1) Add `brainType` in catalog type union
Edit `src/engine/bots/BotCatalog.ts`:
- Extend `BotBrainType` with your new id (example: `"tight_passive_v1"`).

## 2) Create brain module directory
Recommended structure:
`src/engine/bots/brains/<brain_name>/`

Minimum files:
- `<BrainName>Brain.ts` (implements `BotBrain`)
- `config/<brainName>.config.ts` (authoring data)
- `runtime/load<BrainName>Config.ts` (validate + compile + freeze config)
- `types.ts` (brain-local config and derived-feature types)

If axis-based, mirror tight-aggressive patterns:
- `classifiers/deriveFeatures.ts`
- `lookup/resolvePreflopNode.ts` / `resolvePostflopNode.ts`
- `transforms/resolveActionWeights.ts`
- `transforms/applyAxes.ts`
- `transforms/resolveSizingRecipe.ts`

## 3) Wire brain singleton in registry
Edit `src/engine/bots/BotBrainRegistry.ts`:
1. Import config + loader + brain class.
2. Create singleton:
`const myBrainSingleton = new MyBrain(loadMyConfig(myConfig));`
3. Add mapping to `botBrainRegistry`.
4. Keep fallback warnings for unimplemented types as needed.

## 4) Keep resolver boundary unchanged
Do not bypass `BotResolver` legality clamp.
`BotResolver` must remain the final membrane for invalid/oversized actions.

## 5) Add tests for the brain
Add at least:
- Config loader validation tests.
- Smoke behavior tests.
- If stochastic strategy: Monte Carlo invariants.
- If axis model exists: heat map test/snapshot.

Reference existing tests:
- `src/tests/tight-aggressive-config-loader.test.ts`
- `src/tests/tight-aggressive-brain-smoke.test.ts`
- `src/tests/tight-aggressive-axis-heatmap.test.ts`

## Part B: Add New Bot Characters

## 1) Add catalog entries
Edit `src/engine/bots/BotCatalog.ts` `BOT_CATALOG`:
- Add unique `id` (stable API/storage key).
- Set `name`.
- Set `brainType` to existing or new brain type.
- Set `isEnabled`.
- Optional `avatarUrl`.

Example:
```ts
{ id: "nit_nora", name: "Nit Nora", brainType: "tight_passive_v1", isEnabled: true }
```

Naming convention:
- `id` must be underscored slug style (recommended pattern: `^[a-z0-9_]+$`).
- `name` should be human-readable and may include spaces (full-name style preferred).
- Keep `id` stable forever once shipped (API + stats key).

Example (preferred full-name style):
```ts
{ id: "tiltie_trent", name: "Trent Tiltley", brainType: "loose_aggressive_v1", isEnabled: true }
```

## 2) Verify API surface
Bots list/stats routes use catalog:
- `src/http/BotRouter.ts`

If you only add a catalog entry, `/api/bots` and `/api/bots/:id/stats` should expose it automatically when enabled.

## 3) Verify fallback/default behavior
- `getDefaultBotCatalogEntry()` should still return a valid enabled bot.
- `resolveBotSelectionForAdd(...)` should behave correctly for unknown/disabled ids.

Covered by:
- `src/tests/bot-catalog.test.ts`
- `src/http/__tests__/BotRouter.test.ts`

## Part C: Safety And Governance Checklist

Use this before merging a new brain/bot.

1. Legality
- Brain may propose illegal actions.
- `BotResolver` clamps and logs; never skip this path.
- Resolver output is the single source of truth. Brain return values must never be assumed legal or final anywhere else in the system.

2. Determinism of config loading
- Validate schema.
- Validate non-negative weights.
- Compile to runtime form.
- Deep-freeze compiled config.

3. Strategy observability
- Enable decision trace in debug mode.
- Include node id, base/final weights, axis contributions, chosen action/sizing.

4. Axis governance (if using axes)
- Every axis has `axisMeta` tier: `ACTIVE | NEUTRAL | FUTURE`.
- Loader enforces:
  - `ACTIVE`: has at least one multiplier `!= 1`.
  - `NEUTRAL`/`FUTURE`: all multipliers are neutral.
- Use `strength` with exponentiation semantics:
`finalMultiplier = bucketMultiplier ** strength`.
- Golden rule:
  - Axes may only multiply action weights.
  - Axes may never filter actions, clamp amounts, introduce branching logic, or reference legality.

5. Drift control
- Keep heat snapshot in repo:
`artifacts/heatmaps/<brain>.heat.json`
- Track influence share distribution over time.

## Part D: Commands To Run

Core bot tests:
```bash
pnpm exec vitest run src/tests/bot-catalog.test.ts src/tests/bot-resolver.test.ts src/http/__tests__/BotRouter.test.ts
```

Tight-aggressive reference suite:
```bash
pnpm exec vitest run src/tests/tight-aggressive-config-loader.test.ts src/tests/tight-aggressive-brain-smoke.test.ts src/tests/tight-aggressive-axis-heatmap.test.ts
```

Heat map workflows:
```bash
pnpm run test:server:bot:heatmap
pnpm run test:server:bot:heatmap:update
pnpm run test:server:bot:heatmap:assert
```

Typecheck:
```bash
pnpm run -s server:typecheck
```

## Common Mistakes

1. Adding bot to catalog without adding brain type to `BotBrainType`.
2. Adding brain type but forgetting registry mapping.
3. Encoding legality rules inside brain instead of resolver clamp.
4. Making all axes ACTIVE at once without heat map governance.
5. Skipping Monte Carlo invariants for stochastic logic.

## Suggested Workflow For New Brain Families

1. Implement minimal viable strategy (few axes/nodes).
2. Add smoke tests for hard impossibilities/possibilities.
3. Add heat map + snapshot.
4. Add range assertions only after baseline stabilizes.
5. Expand axis surface gradually using `NEUTRAL`/`FUTURE` tiers.

## Brain Graduation Checklist
Before enabling a brain in production:
- Smoke tests pass.
- Monte Carlo invariants are added.
- Heat snapshot is committed.
- `ACTIVE` axis count is `<= 12`.
- No `FUTURE` axis has non-neutral multipliers.
- Debug trace is readable and useful.
