# Poker Bootcamp: 10 Ghost Lesson Ideas (Pipeline Pilots)

**Purpose:** First 10 full-hand lessons for the replay → lesson export pipeline.  
**Structure:** One hand = one lesson. 4–6 hero decisions, 2–3 streets, changing texture, different decision types per hand.  
**Date:** 2026-03-05

---

## Ideal ghost lesson structure

- **One hand** = one coherent narrative (not one concept).
- **4–6 hero decisions** per lesson.
- **2–3 streets** (e.g. preflop → flop → turn → river).
- **Different decision type at each step:** defend, continue, fold, bet, call, bluff catch, value bet, etc.
- **One pro line:** Ghost lessons follow a single path (the pro’s choices). The lesson tests: *would you have followed the pro line?* Avoid branchy phrasing (e.g. “call/4-bet”); describe the pro’s actual line (e.g. “call 3-bet → play postflop”).

Example flow: *Preflop defend → Flop call c-bet → Turn bet → River bluff catch.*

---

## Lesson IDs (L22–L31)

| Lesson ID | Narrative |
|-----------|-----------|
| L22 | BB call → flop call with draw → turn call → river bluff catch |
| L23 | Limp/call pre → flop call with top pair → turn bet → river value |
| L24 | 3-bet pre → flop c-bet → turn barrel → river bluff |
| L25 | Open pre → call 3-bet → flop c-bet → turn check-through → river value |
| L26 | Set mine pre → flop set, bet → turn bet → river value |
| L27 | BB call → flop call with middle pair → turn call → river bluff catch |
| L28 | Open pre → flop call with OESD → turn check (free card) → river value |
| L29 | Short stack: pre shove → postflop as played |
| L30 | Multiway call pre → flop call with draw → turn call → river call |
| L31 | Call 3-bet pre → flop overpair, bet → turn call → river stack-off |

---

## 10 hand narratives

Each line is the **pro’s path**; the lesson tests whether the user would have made the same choice at each decision.

1. **BB call → flop call with draw → turn call → river bluff catch**  
   BB calls open; flop face c-bet with a draw, pro calls; turn pro calls; river face bet, pro calls (bluff catch). Pick a hand where the pro took this line.

2. **Limp/call pre → flop call with top pair → turn bet → river value**  
   Hero calls pre; flop top pair, pro calls c-bet; turn pro bets; river pro value bets. One pro line end-to-end.

3. **3-bet pre → flop c-bet → turn barrel → river bluff**  
   Hero 3-bets; flop pro c-bets; turn pro barrels; river pro bluffs. One pro line end-to-end.

4. **Open pre → call 3-bet → flop c-bet → turn check-through → river value**  
   Open, face 3-bet, pro calls; flop pro c-bets; turn pro checks; river pro value bets. One pro line.

5. **Set mine pre → flop set, bet → turn bet → river value**  
   Call with small pair pre; flop set, pro bets; turn pro bets; river pro value bets. One sizing line.

6. **BB call → flop call with middle pair → turn call → river bluff catch**  
   BB calls; flop middle pair, pro calls c-bet; turn pro calls; river face bet, pro calls. Pick a hand where the pro called river.

7. **Open pre → flop call with OESD → turn check (free card) → river value**  
   Open, get called; flop draw, pro calls c-bet; turn pro checks; river pro value bets (hand hit). One line.

8. **Short stack: pre shove → postflop as played**  
   Short stack; pro shoves pre; each remaining street one pro decision as the hand runs out. One line.

9. **Multiway call pre → flop call with draw → turn call → river call**  
   Call in multiway pot; flop draw, pro calls; turn face bet, pro calls; river pro calls. One line.

10. **Call 3-bet pre → flop overpair, bet → turn call → river stack-off**  
    Pro calls 3-bet with big pair; flop overpair, pro bets; turn face aggression, pro calls; river pro stacks off. One line.

---

## Process: generating the 10 lessons

**Ideal pipeline:**

1. **`pnpm lessons:list-replay-hands --minDecisions=4`**  
   Lists hands with replay data. Use `--minDecisions=4` and `--maxDecisions=8` to only show hands where at least one seat has 4–8 decisions. Output includes:
   - **street coverage** per seat (e.g. `streets: ["PREFLOP","FLOP","TURN"]`) — prefer hands that reach TURN or RIVER.
   - **bestSeat** and **decisionCount** — recommended seat for export; then export is trivial: `--handId=<id> --heroSeat=<bestSeat>`.

2. **Choose hand + seat**  
   Pick a hand from the list (use `bestSeat` and `decisionCount`; prefer hands with street coverage to TURN or RIVER).

3. **`pnpm lessons:export:replay --handId=<id> --heroSeat=<seat> [--lessonId=L22] [--maxSteps=6]`**  
   Exporter writes `snapshots/step_01.json`, `step_02.json`, …; injects `gradingSpecJson.expectedAction` from the replay; adds street labels and metadata; validates that pro action exists in `hero.actionOptions` (fails fast if not).

4. **Edit step-config copy**  
   Improve `title`, `beforeInstructorMessage`, `followUpContent` in `step-config.json` (and `lesson.md`).

5. **`pnpm lessons:seed:content`**  
   Load lessons into DB and run ghost validation.

6. **Preview in app**  
   Run each lesson; confirm “Watch the full hand” works.

**Shortcut (batch):**  
`pnpm lessons:export:auto --count=10` scans replay hands (4–8 decisions), picks best seat per hand, and exports to L22–L31. Then you only edit titles/copy and seed.

**Prerequisites:** `FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE=true` when playing hands. See [LESSON_EXPORT_SYSTEM.md](LESSON_EXPORT_SYSTEM.md) for details.
