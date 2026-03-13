# Lesson Refactor Plan

This document captures a concrete refactor plan to **stabilize the lesson system** by tightening contracts, simplifying responsibilities, and pushing correctness into the seed pipeline (our single source of truth for lesson data).

The focus is on **seed-driven JSON content**: if data is wrong, the fix belongs in the seed/config, not in runtime backfills.

---

## Top must-dos (in order of impact)

### 1ï¸âƒ£ Canonicalize ACTION_STEP snapshots at seed/import

**Goal:** The seed pipeline guarantees that:

> **ACTION_STEP snapshot â†’ fully renderable action bar â†’ no client repair required.**

In other words: an ACTION_STEP snapshot stored in DB is **sufficient, by itself**, to render the correct action bar **without** client-side reconstruction of wagering legality.

**Required fields after normalization (per ACTION_STEP):**

- `hero.actionOptions` **exists**.
- `minRaiseTo` / `maxRaiseTo` are **present if wagering is allowed** (canBet/canRaise and primaryWagerAction set).
- `hand.toActSeat === hero.seat` (hero is the one to act when the step represents a hero decision).
- The **expectedAction** (from grading spec) is **representable** by the snapshot (e.g. expected BET implies `canBet` and wager bounds; expected ALL_IN implies `canAllIn`).

**Rule:** If normalization cannot produce this â†’ **seed fails**.

**Implementation sketch:**

- Add a pure `normalizeActionStepSnapshot(snapshot, expectedAction)` in the seed pipeline.
- Apply it for every ACTION_STEP when reading JSON and before writing `snapshotJson` to the DB.
- If any invariant cannot be satisfied, throw with a clear message that points at:
  - lessonId
  - stepId
  - which invariant failed

---

### 2ï¸âƒ£ Add strict seed-time invariants

**Goal:** Fail content early instead of debugging runtime bugs.

**Minimum checks (per ACTION_STEP, after normalization):**

- Step type is ACTION_STEP â†’ **hero is to act** (`hand.toActSeat === hero.seat`).
- `hero.actionOptions` **exists**.
- `canBet` / `canRaise` â‡’ **valid wager bounds**:
  - `minRaiseTo` and/or `maxRaiseTo` present as required.
  - `0 < minRaiseTo â‰¤ maxRaiseTo`.
- **Expected action is possible** from the snapshot:
  - Expected FOLD/CHECK/CALL â‡’ corresponding `can*` flag is true.
  - Expected BET/RAISE/ALL_IN â‡’ snapshot can build a valid wager context (see invariant below).

**Operational invariant:**  
If expected action is **BET/RAISE/ALL_IN**, the snapshot must produce a **non-null wager/action context** under the canonical client rules (i.e. after any agreed, minimal normalization, the table/action-bar can construct a valid wager context from the snapshot alone).

**Rule:** Seed/import should **stop with clear error messages** when any invariant fails.

---

### 3ï¸âƒ£ Standardize action answer payload

**Goal:** Prevent future drift between client and server answer contracts.

**Single canonical shape everywhere:**

```ts
type LessonActionPayload = {
  type: "fold" | "check" | "call" | "bet" | "raise" | "all_in";
  amountCents?: number;
};
```

- **Client:**
  - `toLessonActionPayload` is the **only creator** of `LessonActionPayload`.
  - All ACTION_STEP answers go through this function.
- **Server:**
  - `normalizeLessonAction` still accepts legacy `amount` but logs it as deprecated.
  - All new code should read `amountCents` and treat it as canonical.

This closes the door on future type/field-name drift.

---

### 4ï¸âƒ£ Remove snapshot repair from the client (after seed is fixed)

Right now the client **repairs** content:

- `mergeCallWithStack`
- `fillWagerBoundsFromSnapshot`

**Short term:**

- Keep both functions but add logging/diagnostics when they **actually change** snapshot-derived data. Any hit in prod indicates broken seed/content.

**Goal (after seed is trustworthy):**

> `snapshot â†’ getActionContext`

- No major reconstruction of wagering legality on the client.
- At most, trivial presentation-only tweaks.

Once we see no repair hits for a stable period, we can:

- Remove `fillWagerBoundsFromSnapshot` entirely.
- Consider trimming `mergeCallWithStack` or limiting its scope to clearly documented edge cases.

---

### 5ï¸âƒ£ Add seed validation tests

