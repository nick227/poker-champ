# AI → Lesson Pipeline: Minimal Hand Spec

**Purpose:** Let AI generate only a small semantic hand description; a lesson-builder script turns it into snapshots, step-config, and lesson files. Same seed and runtime as today.  
**Status:** Design. Lesson-builder and engine projection not yet implemented.  
**Date:** 2026-03-05  
**Related:** [LESSONS_PIPELINE.md](LESSONS_PIPELINE.md), [LESSON_EXPORT_SYSTEM.md](LESSON_EXPORT_SYSTEM.md)

---

## 1. Architecture

```
AI generator
     │
     ▼
minimal hand spec (JSON)
     │
     ▼
lesson-builder script
     │
     ├─ build snapshots (engine projection or apply-action)
     ├─ build step-config (ACTION_STEP per hero decision, expectedAction from spec)
     └─ optional: merge AI-generated lesson copy (title, responseCorrect, followUpContent)
     │
     ▼
content/lessons/content/Lxx/
     │
     ▼
pnpm lessons:seed:content
     │
     ▼
lesson runtime (unchanged)
```

**Advantage:** AI does not need to understand the engine or snapshot format. It outputs positions, board, stack sizes, and an action sequence. The pipeline produces the same artifact shape as the replay exporter (snapshots + step-config), so seed and runtime are unchanged.

**Three layers of meaning:**

```
strategic intent (optional constraints)
      ↓
minimal hand spec
      ↓
engine projection
      ↓
lesson artifacts
```

Constraints let the generator state the teaching goal; the pipeline validates the hand satisfies it (e.g. “hand reaches TURN”, “villain barrels”). Without them, AI often produces technically valid but strategically meaningless hands (hero never faces a decision, hand ends preflop, villain checks everything).

---

## 2. Minimal Hand Spec Format

AI produces a single JSON object describing the hand and the pro line.

**Example:**

```json
{
  "specVersion": 1,
  "lessonTitle": "BTN Float vs Turn Barrel",
  "players": 3,
  "playersInfo": [
    { "seat": 1, "position": "SB", "name": "Marco" },
    { "seat": 2, "position": "BB", "name": "Lena" },
    { "seat": 3, "position": "BTN", "name": "Hero" }
  ],
  "heroSeat": 3,
  "blinds": { "sb": 0.5, "bb": 1 },
  "startingStacksBB": 100,
  "heroHoleCards": ["Ah", "Jh"],
  "board": ["Ts", "7d", "2c", "9h", "3s"],
  "actions": [
    { "street": "PREFLOP", "actorSeat": 3, "action": "RAISE", "sizeBB": 2.5 },
    { "street": "PREFLOP", "actorSeat": 2, "action": "CALL" },
    { "street": "FLOP", "actorSeat": 2, "action": "BET", "sizePot": 0.33 },
    { "street": "FLOP", "actorSeat": 3, "action": "CALL" },
    { "street": "TURN", "actorSeat": 2, "action": "BET", "sizePot": 0.75 },
    { "street": "TURN", "actorSeat": 3, "action": "CALL" }
  ],
  "tags": ["float", "turn-barrel", "btn-vs-bb"],
  "constraints": {
    "minStreetReached": "TURN",
    "minHeroDecisions": 2,
    "villainBarrels": 2
  }
}
```

**Fields:**

