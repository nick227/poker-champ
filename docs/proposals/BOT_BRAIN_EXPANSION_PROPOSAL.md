# Bot Brain Expansion Proposal (New Brains + New Bots)

## Purpose
Define a practical rollout plan for adding multiple bot brain families on top of the current governed bot architecture:
- reusable brain pipeline
- declarative config
- axis governance (`ACTIVE | NEUTRAL | FUTURE`)
- resolver clamp supremacy

This proposal focuses on:
1. Which new brains to add.
2. Which bot characters to launch with each brain.
3. A low-risk implementation sequence.

## Scope And Constraints
- Keep `BotResolver` as final legality membrane.
- Resolver output is the single source of truth; brain return values must never be treated as legal/final elsewhere.
- No gameplay-rule logic inside brains.
- Prefer config changes over pipeline changes.
- New brains should reuse the same orchestration shape where possible.
- Ship in phases so behavior stays testable and explainable.
- Brains must not instantiate their own RNG; stochastic picks must use provided seeded RNG utilities.

## Brain Families To Add

## 1) Tight-Aggressive (TAG) [Already Baseline]
Status:
- Already implemented as `tight_aggressive_v1` (Nash Nate baseline).

Use:
- Production baseline.
- Reference profile for future families.

## 2) Tight-Passive (Nit/Rock)
Profile:
- Very selective preflop.
- Continue mostly via call/check.
- Low bluff frequency.
- High fold under pressure.

Gameplay role:
- Easy exploit target.
- Low-complexity training opponent.

Implementation strategy:
- New brain type `tight_passive_v1` OR new config profile if pipeline is identical.
- Reuse TAG tables as seed, then:
  - increase fold/check/call weights
  - reduce raise/bet/all-in weights
  - tighten `ACTIVE` axis strengths on aggression drivers

## 3) Loose-Aggressive (LAG)
Profile:
- Wide preflop participation.
- Frequent raises/3-bets.
- High pressure and bluff rate.
- Higher variance lines.

Gameplay role:
- Advanced opponent.
- High action tables.

Implementation strategy:
- New brain type `loose_aggressive_v1` (same pipeline, different config personality).
- Widen preflop continue gates.
- Increase aggression-oriented axis influence.

## 4) Loose-Passive (Calling Station)
Profile:
- Enters too many pots.
- Calls too often.
- Rarely raises.
- Chases and over-realizes weak equity.

Gameplay role:
- Beginner recreational bot.
- Clear exploit training target.

Implementation strategy:
- New brain type `loose_passive_v1`.
- Wide continue gates with call-heavy postflop action weights.
- Suppress raise/all-in multipliers.

## Extended Style Variants (Phase 2+)
- Ultra Nit: stricter tight-passive.
- Maniac: extreme loose-aggressive.
- ABC Value: straightforward value-heavy TAG.
- Tricky/Deceptive: TAG with selective trap/check-raise overlays.
- Balanced/GTO-ish: mixed policy with stricter invariants.
- Exploitative: opponent-model-driven (requires memory layer; later phase).

## Suggested Bot Roster (Fun Full Names + Underscored IDs)

Naming rules for this roster:
- `id`: underscored slug only.
- `name`: full human-style name with light poker/emotion wordplay.

## TAG Family
- `nash_nate` (existing)
- `raisey_rosa` -> "Rosa Raisewell"
- `value_victor` -> "Victor Valueford"

## Tight-Passive Family
- `foldy_fiona` -> "Fiona Foldsworth"
- `rock_ruben` -> "Ruben Rockwell"
- `nervous_nina` -> "Nina Nerveson"

## Loose-Aggressive Family
- `tiltie_trent` -> "Trent Tiltley"
- `threebet_bree` -> "Brianna Threebet"
- `jammy_jared` -> "Jared Jamison"

## Loose-Passive Family
- `callie_doyle` -> "Callie Doyle"
- `sticky_sonia` -> "Sonia Stickman"
- `chasey_charlie` -> "Charlie Chasemore"

