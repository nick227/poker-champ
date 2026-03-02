# Poker School Implementation Strategy

This document turns the [Poker School Upgrade Proposal](../proposals/POKER_SCHOOL_UPGRADE_PROPOSAL.md) into a phased, actionable implementation plan. It assumes the existing lesson engine, V2 runtime, and concept mastery are in place.

---

## 1) Principles

- **Server-driven progress first.** Hardcoded "Completed" / "Resume" destroys premium credibility. The list API must return real per-lesson state before we rebrand to Boot Camp.
- **Close the loop early.** Lesson completion must offer "Go To Table" and next lesson before we add economic framing or AI Coach.
- **No overpromising.** EV and recoverable-edge numbers stay conservative; we build trust with mastery + EV reveal before dollar impact.
- **Same decision interface.** Every new surface (completion screen, Coach) uses the same table/ActionBar context where applicable.

---

## 2) Phase Overview

| Phase | Focus | Outcome |
|-------|--------|---------|
| **1** | Foundation | Real progress on index; Boot Camp identity; completion screen with "Go To Table" |
| **2** | Value & habit | EV/economic feedback; takeaway; cadence/streaks; recommended next; milestones |
| **3** | Premium signal | Pro/Elite badging; blog/replay links; reveal polish |
| **4** | AI Poker Coach | Curated situations + instant EV/probability/range feedback |
| **4.5** | Social + premium curriculum | Shareable proof; optional leaderboards; cohort framing; curriculum narrative + rigor |
| **5** | Later | Dollar impact (when credible); AI Coach Phase 2/3; certificates; study groups |

---

## 3) Phase 1 — Foundation

**Goal:** Index reflects real completion state; users see "Cash Game Boot Camp" and a progress bar; lesson end drives them to table or next lesson.

### 3.1 Backend: Progress in list API

**Owner:** API / LessonsRouter  
**Ref:** Proposal §9 (Proposed Upgrades A.5)

- Extend `GET /api/lessons` response to include **per-lesson progress** for the current user.
- For each lesson, query `LessonAttempt` (and optionally `LessonAttemptStep`) for this user:
  - **state:** `not_started` \| `in_progress` \| `completed` (from latest attempt: no attempt → not_started; attempt with no completedAt → in_progress; completedAt set → completed).
  - **lastAttemptScorePct**, **lastAttemptCompletedAt** (from latest completed attempt).
  - **bestScorePct** (max scorePct over completed attempts for this lesson).
  - **attemptCount** (count of attempts for this lesson); **lastAttemptAt** (max completedAt or createdAt).
- For "in progress," optionally return **currentStepIndex** or **completedStepsCount** so the client can show "Resume at step 3."
- **Acceptance:** Client can render "Resume," "Completed – 85%," "Best 100%," "Run again (4th attempt)" from API only; no hardcoded state.

**Tasks:**

1. Add aggregation query (or subquery) in LessonsRouter list handler to fetch per-user attempt summary per lesson.
2. Extend response shape: each lesson object gets `progress: { state, lastAttemptScorePct?, lastAttemptCompletedAt?, bestScorePct?, attemptCount, lastAttemptAt?, currentStepIndex? }`.
3. Update OpenAPI schema and any client types (lesson.service, list response type).

### 3.2 Client: Index uses real progress

**Owner:** Client / lessons.tsx  
**Ref:** Proposal §7 A.1–2

- Remove hardcoded `state` from `BASE_CATALOG` (and any local override). Derive state, last score, best score, attempt count from list API `progress`.
- Wire "Continue Training" to first lesson with `state === 'in_progress'` or first `not_started` in recommended order.
- Wire "Resume," "Completed – X%," "Best Y%," "Run again (Nth attempt)" on cards from API.
- **Acceptance:** After completing or starting a lesson, returning to the index shows updated state and scores without refresh hack.

**Tasks:**

