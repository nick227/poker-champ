# Poker School Upgrade Proposal

## 1) Executive Summary

Poker School is not a side feature—it is the **premium differentiator and primary selling feature** of the product. This proposal reviews the current lessons epic, compares us to established poker training platforms, and recommends concrete upgrades so that training becomes the reason users stay and pay.

**Strategic choice:** Compete as **(C) Performance and training system for serious poker players**—not (A) structured training library or (B) interactive EV trainer alone. C is premium. C requires: progress visibility, EV feedback, habit loop, and performance framing. We are halfway there.

**What actually makes this inevitable premium (if you implement only one thing):**  
**Server-driven Boot Camp progress + lesson completion payoff.** Completion psychology is what creates subscription retention. Without visible progress there is no momentum, no sunk cost, no identity. The Boot Camp progress bar (real, not fake) is **non-negotiable.** Everything else amplifies from there.

**Upgrade path:** Make the moat **felt** (not just described) in product; add **Boot Camp + Skill Engine** with distinct tone and visual weight; close the loop with a **specific** completion CTA that frames the table as practice; EV + frequency used sparingly and credibly; deterministic Coach first; optional video for creator content.

---

## 2) Where We Truly Differentiate

Our real moat is **not** curriculum, EV framing, or mastery tracking. It is:

**Train inside the same decision interface you use to play.**

That is extremely rare.

| Others | Us |
|--------|-----|
| Video → passive | Same **table** |
| Quiz → separate UI | Same **ActionBar** |
| Trainer → abstract range grids | Same **flow** |
| — | **Server-graded** |

Same table, same ActionBar, same flow, server-graded. That is premium **if emphasized correctly**. Right now it’s **described**—it needs to be **felt**. The user should experience it in product: e.g. complete a lesson and tap through to the **same** ActionBar and table they just trained on, with a CTA that says “Now apply this at the table.” Weaponize it in hero copy, completion screens, and every “why us” moment so the moat is experiential, not just copy.

Premium poker training must do one of: (1) teach what others don’t, (2) teach in a way others can’t, (3) improve results measurably. We are closest to **#2**. So we lean harder into: **train in real decision context.** To justify premium we must also deliver **measurable improvement** so the user can feel *I am improving*. Mastery and EV reveal exist; making that feeling unavoidable is the gap we close below.

---

## 3) The Four Truly Critical Components

Only four things are **truly critical**. Everything else is amplification.

**1) Server-driven Boot Camp progress**  
If the progress bar is fake or hardcoded, credibility dies instantly. This is the foundation. Real state, real completion count, real X/12.

**2) Lesson completion moment**  
Not just a modal. A **moment.** It must: show score; show mastery delta; show what discipline improved; give a **specific** apply-at-table CTA. If this moment feels generic, you lose the moat.

**3) EV in bb (clean, minimal)**  
Not dollars. Not exaggerated frequency. Just: **“+1.8 bb EV”** (or “-2.1 bb EV”). Serious players respect bb. Keep it clean and minimal.

**4) Same table transition**  
The apply CTA must lead to the **same table context**—the same ActionBar, same flow. That is your brand moment. Train here → apply here.

Everything else (Skill Engine, Coach, social, leaderboards, cohorts, video, certificates, badging, percentiles, benchmarks) is **amplification**. Ship the four first; add amplification only when it clearly supports the core.

---

## 4) Where You're Still at Risk — Restraint, Visual Rule, What Elite Means

### A) Feature creep (disguised as strategy)

We have or plan: Boot Camp, Skill Engine, AI Coach, Social, Leaderboards, Cohorts, Video, Certificates, Badging, Community comparisons, Percentiles, Benchmarks. This can become **noise**. Phase 1 should not pretend to be a full Skill Map. Catalog-first means **restraint**.

### B) Utilities row (practice utilities) — be careful

The “Practice Utilities Row” is good in theory. But if it shows percentiles without strong data, shows community comparisons early, or feels like **dashboard cosplay**, we lose credibility fast. Phase 1 = catalog-first; do not fake a Skill Map.

### C) The most important visual rule

**Boot Camp must look heavier than everything else.**

- **Boot Camp:** ~2× visual weight. Strong header, progress bar, phase grouping, clear path. This is the main commitment surface.
- **Skill Engine / Utilities:** Lighter, secondary. If we visually flatten them with Boot Camp, users won’t understand hierarchy.

### D) Video — smart but contained

Video is fine. It must **not**: dilute the training surface, compete with Boot Camp visually, or look like “YouTube embedded in a serious tool.” Keep it in its place.

### E) Elite is not feature count

**Elite is:** clarity, precision, authority, **measured improvement**.

- **Win:** The product makes users feel *“I am measuring my decision quality.”*
- **Lose:** It feels like *“I’m taking lessons.”* Then we’re a course platform, not a performance system.

---

## 5) Current State: What We Have