| Field | Description |
|-------|-------------|
| `specVersion` | **Required.** Integer (e.g. `1`). Enables future format changes; builder rejects incompatible versions to prevent silent pipeline breakage. |
| `lessonTitle` | Short title for the lesson. |
| `description` | Optional. Narrative or intro text for the lesson. |
| `players` | Number of players (2–9). Schema enforces min 2, max 9. |
| `playersInfo` | **Required.** One entry per seat: `seat` (1–9), `position`, optional `name`. Schema enforces `uniqueItems`. Defines full seating order. |
| `heroSeat` | Seat index of hero (1–9). **Must appear exactly once** in `playersInfo`. |
| `blinds` | **Required.** `{ "sb": number, "bb": number }` in BB. Must satisfy `bb > 0`, `sb > 0`, `sb < bb`. |
| `startingStacksBB` | Default stack in BB for every seat when `stacksBB` omitted. |
| `stacksBB` | Optional. Per-position/seat overrides. Fallback: `startingStacksBB` for all. |
| `heroHoleCards` | Exactly two unique cards, e.g. `["Ah", "Jh"]`. Schema: minItems 2, maxItems 2, uniqueItems true. Must not appear on `board` (heroHoleCards ∩ board = ∅). |
| `board` | **Full runout only.** Max 5 unique cards (schema maxItems 5, uniqueItems true). Pipeline reveals cards when the street occurs. Length must satisfy street (see table below). |
| `actions` | Ordered list (schema: minItems 1, maxItems 40): `street` (PREFLOP, FLOP, TURN, RIVER only), `actorSeat` (1–9); for BET/RAISE **only one** of `sizeBB` or `sizePot` (not both). `sizeBB` = bet size **in big blinds** (e.g. 2.5). `sizePot` = **fraction of current pot** (e.g. 0.75 = 75%); converted **during** projection (see below). Optional `isHeroDecision`. Actions sorted by street; within street, **must match engine-computed turn order** (seat order 1→2→3 is irrelevant; engine defines who acts when). |
| `seed` | Optional. Integer RNG seed for repeatability. |
| `tags` | Optional. Array of strings (schema: maxItems 10, each maxLength 32) for lesson organization. Not used by pipeline logic. |
| `constraints` | Optional. Validation hints for teaching intent. Builder builds snapshots, then runs constraint checks; if any fail, reject spec. Not required to reconstruct the hand. See **Constraints** below. |

**Hero decisions:** A step is a hero decision if `actorSeat === heroSeat`. Optional `isHeroDecision: true` **overrides** (e.g. to mark a step when seat is omitted or ambiguous). Precedence: if `isHeroDecision === true` on an action, treat it as a hero decision; otherwise use `actorSeat === heroSeat`. The `action` at that step is `expectedAction`.

**Player names:** Optional and cosmetic. Engine uses only `seat` and `position`. If AI omits `name`, builder can default to "Hero" for heroSeat and "Player 1", "Player 2", … for others. Names can be used in step-config (e.g. `villainName`, `heroName`) for lesson copy and in table UI.

**Board length vs street:** Pipeline must confirm `board.length >=` the required length for the highest street reached:

| Street | Required board length |
|--------|------------------------|
| PREFLOP | 0 |
| FLOP | 3 |
| TURN | 4 |
| RIVER | 5 |

**Board reveal:** Board cards beyond the **final street** of the hand must not appear in any snapshot. Example: if the hand ends on the flop, turn and river cards must not be revealed. The engine projection should enforce this automatically (only reveal board up to current street); the spec may still list the full runout for convenience.

**sizePot conversion:** `sizePot` depends on the current pot (previous bets, calls, blinds, raises). The builder **cannot** compute it before projection. **Convert sizePot during projection, not before:** when applying an action that has `sizePot`, use `sizeCents = sizePot * engine.currentPot()` (or equivalent) at the moment of that action. The engine is the source of pot state.

**Dealer:** The dealer (button) is the seat with position BTN. The engine must know the dealer for turn order; infer **BTN = dealer** from `playersInfo` (no separate `dealerSeat` unless the schema is extended). Document in builder: map BTN in playersInfo to engine’s dealer/button.

**Schema:** `content/lessons/content/minimal-hand-spec.schema.json` — validates types, enums, card pattern, required fields (including `specVersion`), and structural rules. Pipeline still must enforce poker-rule validity (stacks, bet sizes, **engine turn order** for actions within a street, no hole cards on board, action ordering, at least one hero decision).

**Important engine constraint:** The pipeline must define unambiguously: **each snapshot is captured before the hero action**. Example: snapshot_01 = state before hero acts on flop; snapshot_02 = state before hero acts on turn. Consistent everywhere (replay export and AI-spec builder).

**Constraints (optional):** AI often generates hands that are technically valid but strategically meaningless (hero never faces a decision, hand ends preflop, action sequence inconsistent with lesson idea, villain checks everything). An optional `constraints` block lets the generator specify the teaching goal; the pipeline validates the hand satisfies it.

- **Design rule:** Constraints are optional and **non-engine-critical**. They are validation hints, not required to reconstruct the hand.
- **Pipeline behavior:** Build snapshots normally, then run constraint checks (e.g. if `minStreetReached === "TURN"` then require hand’s max street ≥ TURN). If any constraint fails → reject spec with a clear error.
- **Example constraint types:** `minStreetReached` (FLOP | TURN | RIVER), `minHeroDecisions` (number), `villainBarrels` (number: villain bets on at least N streets). Extend as needed; builder ignores unknown keys.