1. Update `lesson.service` list response type to include `progress`.
2. In lessons.tsx, merge API `progress` into catalog (replace BASE_CATALOG state/attempts with API data).
3. Ensure in-progress lesson opens to correct step (already supported via attempt resume; verify).

### 3.3 Client: Boot Camp identity and progress bar

**Owner:** Client / lessons.tsx  
**Ref:** Proposal §7 A.1–2, Boot Camp identity

- **Copy and structure:** Rename to "Cash Game Boot Camp"; subhead or section labels: Phase 1 — Stop Bleeding Preflop | Phase 2 — Win More Flops | Phase 3 — Close Hands Profitably.
- **Progress bar:** At top of page (or in hero card): "CASH GAME BOOT CAMP" + "Progress: X / 12 Lessons Completed" + visual bar (e.g. X/12 filled). Use **completed count from API progress** (lessons where `state === 'completed'`). Total 12 = current curriculum size (or from API `lessons.length`).
- **Acceptance:** Progress bar and X/12 are server-driven; no mock data.

**Tasks:**

1. Replace "Module A/B/C" labels with Phase 1/2/3 and Boot Camp title in lessons.tsx.
2. Add Boot Camp progress block: completed count from catalog, total from catalog.length, bar UI.
3. Keep module grouping (Phase 1/2/3) aligned with existing `moduleCode` or lesson order.

### 3.4 Client: Lesson completion screen

**Owner:** Client / LessonContent or lesson route  
**Ref:** Proposal §7 B.3 (completion + "Go To Table")

- When the user completes the **last step** of a lesson, show a **completion view** (modal or full-screen card) before closing:
  - **Score:** "Lesson complete – X%" (attempt scorePct).
  - **Concepts updated:** e.g. "Position +12%, Range selection +8%" (from mastery delta for this attempt; if we have it in submit response or can derive from concepts linked to last step).
  - **Targeted next step:** "This lesson targets &lt;discipline&gt;." "Next step: Run 10 live reps at the table." (Discipline can be lesson title or a new `targetDiscipline` field in lesson meta.)
  - **Primary CTA:** **"Go To Table"** → `router.push('/lobby')`.
  - **Secondary CTAs:** "Next lesson" (recommended or next in module), "Back to Poker School" (`/lessons`), optional "Replay a hand" (lobby or replay entry).
- **Acceptance:** Every lesson end shows this screen; "Go To Table" is the main button; user can go to lobby or back to index.

**Tasks:**

1. Detect "last step completed" in lesson flow (attempt status COMPLETED or no next step).
2. Add completion view component (score, concept deltas if available, copy, CTAs).
3. Lesson metadata: add optional `targetDiscipline` or use title for "This lesson targets X."
4. Wire "Next lesson" to recommended (from mastery) or next in sequence (from catalog order).

**Dependency:** Completion view can ship with generic "This lesson targets [lesson title]" until we add `targetDiscipline` to lesson content.

### Phase 1 exit criteria

- [ ] List API returns per-lesson progress (state, scores, attempt count).
- [ ] Index shows only server-driven state and scores; no hardcoded completion.
- [ ] Boot Camp title and Phase 1/2/3 visible; progress bar shows X/12 from API.
- [ ] Lesson completion screen shows score, "Go To Table" as primary CTA, and next lesson / back to index.

---

## 4) Phase 2 — Value & Habit

**Goal:** In-lesson feedback includes EV and economic framing; wrong answers have a takeaway; index shows cadence/streaks and recommended next lesson; module and Boot Camp completion get milestones.

### 4.1 Backend: Cadence and streaks

**Owner:** API  
**Ref:** Proposal §7 Tier 2.7

- Add to list response (or a small "activity" endpoint): **trainedLast7Days** (count of distinct days in last 7 with at least one completed attempt or one completed lesson). Optional: **currentStreakDays** (consecutive days with at least one completion).
- Compute from `LessonAttempt.completedAt` (or attempt step timestamps if needed).
- **Acceptance:** Client can show "Trained X times in the last 7 days" and optionally "Current streak: Y days."

