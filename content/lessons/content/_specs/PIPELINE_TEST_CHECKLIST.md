# Spec pipeline – manual test checklist

After running `pnpm lessons:build:all-specs` and `pnpm lessons:seed:content`, verify the following. If all pass, the pipeline is production-ready.

## Build and seed

```bash
pnpm lessons:build:all-specs --force
# includes seed by default; use --no-seed to skip
```

## 1. Hero actions grade correctly

- [ ] **L43** (Flop fold): Choose FOLD on flop → correct; any other → incorrect.
- [ ] **L44** (All-in preflop): Pro line is ALL_IN → correct.
- [ ] **L45** (River value): Pro bets river → correct.
- [ ] **L46** (Triple barrel): Pro calls river → correct.
- [ ] **L52** (Preflop fold): Pro folds to 3-bet → correct.
- [ ] **L55** (Flop raise): Pro raises flop → correct.
- [ ] **L58** (Single step): Pro calls flop → correct.

## 2. Snapshot state matches board/stacks

- [ ] **L43**: Flop board Kh Qd Jc only (no turn/river).
- [ ] **L45**: River board has 5 cards; pot/stacks consistent.
- [ ] **L46**: Each step shows correct board length (flop 3, turn 4, river 5).
- [ ] **L60** (Asymmetric stacks): BB has ~25bb stack, BTN 100bb in snapshots.

## 3. Action options correct (call/check/raise)

- [ ] **L43** step 1: Hero can FOLD (canFold true); grading accepts only FOLD.
- [ ] **L45** river step: Hero can BET (canBet true).
- [ ] **L53** flop step: Hero can CHECK (canCheck true).
- [ ] **L55** flop step: Hero can RAISE (canRaise true).
- [ ] **L50** river step: Hero can CALL (canCall true).

## 4. Villain names display correctly

- [ ] **L49** (3-way): Names Marco, Lena, Hero in UI (from playersInfo).
- [ ] **L43**: Villain shows as "Alex".
- [ ] **L46**: Villain shows as "Bluffer".
- [ ] **L47**: Villain shows as "Stealer" (hero in BB).

## 5. Lesson progression across steps

- [ ] **L46** (3 steps): Step 1 → Step 2 → Step 3 in order; can't skip.
- [ ] **L59** (4 steps): All four steps advance correctly; completion works.
- [ ] **L58** (1 step): Single step completes and lesson ends.

## 6. Edge cases

- [ ] **L43** – Flop fold: Hand ends on flop; no turn/river in snapshot.
- [ ] **L44** – All-in preflop: One decision; stacks go all-in.
- [ ] **L45** – River decision: Hero value bets river; last action.
- [ ] **L46** – Multi-street barrel: Villain bets flop, turn, river; hero calls each.
- [ ] **L51** – Turn fold: Hero folds to second barrel.
- [ ] **L57** – River fold: Hero folds on river to value bet.
- [ ] **L54** – Turn all-in: Hero jams turn; villain folds.

## 7. Seeding + reload behavior

- [ ] After `pnpm lessons:seed:content`, lessons L43–L60 appear in app (or curriculum).
- [ ] Reload page: lesson list and progress persist.
- [ ] Open a lesson, complete a step, reload: progress preserved (if your app stores it).
- [ ] Lesson content (steps, snapshots) loads without errors.

## Spec inventory (L43–L60)

| LessonId | Scenario              | Key check                    |
|----------|------------------------|------------------------------|
| L43      | Flop fold              | Fold grades correctly        |
| L44      | All-in preflop         | Single ALL_IN step           |
| L45      | River value bet        | Hero bets river; 5-card board|
| L46      | Triple barrel          | 3 hero calls; villain barrels|
| L47      | Hero BB check-call     | Hero in BB; names            |
| L48      | Flop check-raise       | Hero faces XR, folds         |
| L49      | 3-way (Marco, Lena)    | Three names display          |
| L50      | River call             | Hero calls river             |
| L51      | Turn fold              | Fold to second barrel        |
| L52      | Preflop fold           | Fold to 3-bet                |
| L53      | Flop check back        | Check option; multi-street   |
| L54      | Turn all-in            | ALL_IN for value             |
| L55      | Flop raise             | Raise option; value          |
| L56      | Double barrel          | Call flop, fold turn         |
| L57      | River fold             | Fold on river                |
| L58      | Single decision        | One step only                |
| L59      | Four hero decisions    | Preflop → river progression  |
| L60      | Asymmetric stacks      | BB 25bb, BTN 100bb           |

## Run build

From repo root:

```bash
pnpm lessons:build:all-specs --force
```

This builds all `L##-*.json` specs in `content/lessons/content/_specs/` into `content/lessons/content/L##/` and runs `pnpm lessons:seed:content`.