Example: “Turn check-raise bluff” → constraints `{ "minStreetReached": "TURN", "minHeroDecisions": 1 }`; builder rejects if the hand never reaches turn or has no hero decision. “Facing triple barrel” → `{ "villainBarrels": 3 }`; reject if villain doesn’t bet on three streets.

---

## 3. Pipeline Steps (Lesson-Builder)

1. **Parse and validate spec**  
   Check: `specVersion` supported by builder (reject if incompatible). `playersInfo.length === players`; **heroSeat appears exactly once in playersInfo**; unique seat numbers; unique positions; `bb > 0`, `sb > 0`, `sb < bb`; **heroHoleCards ∩ board = ∅**; `board.length >=` max street reached (see table above); **actions sorted by street** (PREFLOP → FLOP → TURN → RIVER), and within each street actions **must match engine-computed turn order** (not raw seat order); **only one of sizeBB or sizePot** per action; **at least one hero decision** (by actorSeat === heroSeat or isHeroDecision). Optional: `name` length ≤ 32. Hero actions legal at that point (validated after building state).

2. **Build snapshots**  
   Option A (future): **Engine projection** — construct initial table state from spec (blinds, playersInfo, stacks, board), then apply each action via the real engine; capture snapshot **before** each hero action (snapshot_01 = state before hero’s first action, etc.). This rule must be consistent everywhere.  
   Option B: Reuse the same “ephemeral table → apply action → read snapshot” as in LESSONS_PIPELINE §5.  
   Output: `step_01.json`, `step_02.json`, … (one per hero decision).

3. **Run constraint checks (if `constraints` present)**  
   Using the built snapshots and action sequence, evaluate each specified constraint (e.g. max street reached ≥ minStreetReached, hero decision count ≥ minHeroDecisions, villain bet count across streets ≥ villainBarrels). If any check fails → reject spec; do not write lesson files.

4. **Build step-config**  
   For each hero decision: ACTION_STEP, `expectedAction` = that action from the spec, `snapshotPath` = step_NN.json, `street` / `board` / `proActionAmountCents` from the snapshot. Same shape as replay exporter output.

5. **Lesson copy (optional)**  
   AI can provide per hero-decision: `beforeInstructorMessage`, `followUpContent` (and optionally `title`, `responseCorrect`, `responseIncorrect`). Pipeline merges into step-config. If omitted, builder uses placeholders. **Content must follow the content standards below (§12)** when copy is supplied or when doing a content pass.

6. **Write lesson dir**  
   Same layout as replay export: `step-config.json`, `snapshots/`, `lesson.md`, `export-meta.json`. Builder must emit **export-meta.json** with pipeline metadata for debugging and **reproducibility**: `source`, `generatedAt`, `specVersion`, `engineVersion`, `pipelineVersion`, `specHash` (e.g. hash of input spec). Example: `{ "source": "ai-spec", "generatedAt": "2026-03-05", "specVersion": 1, "engineVersion": "...", "pipelineVersion": "...", "specHash": "..." }`.

7. **Seed as normal**  
   `pnpm lessons:seed:content` — no change.

---

## 4. Validation (Reject Invalid Generation)

The lesson-builder **must** validate and reject the spec if any of these fail:

| Check | Description |
|-------|-------------|
| **Hero can perform expectedAction** | At each hero decision, the built snapshot must have `hero.actionOptions` allowing that action (e.g. CHECK → canCheck). Same as replay exporter pro-line validation. |
| **Stack sizes valid** | No negative stacks; bets/raises ≤ stack; starting stacks consistent. |
| **Bet sizes valid** | Min-raise rules, all-in handling. Engine rules apply when projecting. |
| **Street progression valid** | PREFLOP → FLOP → TURN → RIVER; board length matches (flop 3, turn +1, river +1). |
| **Actor order valid** | Actions per street follow a legal actor order (e.g. first to act postflop, then clockwise). |
| **Spec structure** | `specVersion` supported; `playersInfo.length === players`; **heroSeat appears exactly once in playersInfo**; unique seats; unique positions; optional `name` length ≤ 32. |
| **Blinds** | `bb > 0`, `sb > 0`, `sb < bb`. |
| **No hole cards on board** | `heroHoleCards ∩ board = ∅`. |
| **Action ordering** | Actions sorted by street (PREFLOP, FLOP, TURN, RIVER); within street, **must match engine-computed turn order** (seat order is irrelevant; engine defines who acts when). Reject if violated. |
| **Board length vs street** | `board.length >=` required length for highest street reached (PREFLOP 0, FLOP 3, TURN 4, RIVER 5). **Board beyond final street** must not appear in snapshots (e.g. hand ends on flop → turn/river not revealed). |
| **Bet size** | Only one of `sizeBB` or `sizePot` per action (not both). |
| **At least one hero decision** | `actions.filter(a => a.actorSeat === heroSeat).length >= 1` (ghost lessons require steps). |
| **Constraints (if present)** | All specified constraints must pass (e.g. minStreetReached, minHeroDecisions, villainBarrels). Evaluated after snapshots are built. |

