# Poker School Premium Content Pack (Phase 1, Lessons 1-3)

## 1) Purpose
This document defines premium, pro-targeted lesson content for the first three Poker School lessons.

Audience:
- Professional and near-professional online 6-max cash players (primary: 50NL to 500NL)
- Players evaluating this product against boot camps, coaching sites, and solver study groups

Content standard:
- Every lesson must show technical value (ranges, frequencies, EV logic, pool exploits)
- Every lesson must tie decisions to money made or money saved
- Every dense concept must be preceded by easy-to-consume setup language

Positioning statement:
- This is not a quiz app.
- This is a decision-quality and bankroll-protection system.
- Phase 1 output should feel like measurable winrate improvement, not content consumption.
- This should feel like a private high-stakes coach in your pocket, not another content library.

Value promise language (site-ready):
- Train like a pro. Think in EV. Execute with confidence.
- Turn hidden leaks into bankroll growth.
- Stop guessing. Start printing.

What the player gets immediately:
- A clear decision framework they can use in their very next session
- A quantified leak estimate in bb/100 and dollars
- A single stat to track over the next 10k hands
- A next-lesson prescription based on weakest concept

## 2) Premium Signal Layer (What Serious Players Need To Trust)
A lesson is "premium" only when all three signals are present:

1. Pool specificity:
- Include concrete pool priors (example ranges below), not generic archetype labels only.

2. Non-obvious insight:
- At least one statement per lesson that challenges common reg autopilot.

3. Long-run edge framing:
- Show both dollar impact and winrate-share impact.

Suggested baseline priors for copy (adjust by network format):
- 100-200NL Zoom/Fast pools: BTN RFI often around 45% to 50%.
- Versus LJ opens, population 4-bet frequencies are often low (single-digit, commonly below 5% in many pools).
- River SRP pools are frequently under-bluffed relative to MDF requirements.

Use priors as context, not absolute truth:
- Copy should say "often", "in many pools", or "typical reg pools".

Sales-forward framing line:
- We do not teach poker theory in a vacuum. We train you to beat the pool in front of you.

## 3) Copy Standard: Casual Setup -> Technical Core -> Edge Impact
Use this 3-layer structure in every graded step.

1. Casual setup (1-2 short lines)
- Purpose: lower cognitive load and frame urgency.
- Example: "This is where regs quietly leak money every session."

2. Technical core (range/frequency/EV)
- Include at least one of:
- frequency language: high-frequency, mixed, pure
- simplified range logic: capped/uncapped, dominated, realization
- calculation: pot odds, break-even fold %, EV deltas

3. Edge impact line (mandatory)
- Include both:
- dollar framing
- winrate-share framing

Winrate-share formula:
- `winrate_share_lost = leak_bb100 / current_wr_bb100`
- Example: if current WR is 3.0 bb/100 and leak is 0.40 bb/100, then loss is `0.40 / 3.0 = 13.3%` of total winrate.

Dollar formula:
- `$ impact = (bb/100 edge delta) * (stake value per bb) * (hands / 100)`

Standard conversion assumptions:
- 100NL: 1bb = $1
- 200NL: 1bb = $2
- 500NL: 1bb = $5

Sales punch line:
- Small edges are not small at volume. They are the difference between spinning wheels and moving up.

## 4) UX Delivery Pattern For Dense Premium Content
Primary instructional surface:
- Lesson half-sheet remains the single teaching surface for prompts, grading, and progression.

Optional top toast usage (allowed, non-blocking only):
- Use for emphasis, not grading.
- Toast content types:
- quick insight highlight
- risk warning
- bankroll impact callout

Do not use toasts for:
- correctness verdict
- full feedback explanation
- progression controls

Numeric toast style standard:
- Use numbers and thresholds, not adjectives.
- Example: "Leak Alert: 8% overfold in BB ~= -1.0 bb/100 in passive pools."
- Example: "Edge Note: +0.25 bb/100 at 200NL over 60k hands ~= +$300/month."

Site copy angle:
- Every decision gets graded. Every leak gets named. Every fix gets monetized.

## 5) Lesson 1 Premium Spec
Lesson ID:
- `L1_open_raise_position_6max`

