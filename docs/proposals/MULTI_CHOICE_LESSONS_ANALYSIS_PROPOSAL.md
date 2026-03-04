# Multiple-Choice Lessons: Analysis and Proposal

**Purpose:** Review the lessons system for multiple-choice (MCQ) support, document what exists, identify gaps, and propose implementing a Pot Odds MCQ lesson as the first canonical MCQ example.

**Date:** 2026-03-04

**Status:** Implemented. MODULE_D "Quick Checks" contains 5 MCQ lessons (L16–L20). See checklist at end.

---

## 1. Executive summary

- **Lesson types:** The system defines three step types: `INFO_STEP`, `ACTION_STEP`, `MCQ_STEP`. L01–L15 use only **action-button** steps. **L16–L20** are MCQ lessons in **MODULE_D**.
- **MCQ pipeline:** Types, API, grading, seed script, and client UI for MCQ are implemented. Content: `content/lessons/content/L16`–`L20` each have INFO + MCQ step, options, `expectedOptionKey`, and matching snapshots.
- **Implemented:** Pot odds (25%, 33%, 50% break-even) and rule-of-4 (9 outs → 36%, 8 outs → 32%). Titles avoid leading hand tokens (e.g. "Pot $50, Bet $50" not "33% Break-Even") so content check passes.

---

## 2. Current lesson type definitions

### 2.1 Step types

| Type         | Definition location | Purpose |
|--------------|---------------------|--------|
| `INFO_STEP`  | `lesson.types.ts`, `lesson-step-config.schema.json` | Intro / message-only; non-graded, "Continue" pacing. |
| `ACTION_STEP`| Same                | User chooses table action (fold/check/call/bet/raise/all_in). Graded by action or rubric. |
| `MCQ_STEP`   | Same                | User chooses one of N options. Graded by `expectedOptionKey`. |

There are **no other step types**; the enum is closed in types, schema, and API.

### 2.2 Where each type appears in content

| Type         | Content usage | Examples |
|--------------|----------------|----------|
| **INFO_STEP**| Intro step before a question | **L16–L20 only.** Each MCQ lesson has step 1 = INFO (concept intro), step 2 = MCQ. |
| **ACTION_STEP**| Single decision step per lesson | **L01–L15.** Each has one step (no INFO); user sees table and action bar, submits fold/check/call/bet/raise/all_in. |
| **MCQ_STEP**| Multiple-choice question | **L16–L20 only.** Step 2 in each; options + `expectedOptionKey`, graded by server. |

So **INFO_STEP is used**: all five MCQ lessons (L16–L20) have an INFO_STEP as the first step. L01–L15 have no INFO step (they go straight to ACTION_STEP).

### 2.3 How each type is utilized (capabilities)

- **INFO_STEP:** Renders snapshot (if `snapshotPath`), `beforeInstructorMessage`, `question`, `followUpInstructorMessage`. "Next" advances without calling submit (client-side only). Grading engine returns `isCorrect: true`, `response: "Continue."`, `scoreDelta: 0`. Completion logic excludes INFO (only graded steps count). Evaluator default: `no_op_eval`. **Fully utilized** for intro pacing.
- **ACTION_STEP:** Table in "live" mode, ActionBar, submit with `{ type, amountCents? }`. Grading: OBJECTIVE_SINGLE or RUBRIC_SUBJECTIVE. V2 runtime uses `scenarioProviderKey`, `evaluatorKey`, `revealLayerKeys` (ev_impact, community_comparison). **Fully utilized** including rubric and reveal layers.
- **MCQ_STEP:** Table in "replay" mode (no actions), LessonQuestionPanel with options, submit on option click with `{ optionKey }`. Grading by `expectedOptionKey`. Evaluator default: `mcq_option_eval`. **Reveal layers** (e.g. community comparison) are not yet wired for MCQ in the same way as ACTION; otherwise fully utilized.

