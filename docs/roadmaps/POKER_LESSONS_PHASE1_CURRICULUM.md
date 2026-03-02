# Poker Lessons Phase 1 Curriculum

## 1) Purpose And Scope
This document defines a premium, execution-focused phase-1 Poker School curriculum deliverable with the current lesson engine.

Primary ICP for phase 1:
- Serious online 6-max cash players moving up stakes (roughly 50NL to 200NL)

Secondary audiences (supported, not primary):
- Live 1/2 to 2/5 players
- Motivated beginner/intermediate online players

Phase-1 policy (locked):
- 12 lessons across 3 modules
- 6-max cash only
- Balanced ACTION + MCQ mix
- Soft gating (all visible, recommended order)
- Single-pass per step with immediate feedback; retry by new attempt

Must-have quality bar:
- Practical EV-first training, not abstract quiz content
- Every lesson states: common leak, EV cost, profitable fix
- Realistic hand context: stack depth, sizing, villain archetype, and line credibility
- Decision frameworks players can reuse in real sessions

## 2) Engine Constraints (In/Out For V1)
In-scope runtime capabilities:
- Step types: `INFO_STEP`, `ACTION_STEP`, `MCQ_STEP`
- Single snapshot state per step
- Server-authoritative grading
- Message envelope: `beforeInstructorMessage`, `question`, `response`, `followUpInstructorMessage`
- Version controls: `gradingVersion`, `snapshotVersion`
- Lesson action normalization: `fold`, `check`, `call`, `bet`, `raise`, `all_in`
- Idempotent submit semantics on `(attemptId, stepId)`
- Single instructional surface policy: one lesson half-sheet controls prompts, MCQ, feedback, and progression

Authoring realism constraints:
- Default 100bb effective unless lesson explicitly needs alternate depth
- Human pool sizing patterns (no synthetic/cartoon lines)
- Explicit villain archetype in each graded scenario (`aggro_reg`, `passive_rec`, `under_bluff_pool`, `overfold_pool`)
- No "obvious puzzle" toy spots

Out-of-scope for phase 1:
- Multi-hand branching inside one attempt
- Multiplayer/co-op lessons
- Solver-adaptive trees
- Authoring CMS
- Hard score-lock progression

## 3) Curriculum Architecture (Modules, Sequencing, Soft Gating)
Module framing (player-facing):
- Module A: Stop Bleeding Preflop (Lessons 1-4)
- Module B: Win More Flops (Lessons 5-8)
- Module C: Close The Hand Profitably (Lessons 9-12)

Difficulty labels:
- `BEGINNER`: foundational leak patches
- `CORE`: regular winning-reg decision quality
- `ADVANCED`: mixed-street, thinner edge, exploit-aware decisions

Soft-gating policy:
- All lessons visible
- Recommended path driven by lesson order + concept mastery deficits
- No hard lock; skip-ahead allowed

## 4) Lesson Blueprint Template
Every lesson must include:
- Identity: `lessonId`, title, `moduleCode`, `recommendedOrder`, `difficulty`, `estimatedMinutes`
- `targetAudience`
- Learning objectives: 1-2 measurable outcomes
- Practical framing:
- `commonLeak`
- `evCostStatement`
- `profitableFix`
- Scenario realism payload:
- effective stack depth
- villain archetype
- line assumptions
- Snapshot definition with declared `snapshotVersion`
- Step sequence using `INFO_STEP` / `MCQ_STEP` / `ACTION_STEP`
- Grading contract per graded step:
- deterministic expected key in `gradingSpecJson`
- declared `gradingVersion`
- Instructor copy fields:
- `beforeInstructorMessage`
- `question`
- expected `response` style
- `followUpInstructorMessage`
- Mastery map: 2-4 concept tags + weights
- Wrong-answer feedback map
- Acceptance checklist: content-ready, schema-valid, deterministic grading

Premium copy standard:
- Must include EV language: `+EV`, `-EV`, long-run cost, population exploit angle
- Must include frequency language where relevant: high-frequency, low-frequency, mixed, pure

## 5) Full Phase-1 Lesson Catalog (12 Lessons)