Working title:
- Stop Bleeding: RFI Discipline by Position

Core promise:
- Build a seat-based open framework that removes dominated opens and improves preflop EV capture.

Sales headline variant:
- "Plug one preflop leak, recover thousands over a year."

### A) Practical Leak
- Leak: opening too wide in EP/LJ with reverse-implied holdings.
- Why regs still leak: they memorize charts but ignore pool 3-bet pressure, rake drag, and realization penalties OOP.

### B) Technical Core
Key concepts:
- RFI by position should expand with positional advantage and realization quality.
- EP dominated opens are low-realization and face stronger continuing ranges.
- Mixed fringe opens should compress to pure folds in high-rake, tough pools.

Non-obvious insight requirement:
- Example coaching line: "In many 100-200NL rake-heavy pools, marginal LJ offsuit broadway opens can perform near breakeven after rake + 3-bet pressure, despite appearing playable in static charts."

Suggested frequency language:
- UTG/LJ fringe offsuit broadways: low-frequency to pure fold in tougher pools.
- CO/BTN suited wheel and suited connector classes: increasing frequency opens.

### C) Edge Impact
Illustrative EV delta:
- If player removes 0.20 bb/100 in bad EP opens:
- 100NL, 50k hands: `0.20 * $1 * 500 = $100/month`
- 200NL, 50k hands: `$200/month`

Winrate-share impact:
- If player WR is 3.0 bb/100 and leak is 0.40 bb/100, leak consumes `13.3%` of total winrate.

Sales framing:
- Giving up 13% of your edge in one repeated node is not a leak, it's a tax.

### D) Step-Level Content
Step 1 (`INFO_STEP`) casual setup:
- "Most moving-up regs don't lose in big punts first. They bleed in preflop autopilot."

Step 1 technical payload:
- Show seat map with realization tax markers by position.
- Rule: "Earlier seat = stronger continuing ranges vs you = tighter open requirement."

Step 2 (`MCQ_STEP`) question:
- "LJ, 100bb, standard reg pool. Which baseline is highest EV for this combo class?"

Step 2 incorrect feedback (analytical tone):
- "In tough reg pools this open performs near breakeven after rake and 3-bet pressure. That makes it a high-variance, low-edge inclusion."

Step 3 (`ACTION_STEP`) action prompt:
- "Use the real ActionBar. Take your actual in-game decision."

Post-submit follow-up:
- "This node is high-frequency. Protecting even 0.10 to 0.20 bb each cycle compounds meaningfully over your next 10k to 50k hands."

### E) Optional Top Toasts
- Pre-submit: "Insight: EP opens are an EV filter, not a pride test."
- Post-result: "Winrate Impact: 0.40 bb/100 leak ~= 13% of a 3 bb/100 winner's edge."

### F) 10k-Hand Tracking Target
- Stat to watch: RFI by seat (UTG/LJ/CO/BTN)
- Expected movement: tighter EP frequencies with stable/improved overall WR contribution from EP opens

## 6) Lesson 2 Premium Spec
Lesson ID:
- `L2_face_open_3bet_call_fold`

Working title:
- Punish Opens: 3-Bet / Call / Fold Buckets

Core promise:
- Convert passive preflop responses into initiative-driven EV capture while avoiding dominated flats.

Sales headline variant:
- "Stop donating preflop. Start owning the betting lead."

### A) Practical Leak
- Leak: over-calling open raises with hands that earn more EV as 3-bets or folds.
- Pool exploit context: many mid-stakes pools under-defend versus well-sized 3-bets.

### B) Technical Core
Key concepts:
- Decision buckets must be role-based:
- value 3-bet region
- bluff 3-bet region
- call region (realization + domination control)
- pure fold region
- Position shifts bucket widths.

Initiative compounding insight (required):
- "3-betting here doesn't just win immediate preflop EV. It simplifies flop strategy, increases c-bet EV in initiative-led trees, and reduces reverse-implied turn nodes."

Calculation block:
- Break-even 3-bet bluff fold equity threshold:
- `FE_break_even ~= Risk / (Risk + Reward)`
- Example: risk 8bb to win 2.5bb => `8 / 10.5 = 76%` immediate folds in pure bluff model.
- Clarifier: this is an upper-bound baseline because called equity and postflop realization add EV.

