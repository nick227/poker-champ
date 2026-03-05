# Lesson Export System (Replay → Lesson)

**Status:** Implemented (Phase 1).  
**Date:** 2026-03-05  
**Related:** [LESSONS_PIPELINE.md](LESSONS_PIPELINE.md), [FULL_HAND_GHOST_LESSON_ROADMAP.md](../roadmaps/FULL_HAND_GHOST_LESSON_ROADMAP.md)

---

## 1. Overview

The **replay → lesson exporter** turns a played hand (with persisted replay frames) into a full-hand ghost lesson. No manual snapshot authoring; the engine’s replay frames are the source of truth.

**Pipeline:**

```
hand (with TableSnapshotLog frames)
   → export script (hero decision points + pro line)
   → lesson dir (step-config + snapshots)
   → seed (validation + DB)
   → runtime (unchanged: full snapshot per step)
```

**What is not implemented yet:** Base snapshot + projection, JSON patch/delta, apply-action engine. Replay frames already provide full snapshots per decision; projection is optional later.

---

## 2. Prerequisites

- **Hand** must exist and be ended (`endedAt` set).
- **Replay frames** must exist for that hand. Enable snapshot persistence when the hand is played:
  - `FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE=true`
- Only hands played after enabling that feature will have replay data.

---

## 3. CLI

```bash
pnpm lessons:export:replay --handId=<id> --heroSeat=<0-8> [--lessonId=L22] [--outDir=<path>] [--maxSteps=10]
```

| Option       | Required | Description |
|-------------|----------|-------------|
| `--handId`  | Yes      | Hand ID (from history / DB). |
| `--heroSeat`| Yes      | Seat index of the “pro” (hero) for this lesson. |
| `--lessonId`| No       | Lesson ID for step-config (default `L22`). |
| `--outDir`  | No       | Output directory (default `content/lessons/content/<lessonId>`). |
| `--maxSteps`| No       | Cap number of steps (e.g. `10` for first 10 hero decisions). |
| `--force`   | No       | Overwrite existing lesson dir (step-config or export-meta present). |

**Example:**

```bash
pnpm lessons:export:replay --handId=abc123 --heroSeat=1 --lessonId=L22 --maxSteps=8
```

After export, run the seed to load the lesson into the DB:

```bash
pnpm lessons:seed:content
```

### 3.1 List hands with replay

```bash
pnpm lessons:list-replay-hands [--limit=50] [--minDecisions=4] [--maxDecisions=8]
```

| Option           | Description |
|------------------|-------------|
| `--minDecisions` | Only show hands where at least one seat has this many hero decisions (e.g. 4). |
| `--maxDecisions` | Only show hands where that seat has at most this many (e.g. 8). |
| `--limit`        | Max hands to return (default 50). |

Output per hand: `handId`, `endedAt`, `seats` (each with `seat`, `decisions`, `streets`), and **bestSeat** / **decisionCount** / **streets** — the recommended seat for export (prefers hands reaching TURN or RIVER). Then export with:

```bash
pnpm lessons:export:replay --handId=<handId> --heroSeat=<bestSeat>
```

### 3.2 Auto-export (batch)

```bash
pnpm lessons:export:auto [--count=10]
```

Scans replay hands (4–8 decisions), picks best seat per hand, and exports to L22, L23, … L31. Then edit titles/copy and run seed.

---

## 4. What Gets Written

### 4.1 Directory layout

```
<outDir>/
  step-config.json    # Lesson + steps (metadata, grading, paths)
  export-meta.json    # handId, heroSeat, decisionCount, streets, generatedAt (traceability)
  lesson.md           # Placeholder description
  snapshots/
    step_01.json
    step_02.json
    ...
```

**Duplicate guard:** If the lesson dir already contains `step-config.json` or `export-meta.json`, export fails unless you pass **`--force`** (overwrite). Auto-export (`lessons:export:auto`) checks the same and fails with "Lesson Lxx already exists. Use --force to overwrite."

### 4.2 Lesson-level (step-config.json)