### Strengths (already built)

- **Unified table + lesson runtime:** Lessons use the same table snapshot, ActionBar, and grading pipeline as live/replay. No separate “quiz app”; the training surface is the game surface.
- **Server-authoritative grading:** Steps are graded on the server with deterministic evaluators; feedback and concept mastery updates are persisted.
- **Concept mastery model:** `UserConceptMastery` tracks per-concept scores and confidence; list API returns `masteryByConceptCode`; index uses weakest concept for “Recommended focus area” when mastery data exists.
- **Structured curriculum:** 3 modules (Stop Bleeding Preflop, Win More Flops, Close the Hand), 12-lesson blueprint, INFO/ACTION/MCQ steps, EV-first copy standards.
- **V2 platform:** DecisionNode → Submission → Evaluation → RevealStack → Continuation pipeline supports multiple content types and reveal layers (EV impact, etc.) without branching.
- **In-lesson UX:** Half-sheet with beforeInstructorMessage, question, feedback (correct/incorrect + followUp), reveal cards; ActionBar for ACTION_STEP.

### Gaps (where value is left on the table)

**Lesson index**

- **Progress is not server-driven.** Index uses `BASE_CATALOG` with **hardcoded** `state: "not_started" | "in_progress" | "completed"`. The API does not return per-lesson attempt state or last score. So “Continue Training,” “X/Y completed,” and “Resume” are not reflecting real completion.
- **No attempt history on the index.** Users don’t see “Last score 85%” or “Best score 100%” on cards; drills show static `attempts` from local data.
- **Mastery is underused.** We have mastery by concept and a “Recommended focus” line, but we don’t drive “Next lesson” by weakest concept or show a simple mastery strip (e.g. concept bars).
- **No streak / cadence.** “Recent cadence: 2 sessions in the last 7 days” is placeholder copy; we don’t compute or display real training frequency.
- **Value proof is generic.** “Leak impact in bb/100 + $” is a trust chip without a pipeline; we don’t yet tie lesson concepts to any estimated $ impact.

**During lessons**

- **Feedback is minimal.** Correct/incorrect + one follow-up line. No EV delta in bb, no “this mistake costs $X at your stakes,” no link to a related article or replay.
- **No post-step summary.** After a wrong answer, we don’t reinforce with a one-line takeaway or “Remember for next time.”
- **Reveal stack exists but could be richer.** EV impact and other layers are in the pipeline; in practice we could surface “This fold/call was worth +2.1 bb” more prominently.
- **No lesson completion celebration.** Finishing a lesson doesn’t show a clear “Lesson complete – 90%” or “+0.15 mastery on position” or CTA to “Next lesson” / “Back to index.”
- **No connection to play.** End of lesson doesn’t say “Practice this at the table” or “Replay a similar hand” with a direct link to lobby/replay.

**Backend / data**

- **List API doesn’t expose progress.** `GET /api/lessons` returns lessons + `masteryByConceptCode` but not per-lesson attempt status, last score, or best score. The index cannot be fully data-driven without this (or a dedicated progress endpoint).

---

## 6) Competitor Comparison (Honest)

### What they have

| Platform | Strength |
|----------|----------|
| **Run It Once** | GTO trainer, massive solver-backed library, big-brand coaches. |
| **Upswing** | Structured Lab, community, reputation. |
| **PokerCoaching** | Massive volume, affordable access, clear curriculum. |

### Our current perceived value

If we’re honest, today we look like: **a strong structured interactive curriculum.** That is good—but not yet premium-level differentiation.

### Authority signal we lack

Competitors use: coaches, solver branding, pro names. We don’t. We must substitute authority with:

- **Strong, precise language** — no fluff.
- **Clean UI** — industrial aesthetic.
- **Quantitative feedback** — EV in bb, mastery deltas, scores.

Tone and execution must make “train where you play” feel like the premium category, not an add-on.

### App-style / gamified training

| Dimension | Stack Poker | Lucid Poker | RePoker |
|-----------|-------------|-------------|---------|
| **Format** | Daily 10 hands, Range Rush, Equity Guesser | Cardle (daily spots), drills | Spaced repetition, analytics |
| **Progress** | Leaderboards (daily/all-time), session tracking | Daily challenge, leaderboards | Memory curve, performance analytics |
| **Habit** | “10 hands in 5 min,” daily format | 5 pro spots/day, instant feedback | Spaced repetition, improvement tracking |

Common traits: **daily/short sessions**, **leaderboards or streaks**, **instant feedback**, **progress/analytics visible**. We need progress visibility and habit signals without copying their format; our format is Boot Camp + same-table decisions.

---

## 7) Close the Loop + Boot Camp & Skill Engine

### The loop that defines premium

**Current flow:** Lesson → Completion → Back to index.  
That is a **structured course**.

