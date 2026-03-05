# Lessons Pipeline: Authoring → Projection → Runtime

**Purpose:** Propose a lesson pipeline that makes full-hand lessons easy to produce, keeps content DRY (base snapshot + action sequence), and guarantees correctness by **reusing the real engine** for projection. The existing lesson runtime stays unchanged: the client still receives one full snapshot per step; generation happens at seed/export time.

**Date:** 2026-03-05  
**Related:** [FULL_HAND_GHOST_LESSON_ROADMAP.md](../roadmaps/FULL_HAND_GHOST_LESSON_ROADMAP.md) · [LESSON_EXPORT_SYSTEM.md](LESSON_EXPORT_SYSTEM.md) (current implementation)

**Core philosophy:** Do not invent a separate state system. The flow is: **real hand → engine replay → capture hero decision snapshots → generate lesson.** The engine is the single authority for poker state.

---

## 1. Objectives

| Objective | Description |
|-----------|-------------|
| **Easy production** | Full-hand lessons should not require manually authoring large JSON snapshots for every step. |
| **Minimal state** | Store the minimum necessary state (e.g. base snapshot + action sequence); project full snapshots automatically. |
| **Determinism** | Lesson states are generated from deterministic game logic, not hand-written snapshots, so they cannot drift. |
| **Runtime unchanged** | The client still receives a full snapshot per step; projection happens during seed/export, not in the client. |
| **Authoring workflows** | Lessons can be created from (1) real hands/replays, or (2) a base state + a defined pro action sequence. |
| **DRY content** | Lesson definitions describe hand progression (actions), not repeated full game states. |
| **Validation** | Next snapshot must be consistent with the pro action that produced it; validation fails fast on drift. |
| **Scalable production** | Creating a new “ghost a pro” lesson is mostly: select hand → define pro line → optionally add teaching text. |

---

## 2. Current implementation (Phase 1)

The **replay → lesson exporter** is implemented. No projection or engine apply-action yet.

| What | Status |
|------|--------|
| **Export from replay** | ✅ CLI: `pnpm lessons:export:replay --handId=... --heroSeat=...` |
| **Step metadata** | ✅ street, board, proActionSeat, proActionAmountCents in step-config |
| **replayHandId** | ✅ Set from handId at export; seed persists to Lesson; “Watch the full hand” works |
| **Snapshot fingerprint** | ✅ stateHash = sha1(snapshot) on export; seed uses it for duplicate detection |
| **maxSteps** | ✅ `--maxSteps=N` caps number of steps |
| **Ghost validation** | ✅ Seed: hero to act, expectedAction in options, consecutive snapshots differ |
| **Base + projection** | ❌ Not built; replay frames provide full snapshots |

See **[LESSON_EXPORT_SYSTEM.md](LESSON_EXPORT_SYSTEM.md)** for CLI usage, output layout, and validation.

---

## 3. Pipeline Overview

**Preferred path (replay → lesson):**

```
real hand
   ↓
engine replay
   ↓
capture hero decision snapshots
   ↓
generate lesson (step-config + snapshots or base + actions)
```

Projection, when used, also goes through the engine: **ephemeral table → apply action → read snapshot.** No separate state-transition logic.

**Full pipeline:**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ AUTHORING                                                                        │
│ • Replay → lesson exporter: hand → engine replay → capture hero-decision snaps   │
│ • Or: base snapshot + pro action sequence (projection uses engine)               │
└───────────────────────────────┬─────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ CONTENT (DRY)                                                                    │
│ • lesson dir: baseSnapshotPath (optional), step-config with proAction per step   │
│ • Or: snapshotPath per step (legacy / override)                                  │
└───────────────────────────────┬─────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ SEED / EXPORT                                                                    │
│ • Projection (if base+actions): ephemeral table, apply action, read snapshot      │
│ • Validation: next snapshot consistent with expectedAction                       │
│ • Write full snapshotJson per step to DB                                         │
└───────────────────────────────┬─────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ RUNTIME (unchanged)                                                              │
│ • getLesson returns steps with full snapshot per step                             │
│ • Client uses step.snapshot as today                                              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Content Model: Minimal State

### 4.1 Two modes

| Mode | Content shape | When to use |
|------|----------------|-------------|
| **Full snapshot per step** | Each step has `snapshotPath` → one JSON file per step. | Legacy; manual authoring; or override for a single step. |
| **Base + action sequence** | Lesson has `baseSnapshotPath` (or step 1 has `snapshotPath`). Each step has `proAction` (and optionally `opponentActionsUntilHero`). No `snapshotPath` for steps 2..N. | Preferred for full-hand ghost lessons; DRY. |

### 4.2 Step-config extensions (for base + actions)

- **Lesson-level (optional):**
  - `baseSnapshotPath`: path to the snapshot for “state before first hero decision.”
  - `heroSeat`: required for ghost; must match every step.