**Tasks:**

1. Query last 7 days of attempts; count distinct days with completion.
2. Optional: compute streak (max consecutive days ending today with at least one completion).
3. Expose in list response or GET /api/lessons/activity (or similar).

### 4.2 Backend: Recommended next lesson

**Owner:** API  
**Ref:** Proposal §7 A.2

- Add **recommendedLessonId** (or slug) to list response: lesson that best improves the user’s **weakest concept** (lowest masteryScore in masteryByConceptCode). If no concept data or tie, use first not-completed lesson in curriculum order.
- Requires lesson–concept links (already exist via steps/concepts); choose one "primary" concept per lesson or use first step’s concept.
- **Acceptance:** Client can show "Recommended: &lt;title&gt; – improves &lt;concept&gt;" and open that lesson.

**Tasks:**

1. Implement recommended-next logic (weakest concept → lesson that teaches it; fallback to order).
2. Add recommendedLessonId + recommendedReason (e.g. concept code) to list response.
3. Client: hero or focus panel "Recommended: …" with one tap to open.

### 4.3 Content + runtime: EV and economic framing in feedback

**Owner:** Content / grading pipeline  
**Ref:** Proposal §7 B.1, B.6 (trap)

- Where the evaluator or reveal layer can compute **EV delta in bb**, include it in step feedback (e.g. "This call was -2.1 bb EV.").
- For **wrong** answers, add: "This mistake costs ~X bb in this node." Then: "You’ll see this node ~N times per month." (N can be a constant per node type or from a small table.)
- Store in grading spec or feedbackJson; instructor panel displays it. **Stay conservative;** do not invent precision. If we don’t have EV for a step, skip it.
- **Acceptance:** At least one lesson (e.g. one ACTION_STEP) shows bb EV and mistake-cost + frequency after wrong answer; no dollar amount until we have a credible model.

**Tasks:**

1. Extend grading/feedback contract to include optional `evDeltaBb`, `mistakeCostBb`, `nodeFrequencyPerMonth` (or similar).
2. Add these fields to one or two pilot steps (content + evaluator).
3. LessonInstructorPanel (or feedback component): render EV and economic line when present.
4. One-line takeaway: add `rememberForNextTime` (or similar) to step/grading spec; show after wrong answer.

### 4.4 Client: One-line takeaway after wrong answer

**Owner:** Client + content  
**Ref:** Proposal §7 B.2

- For each graded step, add **takeaway** (e.g. "When OOP and you miss the flop, check-fold is often best."). Show after incorrect feedback as "Remember for next time."
- **Tasks:** Field in step config or grading spec; render in instructor panel below feedback.

### 4.5 Client: Module milestones and graduation

**Owner:** Client  
**Ref:** Proposal §7 A.3–4

- **Module complete:** When user completes the last lesson in Phase 1 (e.g. Module A), show a one-time or persistent "Module Complete" moment: "Preflop Discipline Boot Camp Finished" + optional concept delta line.
- **Boot Camp complete:** When user completes all 12 lessons, show "Boot Camp Complete" + "Continue with Advanced Drills" / "Now track performance at table" (links to index and lobby). Optional: certificate asset or share.
- **Acceptance:** Completing all lessons in a module shows module milestone; completing all 12 shows graduation; CTAs go to index and lobby.

**Tasks:**

1. Detect "last lesson of module completed" and "all 12 completed" from progress.
2. Add Module Complete and Boot Camp Complete views (modals or inline).
3. Copy and CTAs per proposal.

### Phase 2 exit criteria

- [ ] Cadence (and optional streak) visible on index.
- [ ] Recommended next lesson from weakest concept (or order) on index.
- [ ] At least one lesson step shows EV + mistake cost + frequency in feedback; one-line takeaway after wrong answer.
- [ ] Module complete and Boot Camp complete milestones shown with correct CTAs.

---

## 5) Phase 3 — Premium Signal (Soft Badging)