**Premium flow:** Lesson → Completion → **Practice at table** / **Replay similar hand** / **See if decision improved**.  
That is **performance training**. Even if basic, that loop is what makes us elite. Without it we are still a structured course; with it we are a performance system.

### Two-layer model: Boot Camp + Skill Engine

Poker School should be designed as two overlapping systems:

**Layer 1 — Boot Camp (commitment loop)**

- **Structured, sequential, finishable, rewarding.**
- Users feel: “I am in Module A.” “I’ve completed 3 of 4.” “I’m 75% through the Preflop Boot Camp.”
- Creates: commitment, momentum, sunk-cost motivation, completion drive.
- **Critical for subscription retention.**

**Layer 2 — Skill progression (long-term loop)**

- After Boot Camp completion, users don’t stop. They transition to: skill maintenance, weak-node improvement, evergreen drills, performance tracking.
- **Boot Camp = on-ramp. Skill Map = long-term engine.**

**Refinement: different tone and visual weight.**  
- **Boot Camp** = **enrollment.** Strong header. Linear. Clear path. Feels like “I’m in something.”  
- **Skill Engine** = **maintenance.** Node-based. Performance dashboard. Heat map feel. Feels like “I’m tracking and improving.”  
That visual and tonal contrast reinforces progression. The page must signal “You are enrolled in something structured” for Boot Camp—not just “Here are some lessons.”

---

## 8) Making the Plan More Social

Training alone has high drop-off. Social layers increase accountability, proof of progress, and perceived value. We don’t need a full community product; we need **lightweight social signals** that make Boot Camp and Skill Engine feel shared and credible.

### Shareable proof

- **Completion share:** After finishing a lesson, module, or Boot Camp: “Share” → generated card (e.g. “Phase 1 Complete – Stop Bleeding Preflop”) or “Boot Camp Certified” for social or profile. No leaderboard required; the act of sharing is the social moment.
- **Score share:** Optional “Share this score” after a lesson or drill (e.g. “85% on 3-Bet / Call / Fold”). Lets users show improvement without exposing full history.
- **Streak share:** “7-day training streak” or “Trained 4 days this week” as a shareable line or badge. Builds identity (“I’m someone who trains consistently”).

### Lightweight competition (optional)

- **Weekly Boot Camp leaderboard:** Rank by lessons completed this week (or by mastery delta, or by drill runs). Opt-in visibility: “Show my progress on leaderboard.” Anonymized or username; top 10 or “You’re in the top 20%.” Creates gentle competition without requiring friends.
- **Drill leaderboards:** Per drill (e.g. BB vs BTN defense): best score this week, or most runs. Repeatable drills suit “compete with others” framing.
- **No requirement for friend graphs.** Leaderboards can be global or “others in Boot Camp” so users feel part of a cohort without adding contacts.

### Accountability and cohort

- **Cohort framing:** “You’re in the February Boot Camp cohort” or “X players completed Phase 1 this week.” Makes progress feel part of a class, not isolated.
- **Optional accountability:** “Remind me to train” (push or email); “I’m training toward Boot Camp completion by [date].” Self-commitment with optional share (“I said I’d finish by March”).
- **Study groups (later):** Tier 3 / Team: private groups with shared progress, group leaderboard, or assigned lessons. Starts as “we have the data”; productizes later.

### What to avoid

- Don’t force social (e.g. “Add friends to continue”). Every social feature should be **optional** and additive.
- Don’t make sharing noisy (e.g. auto-posting every lesson). User-initiated share only.
- Don’t promise community features we won’t build soon (e.g. forums). Ship share + leaderboard first; expand if it sticks.

### Summary

Social = **shareable proof** (completion, score, streak) + **optional lightweight competition** (weekly/drill leaderboards) + **cohort framing** (“others are in Boot Camp too”). That increases retention and makes curriculum completion feel premium and visible.

---

## 9) Making the Curriculum Value More Premium

Beyond Pro/Elite labels, the **curriculum itself** should feel like a serious, investable path—not “a list of lessons.” Premium curriculum value comes from framing, clarity, and perceived exclusivity.

### Narrative and stakes

- **Path language:** “Cash Game Boot Camp” is the **path**, not a course title. Subcopy: “Structured decision training for 6-max cash. Twelve nodes. One path. Same table you play on.” Reinforces that this is a single, coherent journey.
- **Stakes copy:** “The decisions in these 12 lessons show up hundreds of times per month. Get them wrong and the leak is real.” Tie to frequency and EV so the curriculum feels consequential, not generic.
- **Outcome framing:** Each phase and lesson states what **changes** after completion: “After Phase 1 you’ll have a clear preflop filter.” “After this lesson you’ll know when to 3-bet or fold instead of flat-calling.” Curriculum = transformation, not coverage.

### Scarcity and exclusivity (without fake gates)