The builder performs **poker-rule validation** (stack sizes, bet sizes, actor order, legal actions) **using engine projection**; the engine is the authority. If invalid → **reject generation** (clear error); do not write lesson files.

---

## 5. Why This Fits the Existing Architecture

- **Runtime unchanged:** Lesson API still returns full `snapshotJson` and `gradingSpecJson.expectedAction` per step. The client does not care whether the lesson came from replay export or AI spec.
- **Single pipeline output:** Both “replay exporter” and “lesson-builder (from spec)” produce the same directory shape. Seed and validation are shared.
- **AI stays high-level:** AI does not need to know TableSnapshotPayload, engine types, or persistence. It only needs to output: seating (playersInfo, heroSeat), blinds, hole cards, board, stacks, and a legal action sequence. The pipeline converts that into engine state and snapshots.

**Three generation sources:** The pipeline can eventually support **replay export**, **AI spec**, and **solver spec** — all producing the same output (`step-config.json`, `snapshots/`, `lesson.md`), so the lesson engine stays content-source agnostic.

---

## 6. Example Specs AI Could Produce

- "BTN vs BB cbet defense" — hero BTN, faces flop c-bet, calls or raises.
- "Check-raise bluff turn" — hero check-raises turn as a bluff.
- "River thin value bet" — hero value bets river.
- "Facing triple barrel" — hero faces bet on flop, turn, river.
- "Short stack push/fold" — preflop all-in or fold.

Each spec is a few dozen lines of JSON; the pipeline turns it into a full ghost lesson (snapshots + steps + optional copy).

---

## 7. Implementation Order

1. **Engine projection** (LESSONS_PIPELINE §5): ephemeral table, apply action, read snapshot. Required for building snapshots from a spec.
2. **Spec schema:** JSON schema at `content/lessons/content/minimal-hand-spec.schema.json` — AI or tooling can validate the spec before calling the builder.
3. **Lesson-builder script:** Input: path to spec JSON (and optional copy JSON). Output: lesson dir. Uses engine projection to build snapshots, then writes step-config and files like the replay exporter.
4. **Validation:** Reuse same checks as replay exporter (hero to act, expectedAction in options, consecutive snapshots differ) plus spec-level checks (stacks, bet sizes, street progression). If spec includes `constraints`, run constraint checks after building snapshots.

---

## 8. Concept Templates (Future)

**Idea:** Generate a valid hand from a **teaching concept** instead of a full hand spec. Input: a concept template (e.g. `"BTN float vs turn barrel"`, `targetStreet: "TURN"`, `heroDecisions: 2`). A **hand generator** uses the poker engine to construct a legal hand that fits (random board, actions consistent with the concept), then the same pipeline (engine projection → snapshots → step-config) produces lesson artifacts. No replay data or hand history required; the engine remains the source of truth.

**Worth the effort?** Yes, if you want to scale lesson creation beyond replay export and AI-written specs. Concept templates give you one concept → many valid hands (e.g. “facing triple barrel” can yield many different boards and lines). The main cost is implementing the generator (sample boards, sample action sequences, constraint checks, retry until valid). Doing it after the minimal-spec pipeline and engine projection is in place keeps the architecture clean: the generator outputs a minimal spec (or an internal equivalent), and the existing builder does the rest.