### Lesson 1
- `lessonId`: `L1_open_raise_position_6max`
- Title: Stop Bleeding: RFI Discipline By Position
- Module: `A_STOP_BLEEDING_PREFLOP`
- Difficulty: `BEGINNER`
- Target: serious 50NL-200NL players leaking EP opens
- Learning objective:
- Build profitable RFI discipline by seat
- Remove reverse-implied-EV EP opens
- Practical framing:
- Common leak: over-opening UTG/LJ offsuit broadways and weak suited combos
- EV cost: dominated EP opens create low-realization postflop nodes
- Profitable fix: tighter EP, wider LP with initiative advantage
- Scenario realism: 100bb, unopened pot, standard 2.2-2.5x options, unknown reg pool
- Step sequence: `INFO_STEP -> MCQ_STEP -> ACTION_STEP`
- Grading key: MCQ fixed RFI key; ACTION expected normalized `raise` or `fold`
- Mastery: `position` 1.2, `range_selection` 1.0

### Lesson 2
- `lessonId`: `L2_face_open_3bet_call_fold`
- Title: Punish Opens: 3-Bet/Call/Fold Buckets
- Module: `A_STOP_BLEEDING_PREFLOP`
- Difficulty: `BEGINNER`
- Learning objective:
- Choose profitable preflop response buckets versus opens
- Preserve initiative in high EV nodes
- Practical framing:
- Common leak: flatting hands that print more as 3-bets
- EV cost: passive lines cap upside and increase postflop complexity
- Profitable fix: structured 3-bet/value/polar bucket logic
- Scenario realism: UTG open vs CO response, 100bb, reg archetype
- Step sequence: `INFO_STEP -> ACTION_STEP -> MCQ_STEP`
- Grading key: ACTION expected `raise`; MCQ bucket rationale
- Mastery: `initiative` 1.2, `position` 1.0

### Lesson 3
- `lessonId`: `L3_blind_defense_bb_vs_btn`
- Title: Stop Overfolding Your Big Blind
- Module: `A_STOP_BLEEDING_PREFLOP`
- Difficulty: `CORE`
- Learning objective:
- Apply defend thresholds by price and playability
- Eliminate high-frequency BB surrender leak
- Practical framing:
- Common leak: overfolding BB vs small BTN opens
- EV cost: persistent blind tax from avoidable folds
- Profitable fix: defend threshold framework + postflop plan
- Scenario realism: BTN min-open, 100bb, population over-cbet tendency
- Step sequence: `INFO_STEP -> MCQ_STEP -> ACTION_STEP`
- Grading key: MCQ threshold key; ACTION expected `call`
- Mastery: `pot_odds` 1.2, `defense_frequency` 1.0

### Lesson 4
- `lessonId`: `L4_iso_raise_vs_limpers`
- Title: Isolate For EV: Versus Limp-Heavy Pools
- Module: `A_STOP_BLEEDING_PREFLOP`
- Difficulty: `CORE`
- Learning objective:
- Attack limp-heavy pools with profitable isolation sizings
- Reduce passive overlimp behavior
- Practical framing:
- Common leak: overlimping value-dense playable hands
- EV cost: giving free realization to weak ranges
- Profitable fix: iso-raise with deterministic size bands by stack depth
- Scenario realism: one limper, hero IP, 100bb, passive-rec archetype
- Step sequence: `INFO_STEP -> ACTION_STEP -> MCQ_STEP`
- Grading key: ACTION `raise` with amount bounds; MCQ sizing intent
- Mastery: `initiative` 1.1, `sizing_basics` 1.0

### Lesson 5
- `lessonId`: `L5_cbet_dry_board`
- Title: Static Boards: High-Frequency Small C-Bets
- Module: `B_WIN_MORE_FLOPS`
- Difficulty: `CORE`
- Learning objective:
- Maximize EV on static flops using range advantage
- Select size based on denial and value capture goals
- Practical framing:
- Common leak: checking profitable high-frequency c-bet spots
- EV cost: missed fold equity and missed thin value
- Profitable fix: small high-frequency c-bet framework
- Scenario realism: SRP HU dry texture, reg-vs-reg line
- Step sequence: `INFO_STEP -> ACTION_STEP -> MCQ_STEP`
- Grading key: ACTION expected `bet` in defined size band; MCQ rationale
- Mastery: `cbet_theory` 1.2, `range_advantage` 1.0