- **Limited cohorts (optional):** “Spring 2025 Boot Camp” with a close date or “Cohort closes in 2 weeks.” Creates urgency and belonging. Can be cosmetic (same content) or a real cohort for leaderboard/group.
- **Pro / Elite on content:** We already badge lessons. Add one line under Boot Camp title: “Pro curriculum – same table, server-graded, EV feedback.” So “premium” is the **type** of training, not just the label.
- **Certification weight:** “Boot Camp Certified” isn’t a participation badge. Copy: “You’ve completed structured decision training across the core cash nodes.” Optional: “Certificate of completion” with date and phase list. The certificate feels **earned** because the bar (12 lessons, real attempts) is real.

### Authority and rigor

- **No fluff:** Every lesson and phase description is concrete: leak, EV cost, fix. No “master the art of…” without a measurable behavior.
- **Difficulty and time:** Show “~10 min” and “Core” / “Advanced” so users know what they’re committing to. “Phase 1: ~40 minutes total” sets expectation and signals seriousness.
- **Concept names:** Use the same concept codes we use in mastery (e.g. position, range_selection). Curriculum and skill engine speak the same language; that feels systematic.

### Progression clarity

- **One path, clear order:** Boot Camp is one linear path (with optional “focus on weak concept” branch). We don’t present 50 courses; we present “12 lessons in 3 phases.” Less choice, more commitment.
- **Phase gates (soft):** “We recommend completing Phase 1 before Phase 2.” No hard lock; the recommendation itself signals that order matters and the curriculum is designed.
- **Graduation as transition:** “Boot Camp Complete” leads to “Continue with Advanced Drills” and “Track performance at table.” So the curriculum has a **clear end** and a **clear next** (Skill Engine). That makes the 12 lessons feel like a complete investment, not an open-ended list.

### Summary

Premium curriculum value = **narrative** (path, stakes, outcome per phase) + **exclusivity** (cohort/certificate weight, Pro framing) + **rigor** (no fluff, time/difficulty visible, concept alignment) + **progression clarity** (one path, soft order, clear graduation). The content is the same; the framing makes it feel like a premium, investable path.

---

## 10) AI Poker Coach (New Education Tool)

A complementary layer in the Poker School arsenal: **situation-based practice with instant, conversational feedback** on every choice—EV, probability, ranges, and player types when relevant. Same decision context (table + ActionBar where possible); different delivery from fixed Boot Camp lessons.

### Purpose

- **Boot Camp** = structured, sequential, finishable curriculum.  
- **Skill Engine** = ongoing drills, weak-node work, performance tracking.  
- **AI Poker Coach** = open-ended or scenario-driven situations where the user makes choices and gets **immediate, educational feedback** that explains *why* in EV, probability, and (when relevant) range and opponent-type terms.

Goal: users can “ask” the product to put them in spots and explain the math and logic in plain language, reinforcing the same table/decision interface and building intuition for EV and ranges without needing to complete a fixed lesson path.

### Core experience

1. **User faces a situation**  
   Same table snapshot + ActionBar (or a simplified “spot” view). Situation can come from: curated scenarios, “similar to your last hand,” or user-selected node (e.g. “BB vs BTN open, I have …”).

2. **User makes a choice**  
   Fold, check, call, bet, raise, size—whatever the spot allows. No multiple-choice only; real decisions where possible.

3. **Instant feedback for every choice**  
   - **EV:** e.g. “This call is about -1.2 bb EV vs a GTO open range.” / “This raise is +0.8 bb EV.”  
   - **Probability:** e.g. “You’re ahead here ~35% of the time vs his range.” / “You need to be good ~28% to call; you’re ~32%.”  
   - **Ranges (when relevant):** e.g. “Villain’s open range from BTN is roughly top 22%. Your hand is in the top 18% of that range for calling.”  
   - **Player types (when relevant):** e.g. “Vs a tight opener this fold is correct; vs a loose-aggressive opener this call is fine.”  
   Feedback should be concise, numeric where possible, and tied to the same concepts we use in Boot Camp (position, initiative, pot odds, etc.).

4. **Optional follow-up**  
   “Try a different size” / “See what happens if he has a different range” / “Next: similar spot from the other side.” Keeps the user in the loop without requiring a full lesson.

### How it fits the moat

- **Same decision interface:** Coach scenarios use the same table and ActionBar when the situation is a full hand state; feedback refers to the same actions and sizings the user sees in play.  
- **Server or model-backed:** EV and probability come from a defined engine (solver, simplified model, or curated answers), not free-form hallucination. We stay precise and trustworthy.  
- **Educational, not just correct/incorrect:** Every response teaches. Ranges and player types are introduced when they clarify the spot (e.g. “vs a nit,” “vs a maniac,” “GTO open range”).

### Deterministic first; AI only when needed