**Weighted action policy:** When the hand generator chooses actions (e.g. villain or hero lines to fill in), use a **simple probability model** over legal actions instead of uniform random or fixed choices. For example: at each decision point, assign weights to each legal action (e.g. call 0.5, raise 0.35, fold 0.15) and sample from that distribution. Weights can depend on context (street, pot size, position) or on a template hint (e.g. “aggressive villain” → higher weight on bet/raise). This makes generated hands look realistic and varied without requiring a solver; the engine still enforces legality, and constraints still filter for teaching intent.

---

## 9. Implementation Task List

| # | Task | Deps | Notes |
|---|------|------|--------|
| 1 | **Engine projection** — Ephemeral table from spec (blinds, playersInfo, stacks BB→cents, board), apply action one-by-one via real engine, read snapshot after each action. | — | Core gap. See LESSONS_PIPELINE §5. Must support sizePot→BB conversion when applying BET/RAISE. |
| 2 | **Spec → initial table state** — Map spec (playersInfo, heroSeat, blinds, startingStacksBB, stacksBB, heroHoleCards, board) into engine’s table/hand representation (seats, dealer, SB/BB, stacks in cents, hole cards, board per street). | 1 | Include mapping seat 1–9 and positions to engine’s seat indices if different. |
| 3 | **Apply action from spec** — For each action in spec: when action has **sizePot**, convert **during** projection with `sizeCents = sizePot * engine.currentPot()` (not before; pot is dynamic). Map action to engine call; apply; capture snapshot if next actor is hero. | 1 | Snapshot = state *before* hero acts. |
| 4 | **Spec parse + structural validation** — Load JSON, validate with minimal-hand-spec.schema.json; enforce doc rules (heroSeat exactly once in playersInfo, unique seats/positions, heroHoleCards ∩ board = ∅, action order by street **and engine turn order within street**, only one of sizeBB/sizePot, board length vs max street, ≥1 hero decision). Reject with clear error. | — | Can do before engine projection. Action-order check may require engine to provide turn order per street. |
| 5 | **Constraint evaluation** — After snapshots built: compute max street reached, hero decision count, villain barrels; if constraints present, evaluate minStreetReached, minHeroDecisions, villainBarrels; reject if any fail. | 1, 3 | Ignore unknown constraint keys. |
| 6 | **Step-config from snapshots** — For each hero decision: ACTION_STEP, snapshotPath = step_NN.json, gradingSpec.expectedAction from spec, street/board/proActionAmountCents from snapshot. Match replay exporter step-config shape. | 3 | Same as replay export output. |
| 7 | **export-meta.json** — Emit source, generatedAt, specVersion, engineVersion, pipelineVersion, specHash. | — | Determinism and debugging. |
| 8 | **Lesson-builder CLI** — Script: input = path to spec JSON, output = lesson dir (e.g. content/lessons/content/Lxx); options: --lessonId, --outDir, --force. Write snapshots/, step-config.json, lesson.md (placeholder if no copy), export-meta.json. | 1–7 | Guard: fail if lesson dir exists and not --force. |
| 9 | **Package script** — e.g. `pnpm lessons:build:from-spec --spec=path/to/spec.json --lessonId=L42`. | 8 | |
| 10 | **(Future) Concept-template hand generator** — Input: concept template (concept, players, positions, stackDepthBB, targetStreet, heroDecisions). Output: minimal spec. Use engine to generate legal hand (board, action sequence) satisfying template; weighted action policy for choices; constraint check; retry until valid. | 1–8 | See §8. |

---

## 10. Key Gaps

| Gap | Impact | Mitigation |
|-----|--------|------------|
| **No engine projection** | Cannot build snapshots from a spec. All “from spec” flows are blocked. | Implement ephemeral table + apply-action + read-snapshot (LESSONS_PIPELINE §5). Replay exporter uses stored frames; need equivalent “from abstract state” path. |
| **Spec units vs engine units** | Spec uses BB, positions, seat 1–9; engine may use cents, internal seat ids. | Builder must map blinds/stacks/sizes to engine’s units; map playersInfo.seat and actorSeat to engine seats; **sizePot** must be converted **during** projection (`sizeCents = sizePot * engine.currentPot()` at that action), not before. |
| **No lesson-builder script** | Specs cannot be turned into lesson dirs. | Implement after engine projection; reuse step-config and export-meta shape from replay exporter. |
| **No concept-template generator** | Cannot generate lessons from “turn barrel” style concepts without a full hand spec. | Future phase: hand generator that produces a minimal spec (or equivalent) then calls existing builder. |
| **Engine API for “apply action”** | Projection requires: create table state, apply one action, read snapshot. Engine may only support full hand execution. | Expose or add an API that applies a single action from current state and returns snapshot (or equivalent). |

