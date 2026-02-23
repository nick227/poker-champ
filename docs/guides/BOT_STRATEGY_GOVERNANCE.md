# Bot Strategy Governance

## What Heatmaps Are
Heatmaps are automated behavior telemetry for bot brains.

They show what the brain actually does at runtime over many simulations, not just what config appears to say.

In this codebase, heatmaps are snapshot-based Monte Carlo reports that track action-share distributions per scenario (for each brain family), then compare against committed baselines.

Why this exists:
- Detect strategy drift early.
- Catch accidental behavior changes from config/code refactors.
- Keep bot personalities stable and explainable.

Core stochastic contract:
- Structural steps are deterministic:
  - feature derivation
  - node lookup
  - axis/weight composition
- Final action selection is stochastic and must use seeded RNG.
- Given `(ctx, seed)`, distribution and sampling sequence should be reproducible.

Randomness locality rule:
- Randomness may only be used at final weighted selection (for action/sizing picks).
- Randomness must not appear in feature derivation, lookup, axis math, or config compilation.
- Runtime implementation note:
  - `BotResolver` injects seeded RNG into `BotActionContext` for production decisions.
  - New brains should consume randomness through context RNG utilities, never direct `Math.random()`.

## How To Update Snapshots
Use update mode only when intentionally changing strategy behavior.

TAG:
```bash
pnpm run test:server:bot:heatmap:update
```

Passive/Aggressive profile brains:
```bash
pnpm run test:server:bot:heatmap:profiles:update
```

Where snapshots live:
- `artifacts/heatmaps/tight_aggressive_v1.heat.json`
- `artifacts/heatmaps/tight_passive_v1.heat.json`
- `artifacts/heatmaps/loose_aggressive_v1.heat.json`
- `artifacts/heatmaps/loose_passive_v1.heat.json`

## When Updates Are Acceptable
Snapshot updates are acceptable only when at least one is true:
1. You intentionally changed bot strategy (weights, axes, strengths, profiles, scenarios).
2. You intentionally changed deterministic simulation setup (seed/scenarios/sample count).
3. You intentionally changed the brain family behavior contract and updated docs/tests accordingly.

Snapshot updates are not acceptable when:
- Changes are "just refactors" with no intended strategy impact.
- You are updating snapshots only to silence failing tests.

Rule:
If snapshot changed, PR description must explain why behavior changed.

## How To Read Failures

## 1) Snapshot mismatch failure
Meaning:
- Current simulated behavior differs from committed baseline beyond tolerance.

Action:
1. Run heatmap tests locally.
2. Inspect which scenario/action shares moved.
3. Decide:
   - unintended drift -> fix code/config and keep old snapshot
   - intended change -> update snapshot + document rationale

## 2) Invariant failure
Meaning:
- The brain violated a behavior contract (example: loose-passive raising too much).

Action:
1. Check recent config/weight changes.
2. Verify no overlapping axis/profile over-amplification.
3. Rebalance weights/strengths until invariants pass.

## 3) Assert-range failure (`HEATMAP_ASSERT=1`)
Meaning:
- The strategy moved outside allowed guardrail ranges.

Action:
1. Confirm whether movement is intended.
2. If unintended: tune back into range.
3. If intended and justified: update range bounds with explicit rationale.

Helpful commands:
```bash
pnpm run test:server:bot:heatmap
pnpm run test:server:bot:heatmap:assert
pnpm run test:server:bot:heatmap:profiles
pnpm run test:server:bot:heatmap:profiles:assert
pnpm run test:server:bot:heatmap:update
pnpm run test:server:bot:heatmap:profiles:update
```

## Practical Review Checklist
Before merging strategy changes:
1. Heatmap tests pass.
2. Invariants pass.
3. Snapshot diffs reviewed and explained.
4. No unexplained shifts in core personality behavior.