- We loosely call it “AI Poker Coach,” but for now it is **partially scripted and curated**: precomputed or rule-based EV/probability and templated feedback. **Do everything deterministically when we can.** Repetitive, generic AI responses are a waste and hurt credibility. The best use of AI is when we **need to interpret the user’s message** (e.g. free-form follow-up questions)—we don’t have a strong reason to do that currently. Plan to expand conversational ability with AI later, once we have a clear use case and guardrails (cited EV/range, no hallucination).
- **Credibility rule:** Coach must feel **solver-lite, precise, concise.** Never hallucinate EV. Never give vague “it depends” fluff. If Coach answers feel generic, we instantly lose serious players.

### Scope and phasing

- AI Coach can sit as a **Pro** or **Elite** tool: “Unlimited situations with instant EV and range feedback.” Free tier could get a small number of “Coach spots” per week to prove the value.  
- Positioning: “Not just right or wrong—understand the EV and the ranges. Our AI Poker Coach explains every choice.”

### Scope and phasing

- **Phase 1 (now):** Curated situations (e.g. 20–50 spots) with **precomputed or rule-based** EV/probability and **scripted/templated** feedback copy. No free-form LLM for answers. Optional: “Explain this spot” with templated answers.  
- **Phase 2:** Broader scenario library; range and player-type framing in feedback; “similar spot” from hand history or replay. Still deterministic where possible.  
- **Phase 3:** Add AI only where we need to interpret user input (e.g. follow-up questions) with strict guardrails and cited EV/range inputs so numbers stay grounded.

### Tier and positioning

- Coach can sit as **Pro** or **Elite** tool: “Unlimited situations with instant EV and range feedback.” Free tier could get a small number of “Coach spots” per week. Positioning: “Not just right or wrong—understand the EV and the ranges.”

### Summary

AI Poker Coach adds a **situation → choice → instant feedback** loop with **deterministic, scripted responses first**. EV, probability, ranges, and player types when relevant. Solver-lite, precise, no hallucination. Expand to conversational AI only when we have a clear need to interpret the user’s message.

---

## 11) Proposed Upgrades

### A) Boot Camp identity and progress (index)

**1. Rename and frame the path**

- **Rename** the structured path to **Cash Game Boot Camp** (not just “Module A / B / C”).
- **Inside:** Phase 1 — Stop Bleeding Preflop | Phase 2 — Win More Flops | Phase 3 — Close Hands Profitably.
- This framing increases perceived seriousness and enrollment.

**2. Visible Boot Camp progress bar**

- Top of page (or hero): **CASH GAME BOOT CAMP** with a single progress line:
  - `Progress: 4 / 12 Lessons Completed`
  - Visual bar: `[██████░░░░░░░░░]`
- **Must be server-driven.** Not fake. This creates emotional investment.

**3. Module completion milestones**

- When a user finishes all lessons in Phase 1 (e.g. Module A): show **Module Complete** — “Preflop Discipline Boot Camp Finished” + “+Position Mastery Increased” (or simple concept delta). Milestones create pride.

**4. Graduation moment**

- When all 12 lessons are completed: **Boot Camp Complete** — “You’ve completed structured decision training across core cash nodes.”
- Offer: optional certificate, “Continue with Advanced Drills,” “Now track performance at table.” That is the transition into the Skill Engine.

**5. Progress in list API**

- Extend `GET /api/lessons` (or add `GET /api/lessons/progress`) so the client receives **per-lesson progress** for the current user:
  - `state`: `not_started` | `in_progress` | `completed` (from latest attempt per lesson).
  - `lastAttemptScorePct`, `lastAttemptCompletedAt`.
  - `bestScorePct` (max scorePct across completed attempts).
  - For repeatable lessons: `attemptCount`, `lastAttemptAt`.
- Derive state from `LessonAttempt` (status, completedAt) and optionally last `LessonAttemptStep` to know “in progress” step index.
- **Outcome:** Index can show “Resume at step 3,” “Completed – 85%,” “Best 100%,” “Run again (4th attempt)” from real data. Remove hardcoded `state` from `BASE_CATALOG`.

**2. Recommended next lesson from mastery**

- Use existing `masteryByConceptCode` and lesson–concept links: recommend the **next lesson** that teaches the user’s **weakest concept** (or next in sequence if no clear weak spot).
- Surface “Recommended: &lt;lesson title&gt; – improves &lt;concept&gt;” in the hero or focus panel with one tap to open that lesson.
- **Outcome:** “Continue Training” and “Focus this now” become data-driven and tied to leak repair.

**3. Cadence and streaks**

- Compute from `LessonAttempt.completedAt` (and optionally attempt step timestamps):
  - “Trained X times in the last 7 days.”
  - Optional: “Current streak: Y days” (at least one completed lesson or attempt per day).
- Show in Progress Snapshot or a small “Activity” chip. No need for complex gamification at first; **visibility** of recent activity is enough.
- **Outcome:** Users see that the product “notices” their training and can set a simple goal (“3 sessions this week”).