---

## 11. Summary

- **AI outputs:** Minimal hand spec (`specVersion`, title, playersInfo, heroSeat, blinds, hole cards, board, stacks, action sequence with actorSeat; optional sizePot, isHeroDecision, seed, names, tags, **constraints**). Builder rejects unsupported specVersion, validates ordering/board/hero decisions, runs constraint checks if present, and export-meta includes engineVersion, pipelineVersion, specHash for determinism.
- **Pipeline outputs:** Same as replay exporter — snapshots, step-config, export-meta, lesson.md — so seed and runtime are unchanged.
- **Constraint:** Pipeline validates and rejects invalid specs (illegal actions, bad stacks, bad streets). Engine remains the authority for poker state.

- **Implementation:** See §9 task list (engine projection first, then spec→state, apply action, constraints, step-config, CLI). Key gaps (§10): no engine projection yet, spec/engine unit mapping, no builder script, no concept generator; engine may need a single-action apply API.

---

## 12. Content standards for lesson copy

When generating or editing lesson copy (spec `beforeInstructorMessage` / `followUpContent`, or a manual content pass), apply these standards so lessons are readable, varied, and pedagogically clear.

### 12.1 No placeholders in shipped content

- **followUpContent:** Never ship the literal placeholder `"(Add teaching note.)"`. Every ACTION_STEP must have real teaching copy that explains why the pro’s action is correct.
- **beforeInstructorMessage:** Prefer scene-setting over generic "Decision N. What would the pro do?" (e.g. "Villain bets the flop. What would the pro do?", "Short stack; it's on you. What would the pro do?").

### 12.2 Readability

- Use clear, concise, poker-appropriate language. One to three sentences per followUpContent.
- Prefer active voice and concrete reasons (e.g. "Call. You've got a price and a hand that can improve or already be best.").
- Avoid jargon unless it’s standard (e.g. "float", "c-bet", "value", "barrel" are fine).

### 12.3 Variety and diverse language

- Vary phrasing across lessons and across steps. Avoid repeating the same template (e.g. not every preflop open should say "Raising from the button is standard").
- **Examples of variety:**
  - Preflop open: "Open from the button.", "Button open—you're last to act preflop.", "A button open takes the lead and gets folds or builds a pot.", "Open. You've got a hand and position—raise."
  - Value bet: "Bet. You're ahead—get value.", "A flop bet gets value from worse and makes draws pay.", "Bet again. Two streets of value when you're ahead."
  - Call: "Call.", "Call the first barrel.", "Call—that's the float.", "No need to raise or fold yet."
  - Fold: "Fold.", "The pro lets it go and waits for a better spot.", "Save the chips.", "Don't pay off."
- Vary **beforeInstructorMessage**: mix scene-based prompts ("Villain check-raises the flop."), short prompts ("Flop; you're ahead."), and thematic prompts ("They c-bet the flop. You're floating.").

### 12.4 Key ideas and teaching points

- Each **followUpContent** should express at least one of:
  - **Why the action is correct:** e.g. "You're ahead of most of their range.", "The price is right.", "You've got position."
  - **What would be wrong:** e.g. "Folding would be too tight.", "Calling would be burning money.", "Limping gives the blind a free look."
  - **A tactical or conceptual point:** e.g. "Thin value means betting when you're ahead often enough.", "You don't have to bet every street to win.", "Short stacks should get it in pre when they have a hand."
- Where the lesson has a theme (e.g. float, check-raise, triple barrel), use **beforeInstructorMessage** or followUpContent to reinforce it so the learner knows what concept is being taught.

### 12.5 Pipeline and tooling

- **Spec-driven copy:** The minimal spec supports optional `beforeInstructorMessage` and `followUpContent` on each hero-decision action. When present, the builder uses them; when absent, it emits the placeholder. A content pass (manual or automated) should replace any remaining placeholders before treat-as-done.
- **Validation:** Optional: add a check (e.g. in `pnpm lessons:validate`) that no step has `followUpContent === "(Add teaching note.)"` for lessons considered production-ready, or flag them for content pass.