- **Client:** `apps/client/src/features/lessons/lesson.types.ts` — `LessonStepType = "ACTION_STEP" | "MCQ_STEP" | "INFO_STEP"`.
- **Content schema:** `content/lessons/content/lesson-step-config.schema.json` — `type` enum includes all three; `options` array required for MCQ (optionKey, label, displayOrder).
- **API/OpenAPI:** Step type and `LessonOption[]` are part of the lesson-detail and submit contracts.

### 2.2 MCQ-specific shape

- **Step config (content):** For `type: "MCQ_STEP"`, step must have:
  - `options`: array of `{ optionKey, label, displayOrder }` (min 2; validated in `scripts/check-lessons-content.ts`).
  - `gradingSpecJson`: must include `type: "MCQ_STEP"` and `expectedOptionKey` (string) for the correct option.
- **Grading:** `src/lessons/grading/LessonGradingEngine.ts` — `gradeStep()` for `MCQ_STEP` compares `answer.optionKey` to `spec.expectedOptionKey`; supports `responseCorrect`, `responseIncorrect`, `followUpContent`, `evBb`, `evErrorBb`, `takeawayIncorrect`, `frequencyPerMonth`.
- **Submit payload:** `{ optionKey: string }`. Validated by `hasValidMcqAnswer()` (non-empty string `optionKey`).

---

## 3. UI support for multiple choice

### 3.1 Existing components

- **LessonQuestionPanel** (`LessonQuestionPanel.tsx`): Renders only when `step.type === "MCQ_STEP"`. Shows "Multiple Choice" label and a list of buttons (one per `step.options`). On press, calls `onSelectOption(option.optionKey)` — **submit is immediate on option click** (no separate "Submit" button).
- **LessonContent:** Wires `LessonQuestionPanel` with `session.submitMcqOption(step.id, optionKey)` and passes `selectedOptionKey`, `loading`, `disabled`.
- **useLessonSession:** Exposes `submitMcqOption(stepId, optionKey)` and `selectedOptionKey` (from `selectedOptionByStepId[currentStep.id]`); submit sends `{ optionKey }` to the submit endpoint.
- **LessonInstructorPanel:** Shows feedback (response, followUp, evBb, takeaway). For community/distribution display, `formatCommunityResponseLabel` supports MCQ: `responseKey` can be raw `optionKey` or `mcq:<key>`; label is resolved from `step.options` by optionKey.

### 3.2 Table / snapshot behavior for MCQ

- **LessonContent** currently requires `step.snapshot` to be non-null for rendering the table and scene: `if (!stepSnapshot) return ... snapshotUnavailable`. So an MCQ step **can** show a table snapshot (e.g. a flop with pot and bet) and the question can be contextual (“Given this situation, what break-even equity do you need?”). Pure “math only” MCQ with no snapshot would require a small client change to allow null snapshot for MCQ (e.g. show a minimal card or text-only panel). **Recommendation:** Use a snapshot for the first Pot Odds MCQ so we don’t change the “snapshot required” assumption.

### 3.3 E2E

- `lessons-instructor-loop.spec.ts` already branches on `step.type === "MCQ_STEP"`: it looks for option labels and clicks one, then looks for “Submit answer” and feedback. Current app behavior is **submit on option click** (no separate Submit button). The E2E may need a small update to remove the “Submit answer” click for MCQ or align with desired UX.

---

## 4. Seeding and data

### 4.1 Seed script