### Lesson 6
- `lessonId`: `L6_check_back_control`
- Title: Pot Control Nodes: Check-Back Discipline
- Module: `B_WIN_MORE_FLOPS`
- Difficulty: `CORE`
- Learning objective:
- Distinguish mandatory c-bets from profitable controls
- Preserve showdown EV without bloating dominated pots
- Practical framing:
- Common leak: auto-c-betting medium showdown value
- EV cost: unnecessary high-variance nodes with marginal hands
- Profitable fix: check-back now, structured turn re-entry later
- Scenario realism: medium-SDV hand on denial-light flop
- Step sequence: `INFO_STEP -> MCQ_STEP -> ACTION_STEP`
- Grading key: MCQ control logic; ACTION expected `check`
- Mastery: `pot_control` 1.2, `showdown_value` 1.0

### Lesson 7
- `lessonId`: `L7_draws_and_pot_odds`
- Title: Draws Without Spew: Price, Equity, Realization
- Module: `B_WIN_MORE_FLOPS`
- Difficulty: `CORE`
- Learning objective:
- Convert pot price and draw equity into profitable continue/fold
- Stop negative-EV draw chasing
- Practical framing:
- Common leak: calling with insufficient direct/implied price
- EV cost: compounding small -EV calls
- Profitable fix: required-equity quick check before acting
- Scenario realism: 100bb flop draw spot, realistic sizing versus pool c-bet
- Step sequence: `INFO_STEP -> MCQ_STEP (confidence check) -> ACTION_STEP`
- Grading key: MCQ odds key; ACTION expected `call` or `fold` by config
- Mastery: `pot_odds` 1.2, `equity_realization` 1.0

### Lesson 8
- `lessonId`: `L8_flop_defense_leaks`
- Title: 3 Flop Defense Leaks Costing You Money
- Module: `B_WIN_MORE_FLOPS`
- Difficulty: `CORE`
- Learning objective:
- Correct overfold and overcall leaks versus c-bets
- Apply threshold defense with exploit context
- Practical framing:
- Common leak: folding too much in high-realization spots, calling too loose with weak bluff-catchers
- EV cost: overfold tax or overcall bleed depending on pool
- Profitable fix: defend by price + hand class + archetype
- Scenario realism: under-bluff or over-cbet archetype flag included
- Step sequence: `INFO_STEP -> ACTION_STEP -> MCQ_STEP`
- Grading key: ACTION continue/fold; MCQ threshold explanation
- Mastery: `defense_thresholds` 1.1, `pot_odds` 1.0

### Lesson 9
- `lessonId`: `L9_turn_barrel_or_slow`
- Title: Turn Barrel Discipline Versus Pool Tendencies
- Module: `C_CLOSE_HAND_PROFITABLY`
- Difficulty: `ADVANCED`
- Learning objective:
- Barrel high-EV runouts and slow down on equity-killing turns
- Connect runout class to range interaction
- Practical framing:
- Common leak: autopilot second barrels
- EV cost: turn spew and river node degradation
- Profitable fix: runout-class barreling matrix
- Scenario realism: reg pool node with known overfold tendency option
- Step sequence: `INFO_STEP -> ACTION_STEP -> MCQ_STEP`
- Grading key: ACTION `bet`/`check` by runout; MCQ board-evolution rationale
- Mastery: `barreling` 1.2, `board_evolution` 1.0

### Lesson 10
- `lessonId`: `L10_river_value_vs_check`
- Title: Thin Value Discipline At 100bb
- Module: `C_CLOSE_HAND_PROFITABLY`
- Difficulty: `ADVANCED`
- Learning objective:
- Target worse hands precisely on river
- Avoid accidental bluff conversion with medium SDV
- Practical framing:
- Common leak: checking profitable thin value or over-valuing into uncapped lines
- EV cost: missed value and avoidable bluff-catch losses
- Profitable fix: "who calls worse" plus sizing alignment
- Scenario realism: capped villain line, realistic bet-size menu
- Step sequence: `INFO_STEP -> MCQ_STEP -> ACTION_STEP`
- Grading key: MCQ value-target key; ACTION `bet` or `check`
- Mastery: `thin_value` 1.2, `showdown_decisions` 1.0

