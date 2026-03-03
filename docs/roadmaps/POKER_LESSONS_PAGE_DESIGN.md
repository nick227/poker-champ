# Lessons Page Design Document

## 1) Purpose
Define the product/design blueprint for `apps/client/app/lessons.tsx` so Poker School feels like the core value surface of the app.

Design intent:
- Premium training platform, not a list of links
- Clear progression + clear value proof
- Fast path to first lesson and fast path to highest-value next lesson

Primary audience:
- Serious online players moving up stakes

Product maturity path:
- Phase 1 identity: Course Catalog (premium, structured training surface)
- Phase 2 identity: Skill Progression Map (performance-driven guidance)

## 2) Page Goals
1. Prove value in first screenful
2. Guide users to the right next lesson
3. Show measurable progress and leak focus
4. Support evergreen repeatable lessons/drills
5. Keep hierarchy visually varied (hero + panels + categorized lists)
6. Prioritize personalized training path over static catalog browsing
7. Expose utility tools for repetition and performance comparison without adding new product branding

## 3) Information Architecture
Recommended top-to-bottom layout:

1. Hero section (value + primary CTA)
2. Personalized focus row (recommended focus area + one proof metric)
3. Practice utilities row (repeatable drills + compare performance surfaces)
4. Evergreen drills rail (repeatable, high visibility)
5. Recommended next lessons rail
6. Curriculum modules (A/B/C) with granular lessons (secondary browse)
7. Recently completed / continue where left off
8. Footer trust/copy block (optional)

Phase-1 guardrail:
- Keep this as a clear catalog-first surface.
- Do not present a full skill-map UI until mastery/performance evidence is reliable.
- Invariant: lessons page is a training launcher first, analytics surface second.

## 4) Layout And Visual Hierarchy
Use varied blocks, not a uniform card stack.

### A) Hero Block (full-width)
Content:
- Headline options:
  - "Fix The Decisions Costing You Real Money."
  - "Stop Autopilot. Start Deliberate Edges."
  - "Train The Nodes That Matter."
- Subhead: "5-10 real decision reps per lesson. Immediate feedback. No fluff."
- Primary CTA: "Continue Training"
- Secondary CTA: "Start Module A"
- Trust chips:
  - `ActionBar-based decisions`
  - `Server-graded feedback`
  - `Leak impact in bb/100 + $`

Visual:
- Dominant typography
- Short stat strip below CTA with one value-proof metric only above fold:
  - `Recommended focus area`
  - `High-frequency EV node`
  - `Lessons completed` (secondary)

### B) Progress + Leak Panel Row (2-column on desktop/tablet, stacked on mobile)
Panel 1: Progress snapshot
- `recommended focus area`
- `current module`
- `recent training cadence`

Panel 2: Focus area (credibility-safe language)
- Label: `Recommended focus area`
- Concept code + short explanation
- Safe framing examples:
  - `High-frequency EV node at your current stage`
  - `Common pool leak in this stake band`
  - `Opportunity to improve decision consistency`
- CTA: `Focus this now`

Credibility guardrail:
- Do not show precise bb/100 leak drag claims unless backed by tracked user evidence.
- Use stronger quantitative claims only after mastery/stat pipeline is live.

### C) Recommended Rail (horizontal card rail)
Cards should prioritize:
- unfinished lessons in recommended order
- lessons mapped to weakest concept
- one quick-win lesson (under 8 min)

Card metadata:
- lesson title
- module tag
- difficulty tag
- estimated minutes
- progress state (`not started` / `in progress` / `completed`)
- badge when repeatable (`Evergreen`)

### D) Featured Lesson Cards (high-impact)
Not every lesson should render as a compact row. Use large featured cards for:
- Module entry points
- High-value core lessons
- Evergreen drills
- Capstone

Featured card limit:
- Maximum 2 large featured cards visible on page at once.
- Everything else should use compact list/row cards.
- If a third candidate exists, rotate it into recommended rail rather than promoting all three.

Featured card requirements:
- Bold headline treatment
- One symbolic graphic element:
  - table seat mini-diagram
  - EV meter bar
  - positional arrow
  - stack-depth icon
- One clear promise metric:
  - `High-frequency blind node`
  - `Core preflop EV filter`
  - `Tree-wide initiative gain`
- One dominant CTA (`Start`, `Resume`, `Run Drill`)

### E) Curriculum Modules (vertical sections, secondary to personalized path)
Three module sections with expandable lesson lists:
- Module A: Stop Bleeding Preflop
- Module B: Win More Flops
- Module C: Close The Hand Profitably

Each module header:
- module completion bar
- lessons completed count
- short module promise line

Each lesson row/card:
- title
- one-line outcome
- concept tags
- performance-linked progress indicator
- action button (`Start`, `Resume`, `Review`)
- lesson role tag (`teaches`, `drills`, `tests`)

### F) Evergreen Drills (promoted placement)
Purpose:
- Encourage repeat reps for high-frequency spots
- Drive retention and daily utility

Initial drill types:
- BB vs BTN defense reps
- Preflop response buckets
- Draws/pot-odds quick checks

Each drill card:
- repeatable badge (`Evergreen`)
- attempts count
- last score / best score
- CTA `Run Drill`

Placement rule:
- Evergreen drills should appear near top surfaces (after hero/focus row), not buried at page bottom.
- Evergreen drills are reinforcement, not replacement: drill cards must reference a lesson concept they reinforce.

### G) Practice Utilities Row (new)
Purpose:
- Make training utilities obvious without introducing separate product naming
- Let users run reps and compare performance quickly