**4. Value-proof pipeline (credibility-safe)**

- Keep “Leak impact in bb/100 + $” as a **trust chip**. Add **one** evidence-based example line only when we have a credible model or published benchmark (e.g. “At 100NL, 40k hands/month: ~$X/mo recoverable from blind defense”). **Start conservative;** do not overpromise. Let mastery + EV reveal build trust first. Personalized dollar impact only when we have user stakes/volume and a solid method.
- **Outcome:** Copy stays credible; we avoid the trap of fake precision while still signaling that lessons tie to real outcomes.

**5. Evergreen drills and “Run again”**

- Ensure repeatable lessons (e.g. BB vs BTN defense) always show **attempt count** and **last/best score** from the server.
- Prominent “Run again” / “Run drill” CTA with “Last: 80%, Best: 100%” on the card.
- **Outcome:** Drills feel like a recurring habit with visible improvement.

---

### B) During lessons: richer feedback and clear payoff

**1. EV and economic framing in feedback (premium differentiator)**

- Where the grading pipeline can compute it, include in step feedback:
  - **EV delta** in bb (e.g. “This call was -2.1 bb EV.” / “This fold was +1.5 bb EV.”). **Start here.** Clean numbers. Minimal hyperbole. Let the math speak.
  - **After a wrong answer, optionally:** “This mistake costs ~X bb in this node.” **Use frequency sparingly:** e.g. “You’ll see this node ~300 times per month” is extremely powerful when it’s credible—it’s when a user realizes “This actually matters.” **Caution:** If we overuse frequency numbers or make them feel made-up, serious players will distrust us. Use only when we have a defensible basis; otherwise stick to EV in bb.
- Store in `feedbackJson` or reveal layer; show in the instructor panel. Dollar conversion only when we have a credible model.
- **Outcome:** Every decision has a number; wrong answers feel consequential. EV + occasional credible frequency = psychological weapon without sacrificing trust.

**2. One-line takeaway after wrong answer**

- For each graded step, define a **short takeaway** (e.g. “When you’re out of position and miss the flop, check-fold is often best.”). Show it after incorrect feedback as “Remember for next time.”
- Can live in step config or grading spec.
- **Outcome:** Wrong answers still advance learning and reduce repeat errors.

**3. Lesson completion screen — the true premium moment (critical)**

- On last step completed, show a **completion view**:
  - Score: “Lesson complete – 85%.”
  - Concepts updated: “Position +12%, Range selection +8%” (from mastery delta).
  - **Targeted next step:** “This lesson targets [discipline].” Then a **specific** CTA line, not generic.
- **Primary CTA must not feel generic.** Do **not** use a generic “Go To Table.” Use **lesson-specific** framing so the table is **practice**, not gambling:
  - e.g. “Now apply this at the table.”
  - e.g. “Run 10 live blind defense reps.” (when the lesson was blind defense)
  - Button label can be “Go to table” or “Practice at table,” but the **copy above** is specific. That reframing (table = practice) is premium.
- Secondary CTAs: “Next lesson,” “Back to Poker School,” “Replay a hand.”
- **Outcome:** Lesson → Completion → **Specific apply-at-table CTA** is the moment that determines whether we’re elite. We become the only training platform that integrates play and study and frames the table as the next rep.

**4. Link to blog and replay**

- In completion view or in feedback for relevant steps: “Read: &lt;article title&gt;” (from blog `relatedLessonIds`) and “Practice at the table.”
- **Outcome:** Lessons tie into the existing blog and lobby; the loop (lesson → play → replay) is explicit.

**5. Reveal stack emphasis**

- Ensure EV reveal layer (and any solver/runout layers) are **visible and legible** in the half-sheet (e.g. “+2.1 bb EV” or “GTO mix: 70% fold, 30% call”).
- **Outcome:** Post-step “why” is not just text; it’s numeric and comparable.

**6. Trap to avoid: recoverable edge**

- **Do not overpromise** recoverable edge numbers early. If we exaggerate or fake precision, advanced players will detect it instantly. Start conservative. Let mastery + EV reveal build trust first. Add dollar impact only when we have a credible model or user-provided stakes/volume.

---

### C) Premium positioning

- Lessons page and main nav: **Poker School** as primary destination (“Train” or “School” as first or second tab).
- Hero copy: “Fix the decisions costing you real money” plus one proof line that **weaponizes** the moat: e.g. “Server-graded decisions on the same table you play.”
- Certificates / shareability (later): “Boot Camp Certified,” “Module A complete”; optional share for motivation and marketing.

### D) Video (creator content)

- **We do want a video section.** Site creators also make YouTube poker content and want to feature it on the app. This is not feature bloat—it’s requested and supports the same audience (serious players). A dedicated video area (e.g. “From the team” or “Poker School video”) that surfaces creator YouTube content keeps training and play in one place and gives creators a home inside the product.
- **Containment:** Video must not dilute the training surface, compete with Boot Camp visually, or look like “YouTube embedded in a serious tool.” Keep it in its own area; Boot Camp stays the heavy, primary surface.

