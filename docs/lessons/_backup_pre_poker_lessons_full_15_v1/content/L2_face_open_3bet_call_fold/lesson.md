# L2 Facing Open: 3-Bet vs Call vs Fold

## Intent
Improve preflop response buckets and initiative quality.

## Common leak
- Autopilot flats in nodes where 3-bet or fold has better long-run EV.

## Why it costs money
- Passive response buckets cap upside and create harder postflop trees.
- Initiative loss at preflop leaks EV on later streets.

## Learning outcomes
- Separate value/bluff/call/fold buckets by position and pool tendencies.
- Avoid autopilot flats that reduce tree-wide EV.

## 10k-hand tracking target
- Track CO vs UTG response mix (`3bet%`, `call%`, `fold%`) and reduce passive over-calls.

## Notes
- Includes one V2-migrated ACTION step for reveal validation.
- Reveal layer: `ev_impact`.