**Goal:** Users see Pro/Elite labels and "Included in: Pro" without any paywall; Boot Camp completion shows "Boot Camp Certified (Pro Tier)."

### 5.1 Content + schema: Lesson tier

**Owner:** Backend / content  
**Ref:** Proposal §8 (Perceived Premium)

- Add **tier** to lesson metadata: `free` | `pro` | `elite`. Store in DB (e.g. `Lesson.tier` or curriculum config). For now all lessons can be `pro`; no gating.
- List API returns `tier` per lesson.
- **Acceptance:** Client can render badge and "Included in: Pro" from API.

**Tasks:**

1. Add `tier` column or JSON field to Lesson (or to curriculum manifest if lessons are file-driven). Default existing lessons to `pro`.
2. Include `tier` in list and lesson-detail responses.
3. Client: small badge chip ("Pro" / "Elite") on lesson cards; "Included in: Pro" on lesson page. No lock icons.

### 5.2 Client: Boot Camp Certified badge

**Owner:** Client  
**Ref:** Proposal §8

- When user has completed all 12 lessons, show "Boot Camp Certified (Pro Tier)" on index or in a completion/profile context. Badge only; no paywall.
- **Tasks:** Conditional render when progress shows 12/12 completed; badge component or text.

### 5.3 Blog/replay links in completion and steps

**Owner:** Client  
**Ref:** Proposal §7 Tier 3.11

- In lesson completion view: optional "Read: &lt;article&gt;" from blog (relatedLessonIds). Link to `/blog/[slug]`.
- Optional: "Replay a similar hand" or "Practice at the table" (lobby). Already have "Go To Table"; add replay if we have a hand picker.
- **Tasks:** Resolve related blog article by lessonId; show link in completion view. Add replay CTA if product agrees.

### 5.4 Reveal stack polish

**Owner:** Client  
**Ref:** Proposal §7 B.5

- Ensure EV reveal layer (and any solver/runout layers) are clearly visible in the half-sheet (e.g. "+2.1 bb EV" prominent). No functional change to pipeline; UI emphasis only.
- **Tasks:** Review LessonInstructorPanel and RevealCard; typography and placement for EV/solver output.

### Phase 3 exit criteria

- [ ] Lesson tier (pro/elite) in API and on cards + lesson page; no lock icons.
- [ ] Boot Camp Certified badge when 12/12 complete.
- [ ] Completion view includes blog link when related article exists; replay/lobby CTAs clear.
- [ ] EV/reveal output is legible and prominent in half-sheet.

---

## 6) Phase 4 — AI Poker Coach

**Goal:** New education surface: situation → choice → instant feedback (EV, probability, ranges, player types when relevant). Same table/ActionBar where possible; server or model-backed numbers.

**Ref:** Proposal §6 (AI Poker Coach)

### 6.1 Scope for Phase 4

- **Phase 4a (MVP):** Curated situations (e.g. 20–50 spots) with **precomputed or rule-based** EV/probability and short feedback copy. User selects a scenario (or gets one at random), sees table snapshot + ActionBar, makes a choice, gets instant feedback with EV in bb and optional probability. Ranges and player types in feedback where we have them (e.g. "Vs GTO open range").
- **Phase 4b (later):** Broader library; "similar spot" from hand history; range and player-type framing in every relevant spot.
- **Phase 4c (later):** LLM-assisted explanation with strict guardrails and cited EV/range inputs.

### 6.2 Phase 4a tasks (high level)

1. **Data model:** Coach scenario = snapshot (or scenario id) + set of valid actions + precomputed feedback per action (EV bb, probability, short text, optional range/player-type line). Store in DB or static config.
2. **API:** `GET /api/coach/scenarios` (list); `GET /api/coach/scenarios/:id` (single scenario with snapshot); `POST /api/coach/scenarios/:id/feedback` (body: user action) → returns feedback object (evBb, probability, message, rangeLine?, playerTypeLine?).
3. **Client:** New route/surface (e.g. `/coach` or under Poker School as "AI Coach"). List of scenarios or "Next spot"; on select, load scenario, render table + ActionBar (reuse lesson/table components); on action submit, show feedback; optional "Try another" / "Next spot."
4. **Content:** Author 20–50 scenarios (snapshot + feedback per action). Use existing snapshot format where possible.
5. **Tier:** Coach access can be Pro (unlimited) and Free (e.g. N spots/week). No gate in Phase 4a if we’re not gating yet; just label "Pro" in UI.