- **Per-step (optional):**
  - `proAction`: the pro’s action at this decision (e.g. `"CHECK"`, `"CALL"`, `"RAISE"`, `"FOLD"`, `"ALL_IN"`). Amount for bet/raise can be in grading spec or a small `proActionPayload` (e.g. `amountCents`) if needed.
  - `opponentActionsUntilHero`: optional ordered list of opponent actions between “after pro’s action” and “hero to act again” (for multiway). If omitted, inferred as “single opponent” or from engine when projecting.

Rule: for each step, either `snapshotPath` is set (load file) or the pipeline can derive the snapshot from base/previous + `proAction` (+ opponent actions). Schema validates one of these is possible.

### 4.3 Single source of truth

- **Pro line** = sequence of `proAction` (or `gradingSpecJson.expectedAction`) per step. These must be the same: the action used to produce the next snapshot is exactly the action we grade and show as “Pro played.”
- **Grading spec** continues to hold `expectedAction`, `acceptedCorrectActions`, responses, follow-up. For projected steps, `expectedAction` is set from `proAction` (or vice versa) so there is no duplication of “what the pro did.”

---

## 5. Projection: From Actions to Full Snapshots

**Risk:** If projection logic diverges from engine rules, lesson state will drift.  
**Solution:** Reuse the real engine instead of re-implementing poker rules.

### 5.1 Engine-based projection (no separate state system)

Do **not** implement a pure `applyActionToSnapshot(snapshot, action) → snapshot` that duplicates betting/street logic. Poker state is complex; the engine must remain the authority.

**Approach:**

1. Create an **ephemeral table** (in-memory or short-lived) from the current snapshot (or restore state from it).
2. **Apply the action** through the real engine (same path as gameplay).
3. **Read the snapshot** produced by the engine.

So: **ephemeral table → apply action → read snapshot.** Projection uses the exact same system as gameplay; no drift.

(Implementation details: may require a “replay” or “lesson projection” mode on the room/dealer that accepts a snapshot + action and returns the next snapshot, without persistence or real players. The contract is “same rules as live play.”)

### 5.2 Projection algorithm (seed/export)

1. **Step 1:**  
   If step has `snapshotPath` → load and use as step-1 snapshot.  
   Else if lesson has `baseSnapshotPath` → load and use.  
   Else → fail validation.

2. **Steps 2..N:**  
   If step has `snapshotPath` → load and use (override).  
   Else:
   - Take **previous step’s snapshot** (after projection).
   - **Engine projection:** create ephemeral table from that snapshot; apply previous step’s pro action (hero); apply any opponent actions until hero to act again; read snapshot from engine.
   - Result = this step’s snapshot (state before this step’s hero decision).

3. **Write:** For each step, store the computed (or loaded) snapshot in `LessonStep.snapshotJson`. Client never sees “base + actions”; it only sees full snapshots.

### 5.3 Determinism and consistency

- **Single authority:** All snapshot progression goes through the real engine; no separate state-transition code to maintain or drift.
- **Pro line lock:** `expectedAction` (grading) must equal the action used to produce the next snapshot. Validation enforces this (see §7).

---

## 6. Authoring Workflows

### 6.1 From real hands / replays (primary workflow)

- **Input:** Hand ID or replay (stored hand history + engine replay).
- **Process:**
  1. **Engine replay** of the hand (same engine as gameplay).
  2. At each **hero decision point**, capture the snapshot (state before hero acts).
  3. Extract “pro” line = sequence of actions actually taken by hero at those points.
  4. Export: either **full snapshots per step** (step_01.json … step_N.json) or **base snapshot + action sequence** for seed to project later.
- **Output:** Lesson directory with `step-config.json`, snapshots (or base + actions), and optional teaching text.
- **Benefit:** “Select a hand → export lesson.” No manual snapshot authoring; engine is the source of truth.

### 6.2 From base state + pro action sequence

- **Input:** One base snapshot (first hero decision) + ordered list of pro actions (and optionally opponent actions between hero decisions).
- **Process:**
  1. Author or paste base snapshot; author step-config with `proAction` (and grading text) per step.
  2. Seed runs projection (§4) and validation (§6).
  3. Full snapshots written to DB; no need to hand-write step_02.json … step_N.json.
- **Output:** Same as today from the runtime’s perspective (full snapshot per step in API).
- **Benefit:** DRY; changing the pro line is editing a short list of actions and re-running seed.

### 6.3 Optional teaching text

- **lesson.md**, step `beforeInstructorMessage`, `question`, `followUpInstructorMessage`, and grading copy can be added or overridden without touching snapshot data.
- Pipeline does not require teaching text to project state; text is additive.

---

## 7. Validation and Determinism

### 7.1 Validation (seed or export)

Run for every lesson that uses base + action sequence (and optionally for all ghost lessons):

| Check | Description |
|-------|-------------|
| **Hero to act** | Each snapshot has `hand.toActSeat === hero.seat`. |
| **Hero seat consistency** | All steps share the same hero seat (lesson `heroSeat` or inferred from first snapshot). |
| **expectedAction in options** | `expectedAction` is allowed by `snapshot.hero.actionOptions` (e.g. CHECK → canCheck). |
| **Pro line = projection** | For each consecutive pair of steps, the next snapshot equals the result of engine projection (ephemeral table + apply expectedAction + read snapshot). No drift. |
| **Fingerprint difference** | Consecutive snapshots differ (e.g. street, potCents, board, stateHash). |
| **Pot/stack/board** | Deltas match the applied actions (no impossible states). |