| Field          | Description |
|----------------|-------------|
| `lessonId`     | From `--lessonId`. |
| `title`        | `"Ghost from hand <handId>"`. |
| `lessonType`   | `"FULL_HAND_GHOST"`. |
| `heroSeat`     | From `--heroSeat`. |
| `replayHandId` | **Set to `handId`.** Enables “Watch the full hand” in the completion UI. |
| `moduleCode`   | `"MODULE_GHOST"`. |
| `steps`        | One ACTION_STEP per hero decision. |

### 4.3 Step-level (per step in step-config)

| Field                  | Description |
|------------------------|-------------|
| `id`, `sequence`, `type` | Standard. |
| `snapshotPath`        | `./snapshots/step_NN.json`. |
| `street`               | **Auto:** street at this decision (e.g. PREFLOP, FLOP, TURN, RIVER). Enables UI progress. |
| `expectedAction`       | **Auto:** pro’s action from replay (FOLD, CHECK, CALL, BET, RAISE, ALL_IN). |
| `proActionSeat`        | Same as `heroSeat`. |
| `proActionAmountCents` | Amount in cents, or `null` for FOLD/CHECK. |
| `board`                | Community cards at this decision (omitted if empty). |
| `decisionIndex`        | Same as sequence (1, 2, …) for debugging, replay linking, analytics. |
| `heroPosition`         | **Auto:** BTN, SB, BB, CO, HJ, UTG, etc. from snapshot (lesson-level). |
| `evPro` / `evHero`     | Optional; set to `null` by default; future-proof for solver/EV reveal layers. |
| `gradingSpecJson`      | **Auto:** includes `expectedAction` (from replay), responses, runtime config. Authors only need to edit copy. |

### 4.4 Snapshot files

- **Naming:** `snapshots/step_01.json`, `step_02.json`, … (fixed names for easy editing).
- Each file is a full **TableSnapshotPayload** (table, hand, seats, hero, etc.).
- **Hero** is rewritten to lesson perspective: `userId: "user_1"`, `seat: heroSeat`, hole cards from hand history.
- **stateHash** is set to `sha1(JSON.stringify(snapshot))` at export time. Used by seed validation to detect duplicate or inconsistent snapshots.
- **Pro line validation:** Before writing, the exporter checks: (1) hero is to act (`hand.toActSeat === hero.seat` and that seat has `isToAct === true`); (2) each step’s `expectedAction` is present in `snapshot.hero.actionOptions`; (3) consecutive snapshots differ (no duplicate snapshot). If any check fails, export fails with a clear error.

---

## 5. Validation (seed)

When you run `pnpm lessons:seed:content`, ghost lessons are validated:

| Check | Description |
|-------|-------------|
| Hero to act | `snapshot.hand.toActSeat === snapshot.hero.seat`. |
| Hero seat consistency | All steps share the same hero seat (`lesson.heroSeat` or inferred). |
| expectedAction in options | The expected action is legal in `snapshot.hero.actionOptions`. |
| Consecutive snapshots differ | Fingerprint (street, potCents, board, actionCount, stateHash) differs between consecutive steps. |

If any check fails, the seed fails with a clear error (lesson id, step id).

---

## 6. Replay link (“Watch the full hand”)

- Exported step-config sets **replayHandId** = `handId`.
- Seed writes `Lesson.replayHandId` from `config.replayHandId`.
- **GET lesson** returns `replayHandId`; completion UI shows “Watch the full hand” and links to `/replay/<handId>`.

No extra implementation required beyond the exporter and seed.

---

## 7. Implementation details

- **Source:** `src/lessons/exportLessonFromReplay.ts` (load hand + frames, find hero decision points, rewrite snapshots).  
- **Script:** `scripts/export-lesson-from-replay.ts` (CLI, fingerprint, write files, build step-config).  
- **Seed:** `scripts/seed-lessons-content.ts` (reads `replayHandId`, validates ghost lessons, writes Lesson + LessonStep).

Hero decision points = replay frames where `hand.toActSeat === heroSeat` and street is not WAITING/SHOWDOWN. Pro line = ordered `HandAction` rows for that seat; normalized (e.g. AUTO_FOLD → FOLD).

---

## 8. Not in scope (Phase 1)

- Base snapshot + projection (engine apply-action).
- JSON patch / delta / custom state diff.
- Lesson preview dev route.
- Hand selector UI.
- Lesson templates or difficulty scoring.

These are documented in the pipeline and roadmap as future work.