Initial utility cards:
- `Run Quick Reps` (repeatable 5-10 decision batches)
- `Compare To Community` (see percentile and action distribution where data is sufficient)
- `Benchmark Check` (track trend vs prior attempts)

Credibility guardrails:
- Only show community comparison when minimum sample thresholds are met.
- Label low-sample states clearly (`insufficient sample`, `early signal`).
- Never imply solver precision or global truth from sparse data.

## 5) Content Taxonomy For Lessons
Use both module and type taxonomy.

Module taxonomy:
- `MODULE_A`
- `MODULE_B`
- `MODULE_C`

Lesson type taxonomy (editorial labels):
- `Core Lesson`
- `Decision Drill` (evergreen/repeatable)
- `Capstone`

Lesson role taxonomy (for evolution to progression map):
- `teaches`
- `drills`
- `tests`

Canonical taxonomy guardrail:
- Maintain a canonical concept/node dictionary and map aliases to canonical ids.
- Never infer recommendation alignment from free-form string similarity alone.

Difficulty labels:
- `Beginner`
- `Core`
- `Advanced`

## 6) Granular Lesson Catalog (Phase 1)
Display all 12 lessons from curriculum doc with module grouping.

Module A:
1. Stop Bleeding: RFI Discipline by Position
2. Punish Opens: 3-Bet / Call / Fold Buckets
3. Stop Overfolding Your Big Blind
4. Isolate For EV vs Limp-Heavy Pools

Module B:
5. Static Boards: High-Frequency Small C-Bets
6. Pot Control Nodes: Check-Back Discipline
7. Draws Without Spew: Price, Equity, Realization
8. 3 Flop Defense Leaks Costing You Money

Module C:
9. Turn Barrel Discipline vs Pool Tendencies
10. Thin Value Discipline at 100bb
11. River Bluff-Catch: Don’t Torch Buy-Ins
12. Capstone: Think Like a Winning Reg

## 7) Progress Model On Page
Per-lesson states:
- `Not Started`
- `In Progress`
- `Completed`
- `Repeatable` (for evergreen drills)

Progress surfaces:
- top-level performance-linked indicator
- per-module completion % (secondary)
- per-lesson state chip
- optional last-attempt score
- utility metrics: percentile (when available), streak, and best recent drill score

Progress copy rule:
- Prefer performance-linked framing over vanity completion framing.
- Example: `Blind defense decision quality improving` over `75% complete`.

Resume behavior:
- If in-progress attempt exists, primary CTA routes to that step.

Repeat behavior:
- Evergreen lessons show `Run Again` CTA even when completed.

## 8) Copy System (Engaging + Value-Proving)
Tone:
- Direct, confident, practical
- Always tie to EV and bankroll outcomes

Hero copy options:
- "Fix the decisions costing you real money."
- "Stop autopilot. Start deliberate edges."
- "Train the highest-frequency EV nodes first."

Panel copy examples:
- `Recommended focus`: "BB vs BTN defense is a high-frequency EV node at your stake level."
- `Impact` (only when evidence-backed): "At 100NL and 40k hands/month: ~$240/month in recoverable edge."

Lesson card outcome copy pattern:
- "Learn to <decision skill> so you stop <leak behavior>."

Microcopy for actions:
- `Start Lesson`
- `Resume Step 2`
- `Review Spot`
- `Run Drill`

## 9) Interaction Rules
- Keep lessons page scannable in < 10 seconds.
- First CTA should always be visible above the fold.
- Prefer one primary action per major section.
- Avoid deep nesting; use clear section headers and compact cards.
- Personalized path gets primary visual weight; curriculum browse is secondary.
- Utilities should be one tap from the top of page and never hidden below module sections.

Above-the-fold rule:
- Must include:
  - headline
  - one primary CTA
  - one value-proof metric/focus label
- Hard cap: no secondary stat chips above fold (`percentile`, `streak`, `best score`, `sample`, `freshness`, etc.).

## 10) Data Requirements For UI
Needed from lessons APIs/stores:
- lessons list with module/difficulty/estimatedMinutes
- per-lesson progress state
- in-progress attempt pointer
- mastery summary by concept
- recommended focus area summary (derived)
- repeatable flag for evergreen lessons
- lesson role (`teaches`/`drills`/`tests`)
- concept tags per lesson
- node tags per lesson (high-frequency decision nodes)
- attempt performance state (not just completed/not started)
- aggregated cohort stats for comparison utilities:
  - sample size
  - action distribution
  - percentile bucket
  - freshness timestamp

If not yet available server-side, initial fallback:
- derive from existing lesson list + local attempt state
- show credibility-safe focus text until mastery/stat evidence is populated

## 11) MVP Build Sequence
1. Implement hero block + CTA wiring
2. Add personalized focus row with credibility-safe copy
3. Add evergreen drills rail near top (static first)
4. Render recommended rail + featured cards
5. Render module sections with grouped lesson cards (secondary)
6. Add lesson state chips (`Not Started`, `In Progress`, `Completed`)
7. Polish copy and visual spacing hierarchy

Phase-1 anti-overreach:
- Avoid fake personalization or pseudo skill-map widgets without real evidence.
- Keep analytics surfaces minimal until tracked quality is reliable.

## 12) Acceptance Criteria
- Page communicates clear value above the fold.
- Personalized next action is visually dominant.
- Lessons are grouped by module and easy to scan.
- At least one progress indicator is visible at page load.
- User can resume in-progress lesson in one tap.
- Evergreen/repeatable section is visible and actionable.
- Copy consistently reinforces EV/bankroll outcomes.
- No unsupported precision claims in leak metrics when evidence is unavailable.
- Practice utilities are visible near top and actionable in one tap.
- Community comparison UI appears only when evidence thresholds are satisfied.

