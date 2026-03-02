# Poker Lessons V2 Platform Roadmap

## 1) Purpose
Define the V2 platform architecture so we can ship advanced lesson experiences on one runtime without branching explosion.

V2 outcomes:
- Add long-tail lesson experiences without one-off runtimes
- Keep one consistent teaching surface and state machine
- Support infinite/generated content with deterministic grading
- Preserve replay/live isolation and ActionBar reuse

## 2) Core Architectural Decision (Locked)
All lesson experiences reduce to one structural pipeline:

`DecisionNode -> Submission -> Evaluation -> RevealStack -> OptionalContinuation`

Examples that all map to this pipeline:
- Generated math questions
- WWYD with crowd + solver compare
- Historic hand takeover
- Standard lessons

Principle:
- Persist behavior (capabilities), not intent labels (modes).

## 3) UX Contract (Locked)
Single instructional surface is mandatory:
- `LessonHalfSheet` owns prompt, feedback, reveal cards, and progression
- Table is context + interaction surface for `ACTION_STEP`

Unified state machine:
- `BEFORE`
- `QUESTION`
- `SUBMITTING`
- `EVALUATED`
- `REVEAL_1..N`
- `CONTINUATION` (optional)
- `ADVANCING`
- `COMPLETE`

Input policy:
- `ACTION_STEP` uses real ActionBar only
- `MCQ_STEP` options render in half-sheet only
- Toasts are numeric insights only (never grading/progression)

## 4) Runtime Model (Capability-First)
Use one engine: `useDecisionNodeRuntime()`.

Runtime responsibilities:
- load scenario from provider
- manage submit lock/freeze UX
- call evaluator deterministically
- execute reveal layers sequentially
- invoke optional continuation
- emit analytics events

No branching on lesson mode enums.

## 5) Shared Primitives
### A) ScenarioProvider
Provides decision state.

Output contract:
- `DecisionScenario`
- `snapshot?`
- `mcqOptions?`
- `heroCards?`
- `metadata?`

Examples:
- static snapshot provider
- generated math provider
- historic timeline node provider
- replay snapshot provider

### B) Evaluator
Deterministic grading for submission.

Output contract:
- `EvaluationResult`
- `gradeType` (`binary` | `frequency` | `numeric`)
- `expectedAction?`
- `evDelta?`
- `explanation`
- `gradingVersion`

### C) RevealLayer
Sequential reveal modules inside half-sheet.

Examples:
- `EVImpactRevealLayer`
- `CrowdRevealLayer`
- `SolverRevealLayer`
- `HistoricCompareRevealLayer`
- `RunoutRevealLayer`

### D) ContinuationProvider (optional)
Advances state after reveal.

Output contract:
- `ContinuationPayload`
- `nextSnapshot?`
- `timelinePointer?`
- `animationHints?`

## 6) Framing Composition Examples
Generated Math:
- `scenarioProviderKey: generated_odds`
- `evaluatorKey: numeric_equity_eval`
- `revealLayerKeys: [ev_impact]`
- `continuationKey: next_generated`

WWYD + Compare:
- `scenarioProviderKey: static_snapshot`
- `evaluatorKey: action_rubric_eval`
- `revealLayerKeys: [ev_impact, crowd_compare, solver_reference]`
- `continuationKey: replay_continue`

Play-As Historic:
- `scenarioProviderKey: historic_timeline_node`
- `evaluatorKey: action_rubric_eval`
- `revealLayerKeys: [historic_compare, solver_reference]`
- `continuationKey: historic_timeline_continue`

## 7) Content Schema Strategy
Do not use `modeType` as runtime driver.

Persist per-step runtime config:
- `stepType` (`INFO_STEP` | `MCQ_STEP` | `ACTION_STEP`)  // input pattern only
- `scenarioProviderKey`
- `evaluatorKey`
- `revealLayerKeys[]`
- `continuationKey?`
- `configJson?`
- `displayCategory?` (editorial/filtering only, never runtime branching)

## 8) Data Model Roadmap (Additive)
### LessonStep V2 fields
- `scenarioProviderKey` (string)
- `evaluatorKey` (string)
- `revealLayerKeys` (json array)
- `continuationKey` (string nullable)
- `runtimeConfigJson` (json nullable)
- `displayCategory` (string nullable)

### Generated instances
- `LessonGeneratedInstance`
- `id`, `attemptId`, `stepId`, `generationSeed`, `questionPayloadJson`, `answerKeyJson`, `createdAt`

### Crowd compare
- `LessonScenarioAggregate`
- `scenarioKey`, `populationSegment`, `actionDistributionJson`, `sampleSize`, `updatedAt`

### Solver references
- `LessonSolverReference`
- `scenarioKey`, `assumptionProfile`, `strategyJson`, `evJson`, `version`, `updatedAt`

### Historic scenarios
- `LessonHistoricScenario`
- `id`, `sourceHandId`, `playableNodeIndex`, `heroSeat`, `namePolicy`, `timelineJson`

### Idempotency guard
- Unique `(attemptId, stepId)` remains required

## 9) API Roadmap
- `POST /v1/lessons/:lessonId/attempts/:attemptId/steps/:stepId/generate`
- deterministic generated payload for generation-backed providers

- `POST /v1/lessons/:lessonId/attempts/:attemptId/steps/:stepId/submit`
- returns `gradingResult` + optional reveal/continuation payload refs