### 6.3 Dependencies

- Reuse table snapshot + ActionBar from lesson/replay so Coach uses same decision interface.
- Feedback must be deterministic (precomputed or rule-based); no hallucinated EV.
- Optional: link Coach scenarios to lesson concepts for "Recommended Coach spot" from weakest concept.

### Phase 4 exit criteria (4a)

- [ ] User can open Coach, pick a scenario, see table + ActionBar, make a choice, and get instant feedback with EV (and probability where we have it).
- [ ] At least 20 scenarios with correct feedback.
- [ ] Ranges or player types mentioned in feedback where relevant (e.g. "Vs BTN open range").
- [ ] No paywall; optional "Pro" label for future gating.

---

## 7) Phase 4.5 — Social + Premium Curriculum Value

**Goal:** Make the plan more social (shareable proof, optional competition, cohort feel) and make the curriculum feel more premium (narrative, rigor, progression clarity). Ref: Proposal §6 (Social), §7 (Premium Curriculum).

### 7.1 Social — shareable proof

- **Completion share:** After lesson, module, or Boot Camp completion: "Share" → generated image or card (e.g. "Phase 1 Complete – Stop Bleeding Preflop", "Boot Camp Certified"). User-initiated only; no auto-posting.
- **Score share:** Optional "Share this score" after a lesson or drill (e.g. "85% on 3-Bet / Call / Fold").
- **Streak share:** "7-day training streak" or "Trained 4 days this week" as shareable line or badge.
- **Tasks:** Define share payload (text + optional image); implement share sheet / Web Share API / copy link; store no social graph. Can start with copy-to-clipboard + "Share" button; add image generation later.

### 7.2 Social — lightweight competition (optional)

- **Weekly Boot Camp leaderboard:** Rank by lessons completed this week (or mastery delta, or drill runs). Opt-in: "Show my progress on leaderboard." Return top N or "You're in top X%." Backend: aggregate by userId for last 7 days; expose GET /api/lessons/leaderboard or similar.
- **Drill leaderboards:** Per repeatable lesson: best score this week or most runs. Same opt-in and aggregation pattern.
- **Tasks:** API for leaderboard(s); client: leaderboard view or strip on index; user preference for visibility (default off).

### 7.3 Social — cohort framing

- **Copy only (no backend):** "X players completed Phase 1 this week" — can be a static or approximate number at first (e.g. "Hundreds of players completed Phase 1 this month"). Later: real count from DB.
- **Optional:** "You're in the [Month] Boot Camp cohort" (e.g. based on first lesson start date). Creates belonging without friend graph.
- **Tasks:** Add cohort/group copy to index or completion screen; optional cohortId or cohortLabel from API when we have it.

### 7.4 Premium curriculum — narrative and rigor

- **Path and stakes copy:** Subcopy under Boot Camp title: "Structured decision training for 6-max cash. Twelve nodes. One path. Same table you play on." Stakes line: "The decisions in these 12 lessons show up hundreds of times per month."
- **Outcome per phase/lesson:** Each phase header or lesson card states what changes after completion (e.g. "After Phase 1 you'll have a clear preflop filter"). Content/copy pass; no new API.
- **Difficulty and time:** Ensure "~10 min" and "Core" / "Advanced" are visible on cards; add "Phase 1: ~40 minutes total" (or sum of phase lesson times). Signals seriousness.
- **No fluff:** Review all lesson and phase descriptions for concrete leak/EV/fix language; remove vague "master the art of" without measurable behavior.
- **Tasks:** Copy updates in lessons.tsx and any lesson meta; optional phase total minutes from curriculum.