## 13) Future Enhancements
- Personalization by concept weakness
- Compare percentile vs cohort
- Dynamic challenge cards (daily drill)
- Adaptive recommendations from DecisionNode runtime analytics

## 13.1) Evolution Plan: Catalog -> Skill Progression Map
Phase 1 (Catalog-first):
- Primary structure: module headers + lesson browse
- Value surfaces: resume, recommended next lesson, evergreen drill entry
- Success criteria: clarity, authority, scan speed, lesson engagement

Phase 2 (Progression-map-first):
- Primary structure shifts to skill/node profile
- Top surface becomes `Your Skill Profile`
- Show concept/node meters and weakest-node recommendations
- Lessons become interventions to improve measured weak nodes

Architecture guardrail:
- Build data model for Phase 2 now (concept tags, node tags, attempt performance), even if UI remains catalog-first in Phase 1.

## 14) Visual Direction (Industrial Premium)
Design language:
- Hard edges or subtle borders
- Strong typography hierarchy
- Limited accent color reserved for metrics/active state
- Minimal ornamentation
- Clear spacing and dense information clarity
- Controlled playful accents only on featured high-value cards to break monotony

Avoid:
- flat repetitive card stacks with no hierarchy

Playful element policy (limited, intentional):
- Scope: featured cards only (`module entry`, `evergreen drill`, `capstone`, `high-value core lesson`)
- Allowed:
  - subtle iconography (chip, flame, target, bolt)
  - restrained micro-illustration or badge
  - light motion on hover/press (small scale/shift, no bounce spam)
- Not allowed:
  - cartoon-heavy motifs
  - noisy gradients across all cards
  - novelty animations that compete with core CTA

Goal:
- Add energy and memorability without diluting credibility or performance-first tone.

## 15) Implementation Validation Log (March 1, 2026)
Latest execution checkpoint:

Server validation:
- `pnpm -C c:\wamp64\www\poker-champ run test:server:lessons` -> PASS (6 tests)
- `pnpm -C c:\wamp64\www\poker-champ run server:typecheck` -> PASS

Client validation:
- `pnpm --prefix apps/client exec vitest run src/tests/useLessonSession.test.ts src/tests/lesson.service.utilities.test.ts` -> PASS (5 tests)
- `pnpm -C c:\wamp64\www\poker-champ\apps\client typecheck` -> PASS

Notes:
- Utility API and server-side lessons tests are green.
- Client-wide typecheck is green after resolving duplicate `step` declaration in `LessonContent.tsx`.

## 16) Release Readiness Status (Checkpoint)
Status:
- `READY FOR STAGING` (current scope)

Validated commands:
- `pnpm -C c:\wamp64\www\poker-champ run test:server:lessons` -> PASS (6/6)
- `pnpm -C c:\wamp64\www\poker-champ run server:typecheck` -> PASS
- `pnpm -C c:\wamp64\www\poker-champ\apps\client typecheck` -> PASS
- `pnpm --prefix apps/client exec vitest run src/tests/useLessonSession.test.ts src/tests/lesson.service.utilities.test.ts` -> PASS (5/5)

Scope validated:
- Course-catalog lessons page with utility row and evidence-gated utility sheets
- Server-backed lessons progress states for list rendering
- Utility overview endpoint for lesson-level and step-level comparison context
- Client utility service query support for `lessonId` and `stepId`

Remaining non-blocking items before production:
- Replace placeholder benchmark trend logic with persisted trend endpoint
- Add freshness/sample display to utility cards (currently strongest detail is in utility sheets)

## 17) Validation Update (March 1, 2026 - Step Context Wired)
Change completed:
- Lessons list payload now includes `currentStepId` for in-progress attempts.
- Lessons page utilities fetch now sends `stepId` when available (`lessonId` + `stepId`).
- Utility fetch effect dependencies include step context, so changing the active in-progress step refreshes utility data.

Revalidated commands:
- `pnpm -C c:\wamp64\www\poker-champ run test:server:lessons` -> PASS (6/6)
- `pnpm -C c:\wamp64\www\poker-champ run server:typecheck` -> PASS
- `pnpm --prefix apps/client exec vitest run src/tests/useLessonSession.test.ts src/tests/lesson.service.utilities.test.ts` -> PASS (5/5)
- `pnpm -C c:\wamp64\www\poker-champ\apps\client typecheck` -> PASS

Updated remaining non-blocking items before production:
- Replace placeholder benchmark trend logic with persisted trend endpoint.
- Add freshness/sample display to utility cards (currently strongest detail is in utility sheets).

## 18) Validation Update (March 1, 2026 - Benchmark + Utility Card Metrics)
Change completed:
- `GET /api/lessons/utilities/overview` now returns persisted `benchmarkCheck` metrics derived from server-side attempt history.
- Benchmark trend logic on the lessons page now uses persisted utility payload (no local placeholder drill aggregation).
- Utility cards now display sample/freshness context directly (community + benchmark cards).
- Utility overview tests were updated to assert benchmark payload shape for lesson-scoped and step-scoped requests.

Revalidated commands:
- `pnpm -C c:\wamp64\www\poker-champ run test:server:lessons` -> PASS (6/6)
- `pnpm -C c:\wamp64\www\poker-champ run server:typecheck` -> PASS
- `pnpm --prefix apps/client exec vitest run src/tests/useLessonSession.test.ts src/tests/lesson.service.utilities.test.ts` -> PASS (5/5)
- `pnpm -C c:\wamp64\www\poker-champ\apps\client typecheck` -> PASS