### C) Edge Impact
Illustrative edge:
- Improving response quality by 0.25 bb/100:
- 100NL, 60k hands: `$150/month`
- 200NL, 60k hands: `$300/month`

Winrate-share impact:
- For a 2.5 bb/100 winner, 0.25 bb/100 leak equals `10%` of total winrate.

Sales framing:
- If one node is burning 10% of your edge, you're not stuck; you're misallocated.

### D) Step-Level Content
Step 1 (`INFO_STEP`) casual setup:
- "If your default is call, you're usually capping your edge."

Step 1 technical payload:
- Show 4 response buckets with position overlays.
- Add pool note: "Versus over-folding opens, expand blocker-based 3-bet bluffs."

Step 2 (`ACTION_STEP`) action prompt:
- "CO vs UTG open. Use real ActionBar and commit your highest-EV baseline line."

Step 3 (`MCQ_STEP`) question:
- "Why is this line highest EV in this node?"

Response/follow-up standard:
- Must reference fold equity, domination control, initiative gain, and downstream tree simplification.

### E) Optional Top Toasts
- Pre-action: "Leak Alert: Passive flats here can forfeit 0.15 to 0.30 bb/100 over volume."
- Post-result: "Tree Impact: Initiative now improves flop EV and simplifies turns."

### F) 10k-Hand Tracking Target
- Stat to watch: CO vs UTG 3-bet %, call %, fold %
- Expected movement: reduced autopilot flats; cleaner bucket separation

## 7) Lesson 3 Premium Spec
Lesson ID:
- `L3_blind_defense_bb_vs_btn`

Working title:
- Stop Overfolding Your Big Blind

Core promise:
- Build a defend framework that prevents high-frequency blind tax and preserves long-run winrate.

Sales headline variant:
- "Win back the blinds. Win back your winrate."

### A) Practical Leak
- Leak: overfolding BB to BTN small opens.
- Why it matters: one of the highest-frequency preflop nodes in 6-max.

### B) Technical Core
Key concepts:
- Pot odds create immediate defend pressure even with positional disadvantage.
- Defend set should adjust by opener size and pool postflop behavior.
- Use hand class + realization proxy, not hand aesthetics.

Calculation block:
- BTN opens 2.0bb, SB folds, hero BB faces 1.0bb to call into 4.5bb total.
- Required raw equity approximation: `1.0 / 4.5 = 22.2%`
- Realization discount applies OOP; many hands still clear profitability versus small opens.

### C) Edge Impact
Leak cost estimate:
- Overfolding BB by 8 points can cost around 1.0 bb/100 in passive pool conditions.
- 100NL, 50k hands: `$500/month`
- 200NL, 50k hands: `$1,000/month`

Winrate-share impact:
- For a 3.0 bb/100 winner, 1.0 bb/100 leak burns `33%` of total edge.

Sales framing:
- Losing one-third of your edge in a single recurring node is a bankroll emergency.

### D) Step-Level Content
Step 1 (`INFO_STEP`) casual setup:
- "You're not just defending a blind. You're defending a huge slice of your monthly EV."

Step 1 technical payload:
- Defend threshold matrix by BTN size (2x, 2.2x, 2.5x).
- Pool adaptation: tighten versus low-c-bet pools; widen versus high-c-bet give-up pools.

Step 2 (`MCQ_STEP`) question:
- "Given this price and hand class, what's the baseline highest-EV defend action?"

Step 3 (`ACTION_STEP`) prompt:
- "Use real ActionBar to execute call/fold/3-bet."

Post-result feedback (teeth required):
- "You are defending this node too tightly. An 8% overfold here is often close to -1.0 bb/100 before flop skill even matters."

### E) Optional Top Toasts
- Pre-question: "Leak Alert: 8% BB overfold ~= -1.0 bb/100 in many passive pools."
- Post-result: "Bankroll Impact: Fixing BB defense can recover $175 to $500+/month at 100NL volume."

### F) 10k-Hand Tracking Target
- Stat to watch: BB defend % vs BTN open by open size
- Expected movement: defend frequency converges toward pool-adjusted target bands