**Goal:** Protect the pipeline permanently.

Add tests around the seed/import scripts that **fail when content produces invalid snapshots**.

**Example cases to cover:**

- Missing wager bounds:
  - ACTION_STEP with expected BET/RAISE/ALL_IN but no usable `minRaiseTo` / `maxRaiseTo`.
- Hero not to act:
  - ACTION_STEP where `hand.toActSeat !== hero.seat`.
- Expected action impossible:
  - Expected RAISE but all `canBet/canRaise/canAllIn` are false.
- Invalid raise math:
  - `minRaiseTo <= 0`, or `minRaiseTo > maxRaiseTo`.

These tests should run in CI and fail fast on bad content or projection changes.

---

### 6ï¸âƒ£ Add E2E tests for representative lessons

**Goal:** Verify the full stack (content â†’ seed â†’ API â†’ client â†’ grading) for key lesson shapes.

At minimum, add E2E coverage for:

- **INFO lesson** (no ACTION_STEP).
- **MCQ lesson** (e.g. L16-style).
- **ACTION_STEP lesson** (e.g. L54 or another ghost lesson).
- **Resume mid-lesson** (Continue Training / step 2+).

**Assertions per scenario:**

- Correct buttons appear (MCQ options, table action bar where appropriate).
- Buttons are clickable (no pointer/visibility regressions).
- Feedback appears after submit (correct/incorrect + follow-up).
- Step advances (or completion is shown when appropriate).

---

### 7ï¸âƒ£ Introduce explicit lesson table mode

**Goal:** Stop overloading replay mode for lessons.

Introduce a distinct lesson table mode, e.g.:

```tsx
tableMode=\"lesson\"
```

**Behavior becomes predictable:**

- **ACTION_STEP** (lesson) â†’ action bar active (or disabled with a clear message).
- **INFO/MCQ** (lesson) â†’ message area only (no live action bar), but bottom section is still visible.

This makes rendering rules easier to reason about and avoids the previous L16-style bug where `tableMode=\"replay\"` hid the entire bottom section.

---

### 8ï¸âƒ£ Unify ACTION_STEP submission path

**Goal:** Avoid multiple mental models (classic vs V2) in the UI for ACTION_STEP.

All ACTION_STEP flows should look like:

1. **Normalize payload** (into `{ type, amountCents? }`).
2. Call `submitStep()` once.
3. **Receive result** (feedback, updated attempt).
4. Optionally run extra **runtime hooks** (e.g. V2 decision node logic) *after* the canonical submit.

The UI should not have two fundamentally different submission paths; V2 behavior should be layered on top of the same base submit contract.

---

## Snapshot versioning (recommended)

**Yes â€” add snapshot versioning in this change.** It makes the canonical contract explicit and gives a safe migration path without backfills.

**What to add:**

- A **version field** on the snapshot payload (e.g. `lessonSnapshotVersion: 2` at top level or on a small metadata object). Semantics: `1` = legacy / may need client repair; `2` = canonical, no repair required.
- **Seed/import:** When writing normalized ACTION_STEP snapshots, set the version to the current canonical version (e.g. `2`). Leave existing content at `1` (or omit) until it is re-seeded.
- **Client:** Before applying repair:
  - If `lessonSnapshotVersion >= 2` (or equivalent), **skip** `fillWagerBoundsFromSnapshot` (and eventually `mergeCallWithStack` for v2). Treat snapshot as already renderable.
  - If version is missing or `< 2`, keep current repair behavior and log when repair runs (so we see any stragglers).

**Why include it now:**

- The refactor already defines a "canonical" contract; a version makes that contract **detectable** at runtime.
- You can remove client repair for new content immediately (v2) without waiting for every lesson to be re-seeded.
- Prevents accidentally treating old, un-normalized snapshots as canonical (e.g. after partial seed or a bug).
- Low cost: one field at normalization time and a simple check in the client scene model.

**Concrete steps:**

1. Define the version constant (e.g. `CANONICAL_LESSON_SNAPSHOT_VERSION = 2`) in a shared place or doc.
2. In `normalizeActionStepSnapshot`, set the version on the output snapshot.
3. In `buildTableSceneModel` (or the lesson-specific path), if the snapshot has version ≥ canonical, skip wager-bound repair; otherwise keep current behavior and log when repair is used.