Updated remaining non-blocking items before production:
- None for current staging scope in this document.

## 19) Validation Update (March 1, 2026 - Utility Signal Clarity + Trend Test Coverage)
Change completed:
- Utility cards now show clearer evidence-state context directly on-card:
  - Community card now displays sample threshold progress (`sample/minimum`) and freshness/percentile context.
  - Benchmark card now displays sample progress, freshness, and scope (`lesson`/`step`) inline.
- Added server test coverage for benchmark trend deltas using persisted completed-attempt history (including declining trend case).
- Updated lessons router test mocks to include `lessonAttempt.count` so cadence + list payload paths are fully represented in tests.

Revalidated commands:
- `pnpm -C c:\wamp64\www\poker-champ run test:server:lessons` -> PASS (7/7)
- `pnpm -C c:\wamp64\www\poker-champ run server:typecheck` -> PASS
- `pnpm --prefix apps/client exec vitest run src/tests/useLessonSession.test.ts src/tests/lesson.service.utilities.test.ts` -> PASS (5/5)
- `pnpm -C c:\wamp64\www\poker-champ\apps\client typecheck` -> PASS

Updated remaining non-blocking items before production:
- None for current staging scope in this document.

## 20) Validation Update (March 1, 2026 - Access CTA Wiring + Cadence Assertions)
Change completed:
- Lessons page now consumes `applyCtaText` from the lessons list payload and uses it as the action label for disabled/locked lessons instead of a generic "Coming Soon".
- Server lessons list test now asserts premium metadata and cadence contracts:
  - `tier` and `applyCtaText` are present in list payload.
  - `cadence.completedAttemptsLast7Days` is present and increases after a completed attempt.

Revalidated commands:
- `pnpm -C c:\wamp64\www\poker-champ run test:server:lessons` -> PASS (7/7)
- `pnpm -C c:\wamp64\www\poker-champ run server:typecheck` -> PASS
- `pnpm --prefix apps/client exec vitest run src/tests/useLessonSession.test.ts src/tests/lesson.service.utilities.test.ts` -> PASS (5/5)
- `pnpm -C c:\wamp64\www\poker-champ\apps\client typecheck` -> PASS

Updated remaining non-blocking items before production:
- None for current staging scope in this document.

## 21) Validation Update (March 1, 2026 - Recommendation Ordering Logic)
Change completed:
- Recommended rail ordering now follows roadmap intent instead of static top-of-catalog slicing.
- Ranking priorities now include:
  - unfinished/in-progress lessons first,
  - lessons aligned to weakest mastery concept,
  - quick-win lessons (<= 8 min),
  - repeatable drill bonus.
- Added concept-to-lesson tag matching normalization to keep recommendation scoring stable across naming variations.

Revalidated commands:
- `pnpm -C c:\wamp64\www\poker-champ run test:server:lessons` -> PASS (7/7)
- `pnpm -C c:\wamp64\www\poker-champ run server:typecheck` -> PASS
- `pnpm --prefix apps/client exec vitest run src/tests/useLessonSession.test.ts src/tests/lesson.service.utilities.test.ts` -> PASS (5/5)
- `pnpm -C c:\wamp64\www\poker-champ\apps\client typecheck` -> PASS

Updated remaining non-blocking items before production:
- None for current staging scope in this document.

## 22) Validation Update (March 1, 2026 - Continue + Recently Completed Surface)
Change completed:
- Added a dedicated `Continue / Recently Completed` section to the lessons page to match IA item 7.
- Continue card now uses in-progress metadata (`currentStepIndex`) for explicit resume CTA (`Resume Step X`).
- Recently completed cards now use server attempt metadata (`lastAttemptedAt`, `lastScorePct`) for recency + outcome context.
- Catalog item shaping now carries `currentStepIndex`, `lastAttemptedAt`, and `lastScorePct` consistently from list payload to UI.

Revalidated commands:
- `pnpm -C c:\wamp64\www\poker-champ run test:server:lessons` -> PASS (7/7)
- `pnpm -C c:\wamp64\www\poker-champ run server:typecheck` -> PASS
- `pnpm --prefix apps/client exec vitest run src/tests/useLessonSession.test.ts src/tests/lesson.service.utilities.test.ts` -> PASS (5/5)
- `pnpm -C c:\wamp64\www\poker-champ\apps\client typecheck` -> PASS

Updated remaining non-blocking items before production:
- None for current staging scope in this document.

## 23) Wrap-Up And Staging Handoff (March 1, 2026)
Scope closure status:
- Lessons page scope in this document is functionally implemented for current staging target.
- Validation history shows repeated green checks across server tests, server typecheck, targeted client tests, and client typecheck.
- Previously tracked non-blocking items for this scope are resolved.

Release verification commands (latest standard set):
- `pnpm -C c:\wamp64\www\poker-champ run test:server:lessons`
- `pnpm -C c:\wamp64\www\poker-champ run server:typecheck`
- `pnpm --prefix apps/client exec vitest run src/tests/useLessonSession.test.ts src/tests/lesson.service.utilities.test.ts`
- `pnpm -C c:\wamp64\www\poker-champ\apps\client typecheck`

Staging QA checklist (manual):
- Confirm hero CTA routes correctly for:
  - first-time user,
  - in-progress user,
  - completed-only user.
- Confirm recommended rail order reflects:
  - in-progress/unfinished priority,
  - weakest-concept alignment when mastery data exists,
  - quick-win inclusion.
- Confirm utilities row behavior:
  - insufficient sample gating,
  - community comparison enablement at threshold,
  - benchmark trend/freshness/scope display.