- `GET /v1/lessons/scenarios/:scenarioKey/compare`
- crowd + solver reveal payloads

- `GET /v1/lessons/historic/:scenarioId`
- historic timeline and play-node metadata

Unified response envelope:
- `gradingResult`
- `revealResults[]` (ordered)
- `continuationResult?`
- `insightCards?`

## 10) Runtime Folder Structure (Client)
- `features/lessons-v2/runtime/useDecisionNodeRuntime.ts`
- `features/lessons-v2/providers/scenario/*`
- `features/lessons-v2/providers/evaluator/*`
- `features/lessons-v2/providers/reveal/*`
- `features/lessons-v2/providers/continuation/*`
- `features/lessons-v2/components/LessonHalfSheetV2.tsx`

Integration constraints:
- Reuse existing table/replay rendering
- Use ActionBar override hook for ACTION submission
- No realtime socket joins in lesson runtime

## 11) Migration Plan (Mode-Based -> Capability-Based)
### Current draft risk
- `modeType` as runtime switch leads to branching growth and enum sprawl.

### Migration path
1. Add capability fields to `LessonStep` while keeping old fields read-only
2. Introduce runtime adapter that maps old mode configs to capability config
3. Migrate first 1-2 lessons to pure capability config
4. Remove runtime branching on `modeType`
5. Keep `displayCategory` for editorial filtering only

### Backward compatibility
- Old content can be hydrated through adapter during transition window
- New content authoring must use capability config only

## 12) Quality, Fairness, and Trust Controls
Generated questions:
- legal card-state validation
- distractor plausibility checks
- deterministic seed replay

Compare data:
- show sample size and freshness
- show solver assumptions (stacks, ranges, rake profile)
- mark low-confidence data

Historic data:
- signed provenance for source hand
- privacy/rights-gated naming policy

Feedback standard:
- action quality + EV intuition + bankroll framing + correction step

## 13) Rollout Plan
Phase V2.0 (engine foundation):
- ship `useDecisionNodeRuntime`
- ship provider registries (scenario/evaluator/reveal/continuation)
- migrate 1 existing lesson

Phase V2.1 (generated math):
- add `generated_odds` scenario provider + numeric evaluator
- ship first math drill sequence

Phase V2.2 (WWYD compare):
- add crowd + solver reveal layers
- ship replay continuation from decision node

Phase V2.3 (historic play-as):
- add historic scenario provider + timeline continuation
- ship anonymized pilot scenarios

Phase V2.4 (closed-loop polish):
- add per-capability performance summaries
- add biggest-leak driven recommendations

## 14) Success Metrics
Platform health:
- % lesson steps executed via capability runtime
- runtime error rate by provider key

Learning value:
- accuracy improvement by concept/provider
- time-to-correct-answer trend
- post-lesson stat movement over next 10k hands

Premium credibility:
- compare panel engagement rate
- % steps with EV + bankroll framing
- trust score on feedback usefulness

## 15) Key Risks and Mitigations
Risk: branching reintroduced via hidden mode checks
- Mitigation: lint/code review rule: no runtime branching on `modeType`

Risk: provider contract drift
- Mitigation: contract tests per provider type + shared fixtures

Risk: untrusted compare data
- Mitigation: explicit metadata on assumptions/sample size/freshness

Risk: privacy issues on historic identities
- Mitigation: default anonymization + explicit rights flags

## 16) Immediate Next Actions
1. Finalize TypeScript interfaces for provider contracts
2. Add `LessonStep` capability fields and migration script
3. Implement `useDecisionNodeRuntime` + registry bootstrap
4. Build one generated-math pilot step
5. Build one WWYD step with crowd/solver reveal stack
6. Build one historic play-as pilot step

## 16.1) High-Level V2 Feature Tracks
The following tracks are planned at high level and should remain capability-based (no runtime branching by mode):

1. Solver compare
- Delivered as reveal layers (`solver_reference`, optional `solver_ev_breakdown`)
- Requires assumption metadata (ranges, stacks, rake profile, freshness/version)
- UX goal: concise recommendation + practical exploit note

2. Crowd distribution
- Delivered as reveal layer (`crowd_compare`)
- Requires scenario keying + sample size/freshness metadata
- UX goal: show user action versus population tendencies without overloading

3. Historic continuation
- Delivered as continuation provider (`historic_timeline_continue`) + reveal (`historic_compare`)
- Requires source provenance and identity policy controls
- UX goal: act at node, compare, then continue to actual outcome timeline

4. Math generator
- Delivered as scenario provider (`generated_odds`) + numeric evaluator
- Requires deterministic seed persistence and legal state validation
- UX goal: infinite drill supply with reproducible grading

5. New animations
- Delivered as presentation layer enhancements only (no runtime logic changes)
- Applied to state transitions (`SUBMITTING`, `REVEAL`, `CONTINUATION`) after behavior is stable
- UX goal: smoother progression and better perceived responsiveness

6. Styling overhaul
- Delivered as design-system pass on half-sheet/reveal cards/compare surfaces
- Must preserve single teaching surface and interaction lock rules
- UX goal: premium training feel without changing runtime contracts

## 17) Definition of Done (V2 Pilot)
Pilot is successful when:
- One step shipped in each target framing via same runtime engine
- No runtime branching on `modeType`
- Action steps use real ActionBar path with deterministic grading
- Reveal layers run sequentially in unified half-sheet lifecycle
- Continuation works for replay and historic timeline
- Replay/live isolation remains intact