If any check fails: fail seed or export with a clear error (lesson id, step id, and what failed).

### 7.2 Determinism guarantees

- **No hand-written “next” snapshot** when using base + actions: the next snapshot is always produced by the engine (ephemeral table + action).
- **Single source of truth for pro line:** `proAction` / `expectedAction` is both the grading answer and the input to projection.
- **Schema:** Enforce that when `proAction` is present, `expectedAction` matches (or is derived from it) so grading and projection cannot diverge.

---

## 8. Runtime Contract (Unchanged)

- **getLesson:** Returns lesson with steps; each step has a **full** `snapshot` (TableSnapshotPayload). No “base + delta” or “action list” in the API.
- **Client:** Uses `step.snapshot` as today; no client-side apply-action or projection.
- **Submit / grading:** Unchanged; grading uses `expectedAction` / `acceptedCorrectActions` from grading spec; feedback and “Pro played” from existing detail payload.

So: the pipeline only changes **how** full snapshots are produced (authoring + seed/export). The runtime and API contract stay the same.

---

## 9. What not to build

Do **not** add:

- **Complex delta formats** (e.g. custom state diff between steps).
- **JSON Patch systems** for snapshot updates.
- **Custom state-diff logic** or a second implementation of betting/street rules.

Poker state is complex; the **engine remains the authority**. Projection = run the engine (ephemeral table, apply action, read snapshot). Validation = compare content to engine output. No parallel state system.

---

## 10. Implementation Phases (priority order)

### 1️⃣ Replay → lesson exporter (first — biggest productivity gain)

- **Input:** Hand ID or replay (hand history + engine).
- **Process:** Engine replay → at each hero decision point, capture snapshot; extract pro line (actions taken).
- **Output:** Lesson directory: step-config + full snapshots per step (or base + action sequence). Optional teaching text.
- **Benefit:** “Select a hand → export lesson.” No manual JSON authoring for full-hand lessons. This unblocks scalable lesson production before we reduce duplication in content.

### 2️⃣ Snapshot projection (second — reduces duplication)

- **Engine projection:** Ephemeral table from snapshot → apply action → read snapshot. Reuse real engine; no separate apply-action reimplementation.
- **Content schema:** Optional `baseSnapshotPath` (lesson), `proAction` (+ optional opponent actions) per step. Seed: when step has no `snapshotPath`, run engine projection from previous (or base) snapshot; write `snapshotJson`.
- **Benefit:** Content can be “base + action sequence” instead of N full snapshot files; seed still writes full snapshots to DB.

### 3️⃣ Validation (third — protects content quality)

- **Checks:** Hero to act, hero seat consistency, expectedAction in options, consecutive snapshots differ.
- **Pro line = projection:** For base+action lessons, next snapshot must match engine projection from prev + expectedAction. Fail seed/export with clear error if drift.
- **Benefit:** Catches author mistakes and keeps lessons consistent with engine.

(Existing full-hand lessons that use full snapshot per step can use validation as soon as it’s implemented; projection is optional and comes after the exporter.)

---

## 11. File and Schema Summary

### 11.1 Content (on disk)

- **Lesson dir:** `step-config.json`, optional `baseSnapshotPath`, optional `lesson.md`.
- **Steps:** Either `snapshotPath` (per step) or `proAction` (+ optional `opponentActionsUntilHero`). First step may use `baseSnapshotPath` at lesson level or its own `snapshotPath`.
- **Grading:** `gradingSpecJson.expectedAction` (and acceptedCorrectActions, responses) per step; must match `proAction` when both are present.

### 11.2 Seed/export

- Reads step-config; for each step, resolves snapshot via file load or projection; validates; writes `LessonStep.snapshotJson`.

### 11.3 DB and API

- No change to `Lesson` / `LessonStep` schema for pipeline v1. Steps still have `snapshotJson` (full snapshot). Optional later: store `proAction` or action sequence in DB for analytics or replay linking; runtime still receives full snapshot per step.

---

## 12. Summary

- **Pipeline:** Author (replay or base + pro line) → DRY content (base + actions or per-step paths) → Seed/export (project full snapshots, validate) → Runtime (unchanged; full snapshot per step).
- **DRY:** Lesson definitions describe hand progression (actions); full snapshots are generated, not hand-copied.
- **Correctness:** Engine-based projection (ephemeral table → apply action → read snapshot) + validation ensures the next snapshot is always consistent with the pro action; no separate state system.
- **Scalability:** New ghost lesson = select hand (or base) + define pro line + optional text; projection and validation do the rest.

This plan aligns with the full-hand ghost roadmap and focuses on the **data pipeline** (authoring → content → projection → runtime) and the **mechanics** of minimal state and deterministic projection.