- Confirm continue/recently-completed section:
  - `Resume Step X` accuracy,
  - recent completion ordering and score/date display.
- Confirm locked/premium lessons show backend CTA text (`applyCtaText`) instead of generic placeholder labels.

Post-staging focus (outside this closure):
- Real cohort-scale telemetry validation (sample growth behavior and freshness updates over time).
- Lessons content expansion and progression-map evolution work tracked in separate roadmap docs.

## 24) Validation Update (March 1, 2026 - Vitest Lessons Auto-Reseed)
Change completed:
- Added vitest global setup hook to auto-reseed lessons content when running server vitest and lesson rows are missing.
- Behavior:
  - if `DATABASE_URL` is present and `Lesson` count is `0`, run `pnpm lessons:seed:v1`.
  - if DB is unavailable/migrations are missing, skip auto-seed (best-effort) so pure unit test runs are not blocked.
- Added/matched test mocks for newly exercised lesson completion side-effects (`lessonAttempt.groupBy`, `userCurriculumProgress.upsert`, awards service mock) so lessons route tests remain deterministic.

Files added/updated:
- `vitest.global-setup.ts` (new)
- `vitest.config.ts`, `vitest.config.js` (globalSetup registration)
- `src/http/__tests__/LessonsRouter.test.ts` (mock completeness for current router paths)

Validation results:
- `pnpm -C c:\wamp64\www\poker-champ run test:server:lessons` -> PASS (7/7)
- `pnpm -C c:\wamp64\www\poker-champ run server:typecheck` -> FAIL (unrelated monetization/content-access typing + missing `stripe` module)
- `pnpm -C c:\wamp64\www\poker-champ\apps\client typecheck` -> FAIL (unrelated `PricingSection.tsx` variant typing)

Notes:
- Lessons auto-reseed path is functional for vitest lessons coverage.
- Current typecheck failures are outside lessons scope and should be handled in monetization/sales workstreams.

## 25) Review Loop Checkpoint (March 1, 2026 - Lessons Clean, Repo-Wide Not Yet Clean)
Lessons-focused verification (clean):
- `pnpm -C c:\wamp64\www\poker-champ run test:server:lessons` -> PASS (7/7)
- `pnpm -C c:\wamp64\www\poker-champ run lessons:content:check` -> PASS (3 lessons validated)
- `pnpm --prefix apps/client exec vitest run src/tests/useLessonSession.test.ts src/tests/lesson.service.utilities.test.ts` -> PASS (5/5)

Repo-wide typecheck status (not lessons-specific):
- `pnpm -C c:\wamp64\www\poker-champ run server:typecheck` -> FAIL
  - `src/api/contentAccess.ts` nullability mismatch for `RequiredTier`
  - `src/api/memberships.ts` + `src/http/webhooks/stripe.ts` missing `stripe` module/types
  - `src/http/MonetizationRouter.ts` string/string[] typing mismatch
- `pnpm -C c:\wamp64\www\poker-champ\apps\client typecheck` -> FAIL
  - `src/components/sales/PricingSection.tsx` variant typing (`\"h3\"` not assignable)

Conclusion for this review loop:
- Lessons system path is clean and revalidated.
- Full repo clean-state still depends on monetization/sales typecheck fixes outside lessons scope.

## 26) Final Review Loop Checkpoint (March 1, 2026 - Clean Validation + Typecheck Stabilization)
Change completed:
- Server typecheck command was hardened to avoid stale incremental-cache false negatives.
  - Updated script: `server:typecheck` -> `tsc -p tsconfig.json --noEmit --incremental false`.
- Lessons awards data access path remains compile-safe for current client generation state.

Revalidated commands:
- `pnpm -C c:\wamp64\www\poker-champ run test:server:lessons` -> PASS (7/7)
- `pnpm -C c:\wamp64\www\poker-champ run server:typecheck` -> PASS
- `pnpm --prefix apps/client exec vitest run src/tests/useLessonSession.test.ts src/tests/lesson.service.utilities.test.ts` -> PASS (5/5)
- `pnpm -C c:\wamp64\www\poker-champ\apps\client typecheck` -> PASS

Current closure status:
- Lessons system review loop is clean for this checkpoint.
- No open blocking items remain in this document for the validated scope.

## 27) Validation Update (March 1, 2026 - Access Enforcement + Graded Completion Integrity)
Change completed:
- Fixed attempt completion integrity for mixed step types:
  - Completion now counts only graded submissions (`step.type != INFO_STEP`) when deciding attempt completion.
  - INFO steps no longer inflate completion numerator.
- Added server-side lesson access enforcement using content access service checks:
  - `GET /api/lessons/:lessonId`
  - `POST /api/lessons/:lessonId/attempts`
  - `POST /api/lessons/:lessonId/attempts/:attemptId/steps/:stepId/submit`
  - Locked content now returns `403` with `error: LESSON_LOCKED`.
- Improved lessons list contract + client wiring:
  - List payload now includes per-lesson `hasAccess`.
  - Lessons page `enabled` now derives from `hasAccess` (not from lesson presence).

Test coverage added:
- Premium access-denied regression test for lessons routes (`LESSON_LOCKED`).
- Mixed INFO/graded step completion regression test:
  - attempt remains `IN_PROGRESS` until all graded steps are submitted.

Revalidated commands:
- `pnpm -C c:\wamp64\www\poker-champ run test:server:lessons` -> PASS (9/9)
- `pnpm -C c:\wamp64\www\poker-champ run server:typecheck` -> PASS
- `pnpm --prefix apps/client exec vitest run src/tests/useLessonSession.test.ts src/tests/lesson.service.utilities.test.ts` -> PASS (5/5)
- `pnpm -C c:\wamp64\www\poker-champ\apps\client typecheck` -> PASS