## Extreme Variants (Optional)
- Ultra Nit: `premium_pamela` -> "Pamela Premium"
- Maniac: `mad_mike` -> "Michael Madigan"
- ABC TAG: `textbook_tessa` -> "Tessa Textbook"
- Tricky TAG: `slowplay_silas` -> "Silas Slowplay"

## Recommended BotCatalog Mapping (Target)
Example target map:
- `nash_nate` -> `tight_aggressive_v1`
- `foldy_fiona` -> `tight_passive_v1`
- `tiltie_trent` -> `loose_aggressive_v1`
- `callie_doyle` -> `loose_passive_v1`

Keep additional characters as flavor skins once each family is stable.

## Implementation Plan (Low-Risk)

## Slice 1: Add New Brain Types (Skeletons)
- Extend `BotBrainType` union in `src/engine/bots/BotCatalog.ts`.
- Add registry wiring in `src/engine/bots/BotBrainRegistry.ts`.
- Start each new brain as config-driven variant using existing orchestration pattern.
- Keep fallbacks explicit while incomplete.

## Slice 2: Tight-Passive + Loose-Passive
Reason:
- Easiest contrast pair.
- Lower tuning complexity than LAG.

Deliverables:
- `tight_passive_v1` config + smoke tests.
- `loose_passive_v1` config + smoke tests.
- Add 1-2 characters for each in catalog.

## Slice 3: Loose-Aggressive
Deliverables:
- `loose_aggressive_v1` config + aggression invariants.
- Heat map snapshot and range bounds to prevent single-axis domination.
- Add first LAG character to catalog.

## Slice 4: Flavor Variants (No New Pipeline)
- Add additional bots mapped to same brains.
- Only name/avatar/personality metadata changes.

## Slice 5: Advanced Families (Later)
- Balanced/GTO-ish candidate.
- Exploitative candidate (requires opponent memory features).

## Axis Philosophy Per Family

## TAG
- Balanced math + pressure + position.
- Moderate aggression with discipline.

## Tight-Passive
- Pressure + fold bias high.
- Aggression axes dampened.
- Pot-odds still respected.

## Loose-Aggressive
- Aggression + initiative + position boosted.
- Wider continue gates.
- Pot-odds influence reduced but not removed.

## Loose-Passive
- Call bias boosted.
- Aggression suppressed.
- Draw continuation high, raise conversion low.

## Testing Requirements Per New Brain
Minimum:
1. Config loader tests (shape + invariants + freeze).
2. Smoke behavior tests (impossible/possible action assertions).
3. Monte Carlo invariants (no accidental personality drift).
4. Axis heat map snapshot + optional share range assertions.

Suggested invariants by family:
- Tight-Passive: low raise frequency under neutral spots.
- Loose-Aggressive: high raise/bet frequency in unopened/IP spots.
- Loose-Passive: high call, low raise in facing-bet spots.

## Governance Requirements
Before enabling any new brain in production:
- Resolver clamp path verified.
- No direct `Math.random()` inside brains; only shared seeded RNG flow.
- `ACTIVE` axis count kept controlled (target <= 12).
- No `FUTURE` axis has non-neutral multipliers.
- Heat map snapshot committed.
- Debug trace readable for that brain.

## File Touchpoints
- `src/engine/bots/BotCatalog.ts`
- `src/engine/bots/BotBrainRegistry.ts`
- `src/engine/bots/brains/<new_brain>/*`
- `src/tests/*` (new brain loader/smoke/heatmap tests)
- Optional docs updates:
  - `docs/guides/ADDING_POKER_BRAINS_AND_BOTS.md`
  - `docs/proposals/TIGHT_AGGRESSIVE_AXES_INVENTORY.md` (cross-family notes)

## Definition Of Done (Expansion Phase 1)
- 3 strategy families available and enabled:
  - TAG (existing)
  - Tight-Passive
  - Loose-Passive
- At least one character per family in `BOT_CATALOG`.
- Each family has smoke + Monte Carlo + heat snapshot coverage.
- No resolver-clamp regressions.