### Lesson 11
- `lessonId`: `L11_bluff_catch_fundamentals`
- Title: River Bluff-Catch: Don't Torch Buy-Ins
- Module: `C_CLOSE_HAND_PROFITABLY`
- Difficulty: `ADVANCED`
- Learning objective:
- Use blockers and line credibility to select bluff-catches
- Reduce low-quality hero-call frequency
- Practical framing:
- Common leak: ego calls with bad unblockers vs under-bluff pools
- EV cost: high-impact river punts
- Profitable fix: confidence check then action using blocker/frequency framework
- Scenario realism: polarized river bet with archetype tag
- Step sequence: `INFO_STEP -> MCQ_STEP (confidence check) -> ACTION_STEP`
- Grading key: MCQ blocker/frequency; ACTION `call` or `fold`
- Mastery: `bluff_frequency` 1.1, `blockers_intro` 1.0

### Lesson 12
- `lessonId`: `L12_capstone_mixed_spot`
- Title: Capstone Hand Review: Think Like A Winning Reg
- Module: `C_CLOSE_HAND_PROFITABLY`
- Difficulty: `ADVANCED`
- Learning objective:
- Execute coherent cross-street EV planning
- Demonstrate transfer across preflop, flop, and turn nodes
- Practical framing:
- Common leak: disconnected decisions with no line coherence
- EV cost: inconsistent lines that cap value and increase spew
- Profitable fix: one integrated decision framework across streets
- Scenario realism: deterministic per-step snapshots representing one realistic 100bb hand line
- Step sequence: `INFO_STEP -> ACTION_STEP -> MCQ_STEP -> ACTION_STEP -> INFO_STEP (payoff summary)`
- Grading key: all graded steps deterministic with explicit expected keys
- Mastery: `position` 1.0, `pot_odds` 1.0, `cbet_theory` 1.0, `barreling` 1.0
- Capstone payoff requirement: final INFO shows mastery delta and top reinforced concepts

## 6) Rollout Plan (Waves, QA Gates, Acceptance)
Wave 1 (internal):
- Lessons: 1-5 and 7
- Goal: validate retention, practical credibility, and preflop/flop + math utility

Wave 2 (staged):
- Lessons: 6, 8, 9, 10
- Goal: validate exploit-aware mid/late-street reasoning and mastery stability

Wave 3 (full phase-1 launch):
- Lessons: 11, 12
- Goal: validate advanced river confidence and capstone payoff

Release gates per wave:
- Content QA pass
- Snapshot schema/version validation
- Deterministic grading replay checks
- Idempotent re-submit verified
- Analytics instrumentation verified

Acceptance criteria for launch:
- All 12 lessons content-ready and schema-valid
- All graded steps deterministic and versioned
- Lesson 1 passes "easy + empowering + practical" standard
- Capstone includes mastery payoff summary
- Recommended path visible in UI

## 7) Analytics And Success Metrics
Required events:
- `lesson_started`
- `step_submitted`
- `step_graded`
- `lesson_completed`
- `lesson_abandoned`
- `mastery_updated`

Must-have product metrics:
- Start-to-complete rate by module
- Accuracy by concept and villain archetype
- Time-to-complete
- Re-attempt rate
- Recommended-path adherence

Credibility metrics:
- Snapshot/version mismatch errors
- Unsupported grading version errors
- Idempotent replay response rate
- Client/server grading mismatch rate (target zero)

Leak feedback metrics (phase-1 delivery requirement):
- Weakest concept identification coverage
- Suggested next-lesson click-through
- "Biggest leak" banner engagement after minimum lesson count

## 8) Risks And Mitigations
Risk: Feels generic/academic for serious regs.
Mitigation: enforce EV-first, leak-cost-fix, and population-exploit language in copy QA.

Risk: Credibility gap versus premium training brands.
Mitigation: realistic scenarios, deterministic grading, and explicit reasoning standards.

Risk: Difficulty curve too flat or too steep.
Mitigation: Module A clarity-first; Module B/C use confidence checks and exploit context.

Risk: Grading drift over time.
Mitigation: strict `gradingVersion` discipline and immutable historical specs.

Risk: Mastery inflation.
Mitigation: idempotent `(attemptId, stepId)` submit semantics and single-pass step policy.