Status:
- Previously identified P1 issues (premature completion, premium bypass path) are remediated and covered by regression tests.

## 28) Final Endpoint Smoke (March 1, 2026 - Real DB, Authenticated HTTP)
Execution mode:
- Ran a self-contained express instance mounting `authRouter` + `lessonsRouter` against the real DB.
- Env for smoke process: `ENABLE_LESSONS_V1=true`, `ENABLE_PAY_GATING=true`.
- Created disposable user via `POST /api/auth/register`.
- Performed happy-path + locked-path endpoint checks.
- Temporary content-access lock mutation was restored after run.

Smoke results:
- List: `GET /api/lessons` -> `200`
- Happy path (accessible lesson):
  - `GET /api/lessons/:lessonId` -> `200`
  - `POST /api/lessons/:lessonId/attempts` -> `201`
  - `POST /api/lessons/:lessonId/attempts/:attemptId/steps/:stepId/submit` -> `200`
- Locked path (same lesson, temporarily marked premium+tier while pay-gating enabled):
  - `GET /api/lessons/:lessonId` -> `403`
  - `POST /api/lessons/:lessonId/attempts` -> `403`

Observed smoke payload snapshot:
```json
{
  "listStatus": 200,
  "listCount": 2,
  "targetLessonId": "lesson_preflop_3bet_001",
  "targetHasAccess": true,
  "happyPath": {
    "detailStatus": 200,
    "startStatus": 201,
    "submitStatus": 200,
    "submitAttemptStatus": "IN_PROGRESS"
  },
  "lockedPath": {
    "detailStatus": 403,
    "startStatus": 403
  }
}
```

Conclusion:
- Server-side access enforcement works on live authenticated routes when pay-gating is enabled.
- Lessons happy path and submit flow operate correctly on real DB state.

## 29) Hierarchy Guardrails (Strategic UX Constraints)
Purpose:
- Preserve strategic clarity as lessons surfaces gain more signals and states.

A) Above-the-fold density rule:
- Allow only:
  - one primary metric,
  - one recommended focus signal,
  - one primary CTA.
- Do not stack additional utility stats (streak/percentile/sample/freshness) above the fold.
- If new signals are introduced, place them below fold or inside secondary utilities/sheets.

B) Continue section weight rule:
- `Continue / Recently Completed` is tactical (resume speed), not strategic guidance.
- Recommended focus remains the strategic anchor and must keep higher visual priority.
- Continue section must not exceed focus section visual weight (size, contrast, or interaction prominence).
- Continue card should remain compact (single primary resume action + brief context only).

Implementation checks for future PRs:
- Any PR adding above-fold content must explicitly state what was removed or deferred to keep `1 metric + 1 focus + 1 action`.
- Any PR changing continue/recent block must verify focus block remains dominant in hierarchy review screenshots.

## 30) Live Wiring Execution Checklist (File-by-File + PR Order)
Objective:
- Move lessons page from mixed static+live shaping to a fully live, contract-driven catalog surface while preserving hierarchy guardrails.

Definition of done for this phase:
- `apps/client/app/lessons.tsx` renders all core sections from live API contracts.
- Client does not require `BASE_CATALOG` for normal render paths.
- Access behavior is aligned end-to-end (`hasAccess` -> disabled UI + locked CTA text; server still enforces).
- Existing lessons test/typecheck command set remains green.

### PR 1 - API Contract Freeze (Server)
Scope:
- Add/normalize all section-driving fields in lessons list payload.
- Keep backward compatibility for current client while adding required live fields.

Files:
- `src/http/LessonsRouter.ts`
- `src/http/openapi.ts`
- `openapi.json`
- `packages/sdk/src/types.gen.ts`
- `src/http/__tests__/LessonsRouter.test.ts`

Required list fields per lesson:
- `id`, `title`, `description`, `moduleCode`, `difficulty`, `estimatedMinutes`
- `role`, `repeatable`, `conceptTags`, `nodeTags`
- `progressState`, `inProgressAttemptId`, `currentStepIndex`, `currentStepId`
- `completedAttempts`, `lastAttemptedAt`, `lastScorePct`, `bestScorePct`
- `tier`, `applyCtaText`, `hasAccess`

Acceptance:
- Lessons list contract test asserts full field presence.
- `pnpm -C c:\wamp64\www\poker-champ run test:server:lessons` green.

### PR 2 - Client Types + Service Alignment
Scope:
- Update lessons service/types to match frozen API contract.
- Remove optionality where server now guarantees fields.

Files:
- `apps/client/src/features/lessons/lesson.types.ts`
- `apps/client/src/features/lessons/lesson.service.ts`
- `apps/client/src/tests/lesson.service.utilities.test.ts`

Acceptance:
- Type-level alignment with generated SDK/openapi.
- No ad-hoc shape coercion needed in page container.

### PR 3 - Live Catalog Source of Truth in lessons.tsx
Scope:
- Replace `BASE_CATALOG` as primary render source with server lesson list.
- Keep explicit degraded fallback mode only for API failure.

Files:
- `apps/client/app/lessons.tsx`

Implementation tasks:
- Build `catalog` directly from live list payload.
- Derive sections from live catalog:
  - hero CTA target
  - recommended focus target
  - evergreen drills
  - recommended rail
  - modules grouping
  - continue/recent cards
- Use `hasAccess` only for `enabled`.
- Keep hierarchy guardrails from section 29 intact.

Acceptance:
- All core sections render with live payload when API succeeds.
- Fallback path clearly labeled and only used on fetch failure.

