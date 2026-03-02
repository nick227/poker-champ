# Poker Lessons Content Backfill And Preparation Plan

## 1) Goal
Establish a reliable content pipeline for lesson backfill so lesson quality, grading determinism, and release safety are consistent as we scale.

Primary outcome:
- Content authors can produce premium lesson steps.
- Engineering can validate and seed them deterministically.
- QA can verify instructional and runtime correctness before release.

## 2) Scope
Covers:
- Lesson source-of-truth authoring format
- Backfill workflow for existing PoC lessons
- Seed preparation and validation gates
- Content QA rubric and release checklist

Does not cover:
- Solver integration internals
- Historic rights/legal operations details
- Full CMS authoring UI

## 3) Source Of Truth Strategy
Use a single canonical content source per lesson, versioned in git.

Recommended structure:
- `docs/lessons/content/<lesson-id>/lesson.md` (human narrative)
- `docs/lessons/content/<lesson-id>/step-config.json` (runtime config + grading keys)
- `docs/lessons/content/<lesson-id>/snapshots/*.json` (snapshot payloads)

Why:
- Human-readable instruction copy stays reviewable.
- Runtime-critical config remains deterministic and machine-validated.
- Snapshot evolution is explicit and diffable.

## 4) Backfill Data Contract (Per Step)
Each step backfill entry must include:
- `id`
- `sequence`
- `type` (`INFO_STEP` | `MCQ_STEP` | `ACTION_STEP`)
- `snapshotVersion`
- `gradingVersion`
- `beforeInstructorMessage`
- `question`
- `followUpInstructorMessage`
- `gradingSpecJson`

V2 capability fields (for migrated steps):
- `scenarioProviderKey`
- `evaluatorKey`
- `revealLayerKeys[]`
- `continuationKey?`
- `runtimeConfigJson?`
- `displayCategory?` (editorial only)

## 5) Content Preparation Workflow
1. Draft lesson copy using premium template.
2. Define step sequence and exact graded decisions.
3. Attach/author snapshots per step.
4. Author grading specs and expected keys.
5. Add concept tags and weights.
6. Add runtime capability config for migrated V2 steps.
7. Run validation script.
8. Run seed script in staging.
9. Execute QA checklist.
10. Approve for rollout wave.

## 6) Validation Gates (Required)
Gate A: Schema validity
- Snapshot JSON passes baseline shape validation.
- Snapshot JSON parses as `TableSnapshotPayload` in strict mode.
- Step config parses expected step schema.

Gate B: Version compatibility
- `snapshotVersion` supported by runtime.
- `gradingVersion` supported by evaluator.

Gate C: Grading determinism
- Same input answer for same step produces same result.
- Idempotent submit behavior verified for `(attemptId, stepId)`.

Gate D: UX readiness
- Message sequence is coherent: before -> question -> response -> follow-up.
- No empty instructional copy on graded steps.

Gate E: Value framing quality
- Includes EV or decision-quality explanation.
- Includes bankroll impact framing where applicable.

## 7) Backfill Priority Order
Backfill in this order for maximum learning ROI and product credibility:
1. L1 RFI Discipline
2. L3 BB Defense
3. L2 3-bet/call/fold buckets
4. L5 C-bet dry boards
5. L7 Draws and pot odds

Reason:
- High-frequency nodes first
- Fast measurable impact
- Strong “must-have” perception early

## 8) Seed And Migration Strategy
Phase A (V1-safe):
- Keep existing seed contract intact.
- Add optional V2 runtime config into step payloads (already compatible).

Phase B (V2 progressive migration):
- Migrate one step per lesson to explicit capability keys.
- Keep legacy steps functioning through adapter.

Phase C (full capability config):
- All graded steps authored with provider/evaluator/reveal/continuation keys.

## 9) QA Checklist For Backfilled Lessons
Instructional QA:
- Copy is premium and practical, not generic.
- Non-obvious insight present.
- Wrong-answer feedback is analytical, not vague.

Runtime QA:
- Step loads correct snapshot.
- Correct input surface is active (ActionBar vs MCQ panel).
- Submit lock and evaluating state behave correctly.
- Reveal cards render for migrated V2 steps.

Data QA:
- Concept tags and weights present.
- Grading debug output matches authored key.
- No snapshot/version mismatch errors.

## 10) Release Packaging
For each lesson wave release, include:
- Seed diff summary
- Validation report (schema/version/determinism)
- QA signoff checklist
- Rollback plan (seed/version fallback)

## 11) Immediate Next Actions
1. Wire `pnpm lessons:content:check` into CI preflight.
2. Enable strict snapshot validation in CI (`LESSONS_STRICT_SNAPSHOT=1`) once shared snapshots are finalized.
3. Backfill one V2 capability-configured graded step in each of L1-L3.
4. Run staging seed + manual QA on migrated L1-L3 steps.
5. Publish first content QA signoff report with deterministic grading checks.

## 12) Definition Of Done (Content Backfill Foundation)
Foundation is complete when:
- L1-L3 content exists in canonical file structure.
- Validation script catches malformed snapshot/step configs.
- At least one migrated V2 step per lesson is seeded and testable.
- QA checklist is documented and used in staging signoff.