### 7.5 Premium curriculum — exclusivity and progression

- **Pro curriculum line:** Under Boot Camp title: "Pro curriculum – same table, server-graded, EV feedback."
- **Certification weight:** Boot Camp complete copy: "You've completed structured decision training across the core cash nodes." Optional certificate asset (image with date + phase list) for share or profile.
- **Soft phase gate:** "We recommend completing Phase 1 before Phase 2." Shown on Phase 2 header or first lesson of Phase 2; no hard lock.
- **Graduation transition:** Boot Camp complete screen: clear CTAs to "Continue with Advanced Drills" and "Track performance at table" (index + lobby).
- **Tasks:** Copy and CTA updates; optional certificate image template; soft gate as one-line recommendation.

### Phase 4.5 exit criteria

- [ ] User can share completion (lesson/module/Boot Camp) and optionally score or streak; share is user-initiated.
- [ ] Optional weekly leaderboard (Boot Camp and/or drill) with opt-in visibility.
- [ ] Cohort-style copy visible ("X completed this week" or "You're in [Month] cohort").
- [ ] Boot Camp and phase copy reflect path, stakes, outcome, time; "Pro curriculum" line and soft phase recommendation present.
- [ ] Boot Camp complete feels earned (certificate copy, clear graduation CTAs).

---

## 8) Phase 5 — Later

- **Value-proof:** One credible recoverable-edge example only when we have a model or benchmark; avoid overpromising.
- **Dollar impact:** Show $ from bb when we have user stakes/volume and a clear method.
- **AI Coach Phase 2/3:** Broader scenarios, similar-spot from history, LLM with guardrails.
- **Certificates / share:** Boot Camp certificate asset, share image (if not done in 4.5).
- **Study groups:** Tier 3 / Team: private groups, group leaderboard, assigned lessons.

---

## 9) Dependency Summary

| Delivers | Depends on |
|----------|------------|
| Phase 1 (foundation) | Existing LessonsRouter, LessonAttempt, lesson client |
| Phase 2 (value & habit) | Phase 1 (progress API, completion screen) |
| Phase 3 (badging) | Phase 1 (progress for 12/12 badge); lesson metadata (tier) |
| Phase 4 (AI Coach) | Table/snapshot + ActionBar reuse; new API + content |
| Phase 4.5 (Social + curriculum) | Phase 1 (progress for share/leaderboard); optional Phase 2 (cadence for streak share) |

Phase 1 is the critical path. Phase 2 and 3 can be parallelized after Phase 1. Phase 4 can start once table/snapshot reuse is confirmed. Phase 4.5 can run in parallel with 2/3/4; share and copy work need no new backend beyond progress/cadence; leaderboards need a small API.

---

## 10) Risk and Guardrails

- **Progress API performance:** Aggregating attempts per lesson per user can be heavy at scale. Add indexes on `LessonAttempt(userId, lessonId, completedAt)`; consider caching or a materialized view if needed.
- **EV accuracy:** Do not ship EV or frequency numbers we can’t defend. Prefer "~X bb" and "you’ll see this node often" until we have a clear source.
- **AI Coach scope creep:** Phase 4a must stay curated and deterministic. Defer LLM and "similar spot" until 4b/4c.
- **Tier field:** Adding `tier` to lessons is backward-compatible; default existing rows to `pro` so no content is hidden before we gate.

---

## 11) Reference

- **Proposal:** [POKER_SCHOOL_UPGRADE_PROPOSAL.md](../proposals/POKER_SCHOOL_UPGRADE_PROPOSAL.md)
- **Curriculum:** [POKER_LESSONS_PHASE1_CURRICULUM.md](POKER_LESSONS_PHASE1_CURRICULUM.md)
- **Lessons API:** `src/http/LessonsRouter.ts`; list handler at `GET /`.