---

## 12) Monetization Framework (Tiers)

Premium tiers must unlock **better feedback, better insight, better measurement**—not just “more lessons.” Otherwise it feels like gated content, not elevated value. Don’t price like a content platform; price like a **performance tool**.

### Tier 0 — Free (proof of value)

- **Access:** Module A — first 2 lessons; limited evergreen drills (e.g. capped runs/week); view-only progress; basic feedback (correct/incorrect + short explanation).
- **Restrictions:** No EV bb/$ reveal; no advanced mastery dashboard; no streak tracking; no historical performance chart; limited attempts per lesson (e.g. 2).
- **Message:** “Experience real ActionBar-based training.” Goal: demonstrate training-context differentiation.

### Tier 1 — Pro (core subscription, primary revenue)

- **Access:** All 12 Boot Camp lessons; unlimited attempts; full EV delta reveal in bb; mastery tracking by concept; recommended next lesson from weakest concept; completion scores; streak + cadence; unlimited evergreen drills; **AI Poker Coach** (situation-based practice with instant EV/probability/range feedback).
- **Experience:** Boot Camp progress bar; module completion milestones; “Resume where you left off”; last/best scores on cards.
- **Positioning:** “Deliberate practice for serious online players.” Ballpark: **$29–49/month**.

### Tier 2 — Elite (advanced + performance layer)

- Everything in Pro plus: dollar impact modeling (bb → $ from stake/volume input); advanced EV feedback (e.g. per street); performance dashboard (concept heat map, improvement over time, weakest node trend); advanced drills; **AI Coach** with player-type and range deep-dives; optional solver reference layer; early access to new modules. Optional: live webinar, Discord, Q&A.
- **Positioning:** “Performance system for winning regs.” Ballpark: **$79–149/month**.

### Tier 3 — Team / Coaching (future)

- Group dashboards, aggregate progress, admin, custom assignments, performance export. B2B / staking / study groups.

### Revenue mechanics

- **Completion-triggered upsell:** When user completes free Module A: “You’ve completed Phase 1. Continue the Boot Camp.” Offer Pro discount.
- **EV reveal gating:** Free sees “This action had measurable EV impact.” Pro sees “+2.1 bb EV. At 100NL, ~$X per 1,000 occurrences.” Seeing the number creates upgrade pressure.
- **Drill habit lock:** Free = e.g. 3 drill runs/week; Pro = unlimited. Habit interruption drives upgrade.

---

## 13) Perceived Premium Without Hard Gating (Current Phase)

During initial dev/testing rollout we want users to **know some content is premium** even if we are **not hard gating yet**. This is about **signaling—not restricting**. Done right it increases perceived sophistication, future pricing leverage, and early tester buy-in. Done wrong it feels fake.

### What to do now

1. **Introduce “Pro” and “Elite” labels (soft badging)**  
   Add tier to lesson metadata: `free` | `pro` | `elite`. On lesson cards and lesson page: small **badge chip** (e.g. “Pro”, “Elite”). **Do not** grey out or show lock icons. Use subtle color accent. Train users: some content is higher tier.

2. **Language that signals depth**  
   Use “Pro Module,” “Elite Drill,” “Performance Series” instead of only “Advanced Lesson.” Tone must feel exclusive, not decorative.

3. **“Included in: Pro” on lesson page**  
   One line under title or in meta: “Included in: Pro” (or Elite). No “Upgrade to access” until we gate.

4. **Boot Camp completion badge**  
   On finishing Boot Camp: “Boot Camp Certified (Pro Tier).” Even if free right now, users internalize “I completed premium training.” Later when gated, this badge becomes meaningful.

5. **Minimal implementation**  
   Add `tier` to lesson metadata; add badge chip on cards; add “Included in: Pro” on lesson page; optional subtle heading separation in feedback (Basic / Pro / Elite). No backend gate required.

### What to avoid

- **Do not:** Use lock icons without gating; say “Upgrade to access” if there is no gate; pretend scarcity; show pricing placeholders yet. This phase is identity formation, not pressure.

### Long-term benefit

When we flip the paywall: content is already tiered, UI already reflects premium hierarchy, upgrade messaging feels natural. We pre-framed value.

---

## 14) Implementation Priorities

**Tier 1 (foundation – do first)**

1. **List API progress:** Return per-lesson state, last/best score, attempt count so the index is server-driven. **Without real state, premium perception dies; hardcoded “Completed” is fatal to credibility.**
2. **Index uses real progress:** Remove hardcoded state; wire “Resume,” “Completed,” “Run again,” and completion counts to API.
3. **Boot Camp identity:** Rename to Cash Game Boot Camp; Phase 1/2/3; visible server-driven progress bar (X/12).
4. **Lesson completion screen:** Score, concept deltas; **lesson-specific** apply-at-table copy (e.g. “Now apply this at the table” or “Run 10 live blind defense reps”), not generic “Go To Table.” Primary CTA: practice at table; secondary: next lesson, back to index, replay.