- **Script:** `scripts/seed-lessons-content.ts`.
- **Behavior:** Reads `content/lessons/content/L01`…`L15` (directories matching `L\d{2}`), loads each `step-config.json`, upserts `Lesson` and `LessonStep`. For each step, if `step.options` is present, it **deletes** existing `LessonStepOption` rows for that step and **creates** one `LessonStepOption` per option (`stepId`, `optionKey`, `label`, `valueJson`, `displayOrder`, `isCorrect`). So **MCQ options are already seeded** from `step-config.json`; no extra script is needed for options.
- **Snapshot:** For each step, if `step.snapshotPath` is set, the script loads the JSON from `lessonDir/snapshotPath`, parses with `TableSnapshotPayloadSchema`, and stores it in `LessonStep.snapshotJson`. So a new lesson (e.g. L16) only needs a `step-config.json` and, for an MCQ step that shows a table, a snapshot file (e.g. `snapshots/main.json` or reuse `_shared`).

### 4.2 What’s missing for MCQ

- **No lesson directory** with `type: "MCQ_STEP"` in any step. Adding a new lesson (e.g. `content/lessons/content/L16`) with one INFO and one MCQ step, plus a snapshot for the MCQ step, is sufficient for the seed to persist lesson, steps, options, and snapshot.
- **Curriculum lock:** `content/lessons/content/curriculum.lock.json` currently has `lessonCount: 15`, `stepCount: 30`. Adding L16 (e.g. 2 steps) would require updating the lock to 16 lessons and 32 steps (or whatever the new totals are) if the project enforces this file strictly.

---

## 5. Pot-odds context (existing references)

- **Blog:** `apps/client/src/content/blog/articles/pot-odds-plain-english.ts` — explains pot odds (e.g. 100 in pot, villain bets 50 → 3:1 → need 25% to break even). Good alignment for a “break-even %” or “call or fold?” MCQ.
- **Roadmap:** `docs/roadmaps/POKER_SCHOOL_IMPLEMENTATION_ROADMAP.md` — “Lesson 2: poker math/situational MCQ with question -> response -> follow-up” and concept tags like `pot_odds`.
- **Design:** `docs/roadmaps/POKER_LESSONS_PAGE_DESIGN.md` — “Draws/pot-odds quick checks.”
- **Snapshots:** Existing lesson snapshots (e.g. L01, L02) already include `hero.calculations.potOddsPct`. A Pot Odds MCQ can use a snapshot where the pot and bet are set so the correct “break-even %” is clear (e.g. pot 100, bet 50 → 25%).

No dedicated “pot odds lesson” or “math question” content exists yet; the idea was planned but not implemented.

---

## 6. Proposed solution: Pot Odds MCQ lesson

### 6.1 Goal

- Add the **first canonical MCQ lesson** so we have a working example and can validate seed, API, grading, and UI for MCQ.
- Use a **pot-odds** theme (align with blog and roadmap) and a single, clear question (e.g. “What break-even equity do you need to call?” or “Do pot odds justify a call?”).

### 6.2 Option A: New lesson L16 (recommended)

- **Id:** L16.
- **Title:** e.g. “Pot Odds Quick Check” or “Break-Even %”.
- **Module:** e.g. MODULE_A (foundational).
- **Steps:**
  1. **INFO_STEP** — Short intro: “In this drill you’ll use the pot and bet to find the break-even equity. No table action; just pick the right number.”
  2. **MCQ_STEP** — One question, e.g. “Pot is 100, villain bets 50. What break-even equity do you need to call?” Options: e.g. “25%”, “33%”, “50%”, “67%” with `expectedOptionKey: "25"` (or similar). Snapshot: reuse an existing flop snapshot (e.g. from `_shared` or L01) or add a minimal `L16/snapshots/main.json` with pot 10000¢, bet 5000¢ so pot odds are 33.33% (or 25% if we set pot/bet accordingly). Grading: `gradingSpecJson` with `type: "MCQ_STEP"`, `expectedOptionKey`, `responseCorrect`, `responseIncorrect`, `followUpContent`.

**Seed:** Add directory `content/lessons/content/L16` with:

- `lesson.md` (optional): one-line description.
- `step-config.json`: lessonId L16, title, moduleCode, recommendedOrder (e.g. 16), role `teaches`, repeatable true/false, steps [INFO, MCQ].
- `snapshots/main.json` (for MCQ step): copy from an existing lesson and set `hand.potCents`, `hand.roundCurrentBetCents`, and hero’s `actionOptions.callAmount` so the math matches the correct option (e.g. 25% break-even).

Run existing seed: `pnpm lessons:seed:content` (and `--replace-noncanonical` if desired). No new seeding script required; the current script already supports MCQ options and snapshots.

**Lock:** Update `curriculum.lock.json`: `lessonCount: 16`, `stepCount: 32` (or actual totals).

### 6.3 Option B: Add an MCQ step to an existing lesson

- Add a third step to one lesson (e.g. L01): INFO, ACTION, then MCQ (pot-odds question). Pros: no new lesson id, reuses L01’s table. Cons: changes existing lesson flow and step count; may complicate “one decision per lesson” expectations. Less clean than a dedicated quick-check lesson.

**Recommendation:** Option A (new L16) keeps a clear separation (one lesson = one concept) and gives a dedicated “math/MCQ” lesson for future replication.

### 6.4 Grading spec example (MCQ step)

```json
{
  "type": "MCQ_STEP",
  "expectedOptionKey": "25",
  "responseCorrect": "Correct. You need 25% equity to break even when getting 3:1.",
  "responseIncorrect": "Not quite. With pot 100 and a 50 bet, you're getting 3:1 (25% to break even).",
  "followUpContent": "Pot odds: pot is 100, bet 50. You're getting 150:50 = 3:1, so you need to win 1 in 4 times = 25% to break even."
}
```

### 6.5 Snapshot for MCQ

- Use a snapshot where:
  - `hand.potCents` and hero’s `actionOptions.callAmount` (and any round bet) match the intended scenario (e.g. 10000 and 5000 → 33.33%; or 10000 and 5000 with pot already including the bet so effective odds are 25% — align with your exact question).
- Optionally set `hero.calculations.potOddsPct` to the correct value so the table UI can show the same number after the user answers (if you show calculations on reveal).

---

## 7. Implementation checklist

- [ ] Add `content/lessons/content/L16` with `step-config.json` (INFO + MCQ steps), optional `lesson.md`.
- [ ] Add MCQ step `options` (e.g. 4 choices) and `gradingSpecJson` with `expectedOptionKey`, response/followUp copy.
- [ ] Add or reuse snapshot for MCQ step (e.g. `L16/snapshots/main.json`) with pot/bet matching correct answer.
- [ ] Run `pnpm lessons:content:check` (and fix schema/validation if needed).
- [ ] Update `curriculum.lock.json` (lessonCount, stepCount) if the project uses it.
- [ ] Run `pnpm lessons:seed:content` (and `--replace-noncanonical` if desired).
- [ ] Manually test: open L16, complete INFO, answer MCQ (correct and wrong), confirm feedback and follow-up.
- [ ] Optionally adjust E2E for MCQ (remove “Submit answer” click if submit-on-select is the intended UX).
- [ ] Add L16 to any docs that list canonical lessons (e.g. LESSONS_PAGE_INVENTORY.md).

---

## 8. Summary

| Area            | Status | Notes |
|-----------------|--------|--------|
| Lesson/step types | Done  | MCQ_STEP defined in types, schema, API. |
| MCQ grading      | Done  | expectedOptionKey, responseCorrect/Incorrect, followUp. |
| MCQ submit/API   | Done  | Payload `{ optionKey }`, validated and graded. |
| Seed script      | Done  | Reads options from step-config, writes LessonStepOption; loads snapshots. |
| Client UI        | Done  | LessonQuestionPanel, submitMcqOption, instructor feedback. |
| MCQ content      | Done  | L16–L20 in MODULE_D: pot odds (25%, 33%, 50%) and rule of 4 (9 outs→36%, 8 outs→32%). |
| Pot-odds / math  | Done  | Five scenarios seeded; content check and seed pass. |