### PR 4 - Utilities + Focus Consistency Hardening
Scope:
- Ensure utility context always resolves from active live lesson target.
- Keep one-metric/one-focus/one-action above fold.

Files:
- `apps/client/app/lessons.tsx`
- `apps/client/src/features/lessons/lesson.service.ts`
- `apps/client/src/tests/useLessonSession.test.ts` (if shared assumptions change)

Implementation tasks:
- Verify `lessonId + stepId` scoping behavior for utility fetch.
- Keep community/benchmark gating text consistent with evidence thresholds.
- Keep tactical continue block visually subordinate to strategic focus block.

Acceptance:
- Utility fetch updates when in-progress step context changes.
- No above-fold metric creep.

### PR 5 - Access UX Pass + Locked Journey
Scope:
- Validate locked lesson cards, CTA labels, and route protection UX coherence.

Files:
- `apps/client/app/lessons.tsx`
- `apps/client/src/components/base/MembershipButton.tsx` (if used)
- `apps/client/src/hooks/useContentAccess.ts` (if used)

Implementation tasks:
- Locked cards show `applyCtaText` consistently.
- Press on locked lesson does not navigate to lesson runtime.
- Membership/upgrade CTA path is clear and consistent.

Acceptance:
- Locked scenarios verified against server-enforced 403 behavior.

### PR 6 - Final Validation + Documentation Refresh
Scope:
- Re-run full lessons validation set.
- Update this roadmap with final "fully live wired" checkpoint.

Commands:
- `pnpm -C c:\wamp64\www\poker-champ run test:server:lessons`
- `pnpm -C c:\wamp64\www\poker-champ run server:typecheck`
- `pnpm --prefix apps/client exec vitest run src/tests/useLessonSession.test.ts src/tests/lesson.service.utilities.test.ts`
- `pnpm -C c:\wamp64\www\poker-champ\apps\client typecheck`

Docs:
- `docs/roadmaps/POKER_LESSONS_PAGE_DESIGN.md`
- optional status mirror: `docs/status/POKER_SCHOOL_IMPLEMENTATION_STATUS.md`

---
Sequencing notes:
- Do not combine PR 1 and PR 3; keep contract freeze independent from client render refactor.
- Keep route-level access enforcement tests in server PRs; keep render hierarchy checks in client PRs.
- If concurrent lesson-content edits continue, avoid touching lesson runtime files unless needed for schema compatibility.

## 31) Validation Update (March 1, 2026 - Live Contract Wiring Slice 1)
Change completed:
- Lessons list API now returns live UI-driving metadata per lesson:
  - `moduleCode`, `role`, `repeatable`, `recommendedOrder`, `conceptTags`
  - (in addition to existing `hasAccess`, progress, tier/apply CTA fields)
- Lessons page catalog shaping now builds from live list payload (remote-first) instead of static catalog as primary render source.
- Evergreen rail now prefers live repeatable lessons from API (`repeatable=true`) before static fallback ids.

Files updated:
- `src/http/LessonsRouter.ts`
- `apps/client/src/features/lessons/lesson.service.ts`
- `apps/client/app/lessons.tsx`
- `src/http/__tests__/LessonsRouter.test.ts`

Validation:
- `pnpm -C c:\wamp64\www\poker-champ run test:server:lessons` -> PASS (9/9)
- `pnpm -C c:\wamp64\www\poker-champ run server:typecheck` -> PASS
- `pnpm --prefix apps/client exec vitest run src/tests/useLessonSession.test.ts src/tests/lesson.service.utilities.test.ts` -> PASS (5/5)
- `pnpm -C c:\wamp64\www\poker-champ\apps\client typecheck` -> PASS

Next slice:
- Remove remaining static catalog dependency entirely and complete section-level empty/degraded states for fully live rendering behavior.

## 32) Validation Update (March 1, 2026 - Live Wiring Slice 2: Section Safety + Module Scoping)
Change completed:
- Lessons page live sections were hardened for empty/degraded server states while staying remote-first.
- Added explicit empty states for:
  - `Evergreen Drills`
  - `Recommended Next`
  - `Featured`
  - `Continue / Recently Completed` (when neither exists)
  - module area when no module lessons are present
- Module rendering now scopes to non-empty module groups only (`nonEmptyModuleCodes`) to avoid rendering empty shells.
- Module A secondary CTA now disables when module A lessons are not present.
- Added module short-label mapping for recommended cards (`Module A/B/C`) and tightened `DrillItem` typing to include `enabled`.

Files updated:
- `apps/client/app/lessons.tsx`

Validation:
- `pnpm -C c:\wamp64\www\poker-champ run test:server:lessons` -> PASS (9/9)
- `pnpm -C c:\wamp64\www\poker-champ run server:typecheck` -> PASS
- `pnpm --prefix c:\wamp64\www\poker-champ\apps\client exec vitest run src/tests/useLessonSession.test.ts src/tests/lesson.service.utilities.test.ts` -> PASS (5/5)
- `pnpm -C c:\wamp64\www\poker-champ\apps\client typecheck` -> PASS

Status:
- Lessons page live wiring is stable for current staging scope with resilient section behavior when live lesson payloads are partial or empty.

## 33) Validation Update (March 1, 2026 - 12-Lesson Seed Baseline + End-to-End Smoke)
Change completed:
- Replaced lessons seed with a deterministic, reset-safe baseline that seeds **12 published lessons** with functional pipelines.
- Each seeded lesson now includes:
  - `tier = free`
  - unlocked lesson access rule (`contentAccess.isPremium = false`)
  - at least `INFO_STEP + MCQ_STEP + ACTION_STEP`
  - deterministic grading specs for MCQ and ACTION
  - concept links for mastery updates