## 9) Optional Schema Additions For Phase 1.1
Optional (non-blocking for phase-1 launch):
- `Lesson.moduleCode` (string)
- `Lesson.recommendedOrder` (int)
- `Lesson.learningObjectivesJson` (json)
- `Lesson.prerequisiteLessonIdsJson` (json)
- `LessonConcept.category` (string)
- `Lesson.villainArchetype` (string or json enum)
- `LessonStep.frequencyHint` (string; e.g. `high`, `low`, `mixed`, `pure`)

Future-proofing pattern:
- Treat lesson as concept anchor; later add variant snapshots under explicit versioning.

## 10) Must-Have Product Layer (Phase-1 Required UX)
To feel like a training tool, not content:
- Mastery dashboard: concept bars, accuracy, weakest/strongest concepts, recommended next lesson
- Biggest leak banner: shown after minimum completed lessons with heuristic explanation
- Session loop integration stub: surface relevant lesson recommendation after replay review flows

## 11) Lesson UX Surface And State Machine (Phase-1 Required)
Single teaching surface decision (locked):
- Use one vertical half-sheet slide-up as the instructional surface for all lesson steps.
- Table is illustrative context above the sheet; instructional control never moves to toasts.
- No grading or progression logic in transient toasts.

`LessonSurface` composition:
- `ActiveTableView` (`tableMode="lesson"`)
- `LessonHalfSheet` (all instructor content and transitions)

Half-sheet owns all instructional content:
- `beforeInstructorMessage`
- `question`
- MCQ options (for `MCQ_STEP`)
- grading result (`response`)
- follow-up coaching (`followUpInstructorMessage`)
- `Next` progression action
- optional media slot (future-proof, non-blocking in phase 1)

Step panel state machine (implementation-ready):
- `BEFORE` (optional, when before-message exists)
- `QUESTION` (input enabled)
- `SUBMITTING` (inputs disabled)
- `RESULT` (response + follow-up + next)
- `ADVANCING` (brief transition)

ActionBar policy for `ACTION_STEP` (locked):
- Use the real live ActionBar controls for user action input.
- Do not create lesson-specific duplicate action buttons.
- Do not move poker action controls into the half-sheet.
- After submit, ActionBar is disabled while half-sheet shows graded feedback.

Minimal integration mechanism:
- Add `onActionOverride?: (action) => void` at the ActionBar boundary.
- In lesson mode, `onActionOverride` routes action payload into lesson submit flow.
- In live mode, ActionBar uses existing realtime handler unchanged.
- Normalize outbound action before submit (`LessonActionPayload`) and grade server-side.

Interaction lock matrix:
- `INFO_STEP`: ActionBar disabled, sheet continue enabled
- `MCQ_STEP`: ActionBar disabled, sheet options enabled
- `ACTION_STEP` pre-submit: ActionBar enabled, sheet prompt visible
- `ACTION_STEP` post-submit: ActionBar disabled, sheet feedback visible
- `RESULT`: ActionBar disabled, sheet `Next` enabled

Submission UX requirements:
- On action submit, freeze ActionBar immediately.
- Show half-sheet pending state: `Evaluating decision...`
- Keep deterministic state flow: submit -> server grade -> result -> next.

## Testing Scenarios (Curriculum-Level Requirements)
Content-level:
- Each lesson has at least one `ACTION_STEP` and one `MCQ_STEP` unless explicitly documented.
- Every graded step has deterministic expected keys.
- Every lesson includes leak, EV cost, and profitable fix framing.

Runtime-level:
- Attempt resume returns same in-progress attempt.
- Re-submit same step does not double-apply mastery.
- Mixed-step transitions behave correctly, including confidence-check MCQ paths.
- Snapshot/version mismatch fails safely with clear error.

Experience-level:
- Soft-gating recommendations visible.
- Single-pass policy enforced.
- Feedback clarity rubric passes.
- Lesson 1 satisfaction check passes.
- Biggest leak banner accuracy check passes on seeded users.
- Single teaching surface consistency check passes (no grading toasts, no duplicate action UIs).
- `ACTION_STEP` uses live ActionBar path with correct submit/disable/result transitions.

## Assumptions And Defaults
- Format: 6-max cash only.
- Primary ICP: serious online players moving up stakes.
- Runtime primitives unchanged (`INFO_STEP`, `ACTION_STEP`, `MCQ_STEP`).
- Multi-hand branching out of scope.
- Curriculum maps directly to seed authoring and rollout operations.