## 8) Voice Guide: Premium But Consumable
Voice principle:
- Clear, direct, and professional.
- Analytical, not academic for its own sake.
- Use one dense concept at a time, then monetize the insight with edge impact.

Recommended cadence per graded step:
- Line 1: plain-language setup
- Line 2-4: technical reasoning
- Final line: winrate-share + dollar implication

Example pattern:
- "This is a common moving-up leak."
- "Your hand class under-realizes versus this continue range at this size."
- "That makes the passive line lower EV than the aggressive baseline."
- "At your current WR, this leak is costing about X% of your edge and roughly $Y per month."

Sales tone guardrail:
- Bold and confident, but never vague.
- Every hype line must be anchored by a number, formula, or concrete poker mechanism.

## 9) Acceptance Checklist (For These 3 Lessons)
Content quality:
- Includes pool exploit angle in each lesson
- Includes at least one concrete formula or numeric threshold per lesson
- Includes dollar-impact and winrate-share line per graded step
- Includes one non-obvious insight per lesson

UX quality:
- Half-sheet remains single instructional surface
- Optional top toasts used only for emphasis/insight, never grading
- ACTION_STEP uses real ActionBar only

Credibility quality:
- No generic beginner filler language
- Uses frequency and EV terminology accurately
- Feedback explains why line is +EV or -EV in this node
- Incorrect feedback tone is analytical and specific

Sales quality:
- Each lesson includes at least one site-ready headline line
- Each graded step includes one high-impact value sentence
- No fluff-only claims without numeric support

## 10) Measurement Layer (Phase-1.5 Bridge To Closed-Loop Training)
To make this truly must-have, add this lightweight loop after lesson completion:
- Lesson score by concept
- "Biggest current leak" label
- Next recommended lesson
- One tracked stat target for next 10k hands

Minimum output example:
- "Biggest leak: BB vs BTN overfold tendency"
- "Estimated edge drag: 0.6 bb/100"
- "At 100NL and 40k hands: approx $240/month"
- "Next focus: L3 Blind Defense"

Site copy variant:
- Know your leak. Fix your leak. Track your bankroll impact.

Value proof requirement:
- Every lesson completion screen must show:
- estimated bb/100 drag removed if implemented
- monthly dollar equivalent at player's default stake and volume
- one stat target and one behavior target for the next 10k hands

## 11) Suggested Next Content Expansion
After these 3 lessons are validated, prioritize:
1. L7 Draws Without Spew
2. L10 Thin Value Discipline
3. L11 River Bluff-Catch

Reason:
- These topics produce high perceived premium value and strong measurable edge signals for serious players.

Campaign-ready CTA options:
- "Fix the leaks. Climb the stakes."
- "From autopilot reg to deliberate winner."
- "Your next bb/100 starts here."

## 12) Value Communication Layer (Must-Have Positioning)
If this product is truly premium, value must be visible at all times, not implied.

Required value surfaces:
- Before lesson: "What this lesson is worth" card
- During lesson: numeric insight toasts (non-grading)
- After lesson: edge recovered summary + bankroll projection
- In dashboard: top 3 leaks ranked by estimated bb/100 drag

Before-lesson value card template:
- "Primary leak this lesson fixes: <leak>"
- "Estimated edge drag: <x.xx bb/100>"
- "Potential recovery at your stake/volume: <$X/month>"
- "Time to complete: <N minutes>"

Post-lesson value summary template:
- "You improved decision quality in: <concept>"
- "Projected impact if applied: <x.xx bb/100>"
- "At <stake>, <volume> hands/month: <$X/month>"
- "Next 10k-hand objective: <stat + target range>"

Competitive framing (site copy):
- "Faster than video study. Clearer than solver screenshots. More actionable than Discord advice."
- "Not just instruction. Measurable edge recovery."

30-day outcome narrative (site-ready):
- Week 1: identify top leak and fix first high-frequency node
- Week 2: reinforce with action-based reps and tracked stat movement
- Week 3: reduce secondary leak drag and stabilize decision process
- Week 4: convert leak reduction into measurable winrate retention

Trust line:
- "Every value claim must map to a formula, a tracked stat, or a graded decision pattern."