- Added an executable lessons smoke script that validates core flow per lesson:
  - register user
  - list lessons
  - fetch lesson detail
  - start attempt
  - submit all steps
  - assert attempt completion
  - assert mastery updates

Files updated:
- `scripts/seed-lessons-v1.ts`
- `scripts/smoke-lessons-v1.ts` (new)
- `package.json` (`lessons:smoke:v1`)

Revalidated commands:
- `pnpm -C c:\wamp64\www\poker-champ run lessons:seed:v1` -> PASS (12 lessons seeded)
- `pnpm -C c:\wamp64\www\poker-champ run lessons:smoke:v1` -> PASS
  - `lessonsValidated: 12`
  - `masteryConcepts: 18`
- `pnpm -C c:\wamp64\www\poker-champ run test:server:lessons` -> PASS (9/9)
- `pnpm -C c:\wamp64\www\poker-champ run server:typecheck` -> PASS

Status:
- Core instructor pipeline is now validated across the full seeded lesson set:
  - `GET /api/lessons` -> detail -> start attempt -> submit INFO/MCQ/ACTION -> complete -> mastery updated.

## 34) Validation Update (March 1, 2026 - UI Instructor Loop E2E)
Change completed:
- Added a browser E2E spec focused on the interactive instructor loop (UI layer):
  - Module A lesson
  - Module B lesson
  - Capstone lesson
- Test validates, per lesson:
  - lesson opens from catalog surface
  - INFO step progression via `Next`
  - MCQ option selection + submit + feedback visibility
  - ACTION submission through ActionBar controls + feedback visibility
  - completion screen rendering
- Playwright server config now forces lessons API availability for E2E runs:
  - `ENABLE_LESSONS_V1=true`
  - `ENABLE_PAY_GATING=false`
  - client API env injected for web runtime

Files updated:
- `apps/client/e2e/lessons-instructor-loop.spec.ts` (new)
- `apps/client/playwright.config.ts`
- `apps/client/package.json` (`e2e:lessons`)

Revalidated commands:
- `pnpm -C c:\wamp64\www\poker-champ run lessons:seed:v1` -> PASS
- `pnpm -C c:\wamp64\www\poker-champ run lessons:smoke:v1` -> PASS (`lessonsValidated: 12`)
- `pnpm -C c:\wamp64\www\poker-champ\apps\client run e2e:lessons` -> PASS (1/1)

Notes:
- Playwright logs version mismatch warnings for some Expo packages during web startup; lessons E2E passes despite warnings.

## 35) Validation Update (March 1, 2026 - Phase 1 Tightening: Core Surface + 12-Lesson UI Runtime)
Change completed:
- Tightened lessons page to core first-session loop only:
  - kept: hero, continue/recently-completed, module-grouped full catalog.
  - removed from active render path: practice utilities row, community/benchmark utility sheets, evergreen rail, featured rail, and boot-camp-only CTA framing.
- Added stable UI hooks for runtime verification:
  - lessons catalog cards now expose `testID` markers (`lesson-card-<id>`, `lesson-state-<id>`).
- Expanded Playwright instructor-loop coverage from sampled lessons to full seeded catalog:
  - iterates all lessons returned by `GET /api/lessons`,
  - opens each lesson from catalog,
  - completes INFO -> MCQ -> ACTION flow,
  - asserts completion in UI catalog state chip,
  - re-checks API progress state per lesson (`completed`).

Revalidated commands:
- `pnpm -C c:\wamp64\www\poker-champ\apps\client typecheck` -> PASS
- `pnpm -C c:\wamp64\www\poker-champ run test:server:lessons` -> PASS (9/9)
- `pnpm -C c:\wamp64\www\poker-champ run server:typecheck` -> PASS
- `pnpm -C c:\wamp64\www\poker-champ\apps\client run e2e:lessons` -> PASS (full 12-lesson loop)

Status:
- Lessons page now presents only live, seeded, functional paths for Phase 1.
- Full catalog runtime loop is verified end-to-end in UI and API state.

## 36) Validation Update (March 1, 2026 - Simple Live Drills Wiring)
Change completed:
- Kept lessons page minimal and live-wired while adding a simple drills surface:
  - `Live Drills` section now renders only real lessons from API where `repeatable=true` or `role=drills`.
  - Drill cards route directly to the same lesson runtime flow (`Run Drill` / `Resume Drill`), no placeholder utilities.
  - Drill cards display live metadata only (state, estimated minutes, attempts, best score when present).
- Hero subhead copy was aligned to concrete value language:
  - `5-10 real decision reps per lesson. Immediate feedback. No fluff.`

Files updated:
- `apps/client/app/lessons.tsx`

Revalidated commands:
- `pnpm -C c:\wamp64\www\poker-champ\apps\client typecheck` -> PASS
- `pnpm -C c:\wamp64\www\poker-champ run test:server:lessons` -> PASS (9/9)

## 37) Validation Update (March 1, 2026 - Lessons Reliability Gate Command)
Change completed:
- Added a single root gate command for lessons reliability:
  - `lessons:gate`
  - execution chain:
    1. `lessons:seed:v1`
    2. `lessons:smoke:v1`
    3. `test:server:lessons`
    4. `apps/client typecheck`
    5. `apps/client e2e:lessons`
- Purpose:
  - provide one deterministic command to verify seeded data, server behavior, runtime flow, and UI loop before merge/staging.

Files updated:
- `package.json`

Revalidated commands:
- `pnpm -C c:\wamp64\www\poker-champ run lessons:gate` -> PASS
