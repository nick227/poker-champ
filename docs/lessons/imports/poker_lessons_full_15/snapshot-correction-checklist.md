# Snapshot Correction Checklist (Blocking Before Canonical Promotion)

Date: 2026-03-02
Scope: Imported lesson drafts from `poker_lessons_full_15.json`.

## Blocking Rule
- Do not promote drafts into `docs/lessons/content` until all items below are corrected and revalidated.

## Required Corrections

1. `L06` - KK SB vs BB
- Current issue: snapshot appears generic flop spot (`Ah 8c 4d`) with hero `AsKd`.
- Required correction:
- Hero hand must be `K K`.
- Seat/position context must represent SB vs BB aggression node.
- Action options and pot geometry must match the intended preflop (or explicit stack-off) decision point.
- Post-fix check:
- `question` and grading key (`acceptedCorrectActions`) align with snapshot state.

2. `L14` - Two Pair on Flush Board with Full House Redraw Potential
- Current issue: snapshot appears generic and does not encode flush-board + redraw context.
- Required correction:
- Board texture must clearly include flush pressure.
- Hero hole cards + board must produce two-pair context with realistic full-house redraw potential (if that is the intended branch).
- Action options/pot state must reflect the exact decision node being taught.
- Post-fix check:
- Rubric band mapping (STRONG/REASONABLE/WEAK) still matches board reality.

## Validation Steps After Corrections
1. Re-run `pnpm lessons:import:apply-grading-plan`.
2. Re-run schema + snapshot validation once promoted to canonical content (`pnpm lessons:content:check`).
3. Manually inspect these two lessons in UI:
- one objective baseline (L06 after correction)
- one rubric/subjective board texture (L14 after correction)

## Promotion Gate
- Promotion to canonical content is blocked until:
- L06 and L14 snapshots are corrected,
- grading intent and snapshot state are aligned,
- validator passes.