**Tier 2 (value and habit)**

5. **EV + economic framing in feedback:** bb EV; after wrong answer add “This mistake costs ~X bb in this node” + “You’ll see this node ~N times per month.”
6. **One-line takeaway** for wrong answers.
7. **Cadence/streaks:** Compute “trained X times in 7 days” (and optional streak); show in index.
8. **Recommended next lesson** from weakest concept (or sequence).
9. **Module milestones + graduation:** Module complete screen; Boot Camp complete screen with certificate optional and “Continue with Advanced Drills” / “Track performance at table.”

**Tier 3 (differentiation and polish)**

10. **Soft premium badging:** Add `tier` to lesson metadata; Pro/Elite badge chips on cards; “Included in: Pro” on lesson page; Boot Camp Certified badge on completion. No lock icons or paywall yet.
11. **Blog/replay links** in completion and selected steps.
12. **Reveal stack** polish (EV/solver clearly visible).
13. **Value-proof:** One credible recoverable-edge example only when we have it; avoid overpromising early.

---

## 15) Success Metrics

- **Engagement:** Lessons started per user per week; lessons completed per user per week; return rate (user does another lesson within 7 days).
- **Progress visibility:** % of users who see at least one “Completed” or “Resume” driven by server data; % who see mastery-based recommendation.
- **Loop closure:** % of lesson completions that lead to “Go To Table” or replay within same session.
- **Conversion (if gated):** Free → premium conversion for users who completed at least one lesson vs. users who never completed.
- **Perception:** “Poker School is the main reason I use this product” / “I know what to work on next” / “I feel I am improving.”
- **Social:** Share rate (completion, score, streak); leaderboard opt-in rate; “cohort” or “others completed” message exposure.
- **Curriculum premium:** “This feels like a serious path” / “I know what I’m working toward” (survey or interview).

---

## 16) Summary

Poker School is the **critical premium feature**. Our moat is **train in the same decision interface you play** (same table, same ActionBar, server-graded)—not curriculum or EV framing alone. That must be weaponized everywhere.

**Four truly critical components:** (1) Server-driven Boot Camp progress; (2) Lesson completion moment (score, mastery delta, discipline, specific apply-at-table CTA); (3) EV in bb, clean and minimal; (4) Same table transition from apply CTA. Everything else is amplification. **Visual rule:** Boot Camp must carry ~2× weight vs. Skill Engine/utilities so hierarchy is obvious. **Elite** = clarity, precision, authority, measured improvement—users should feel *“I am measuring my decision quality,”* not *“I’m taking lessons.”*

We compete as a **performance system (C)**, not just a structured library (A) or an EV trainer (B). That requires: server-driven progress, EV and economic framing, habit loop, and **closing the loop** (lesson → completion → practice at table / replay / measure). The two-layer model—**Boot Camp** (structured, finishable, commitment) + **Skill Engine** (ongoing improvement, drills, tracking)—supports both retention and long-term value.

**Education arsenal:** **Boot Camp** (structured path), **Skill Engine** (ongoing drills + tracking), and **AI Poker Coach** (situation-based practice with instant feedback on EV, probability, ranges, and player types when relevant). Coach uses the same decision context and stays numeric and educational.

**Social:** Shareable proof (completion, score, streak) + optional leaderboards (weekly Boot Camp, per-drill) + cohort framing so training feels shared and accountable, not isolated.

**Premium curriculum value:** Narrative (path, stakes, outcome per phase) + exclusivity (cohort/certificate weight, “Pro curriculum” framing) + rigor (no fluff, time/difficulty visible) + progression clarity (one path, soft order, clear graduation). The framing makes the same content feel like an investable path.

**Immediate priorities:** (1) Server-driven lesson state and Boot Camp progress bar (non-negotiable); (2) Lesson completion screen with **specific** apply-at-table CTA (e.g. “Now apply this at the table” / “Run 10 live blind defense reps”), not generic “Go To Table”; (3) EV in bb first, frequency framing used sparingly and only when credible; (4) Soft premium badging (Pro/Elite labels, no locks yet). Avoid overpromising recoverable edge until we have credible data. Substitute missing “authority” with precise language, clean UI, and quantitative feedback. When we flip the paywall, content and UI are already tiered—we pre-framed value.

**One warning:** Avoid feature bloat. Ship the strategic core (progress + completion payoff) and add only what clearly supports retention or revenue. **Exception:** Video. Site creators make YouTube poker content and want it featured on the app—that’s a requested, coherent addition, not bloat.
