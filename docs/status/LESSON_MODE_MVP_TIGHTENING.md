# Lesson Mode MVP Tightenings

## Executive Summary

Final architectural refinements that freeze the provider contract, separate concerns cleanly, and establish guardrails for maintaining the dumb TableLayout principle.

---

## 1️⃣ Provider Contract (Freeze This)

**Shared type for strict conformance:**

```typescript
export type TableProvider = {
  snapshot: TableSnapshotPayload;
  onAction: (payload: TableActionPayload) => void;
};
```

Both GAME and LESSON providers must expose this exact shape.

**Providers may expose additional fields (e.g. evaluation), but TableLayout only consumes the frozen contract.**

---

## 2️⃣ Lesson Metadata Lives Under `snapshot.lesson`

**Lesson snapshots are simply normal `TableSnapshotPayload` objects with optional lesson metadata attached:**

```typescript
snapshot.lesson?: {
  lessonId: string;
  stepId: string;
};
```

**Rule:**
- **Snapshot = state** (pure, serializable)
- **Evaluation = result** (derived, separate)

Never store explanations, correctness, or feedback inside snapshot.

---

## 3️⃣ Lesson Evaluation Is Write-Only

**Evaluator is a pure function:**

```typescript
const result = evaluateLessonAnswer(...);
setEvaluation(result);
```

- Evaluator never touches React state
- Evaluator never mutates snapshot
- Fully testable in isolation
- Provider decides what to do with the result

---

## 4️⃣ Locking Actions = One Line

```typescript
hero.actionOptions = []
```

**No flags.**
**No booleans.**
**No lesson conditions in ActionBar.**

ActionBar already respects `actionOptions`, so disabling is automatic.

---

## 5️⃣ LessonPanel Placement (Final)

```typescript
<TableLayout snapshot={snapshot} onAction={onAction} />

{evaluation && <LessonPanel evaluation={evaluation} />}
```

**LessonPanel never reads snapshot.** It only consumes evaluation results.

---

## 🔧 Final Adjustment: Route-Based Provider Selection

**Providers are chosen by route or screen context, not by UI toggle state.**

### ❌ Avoid:
```typescript
const [mode, setMode] = useState<'GAME' | 'LESSON'>('GAME');
```

### ✅ Prefer:
```typescript
// Route-based selection
/table/[id] → GAME provider
/lesson/[lessonId] → LESSON provider  
/replay/[handId] → REPLAY provider
```

**Why:**
- Prevents state bleed between modes
- Eliminates provider switching mid-session
- Keeps behavior deterministic
- Reduces mental overhead

**Implementation:**
```typescript
// TableScreen reads from route/context
const provider = useRouteBasedProvider();
const { snapshot, onAction } = provider;
```

---

## 🧠 Mental Model (Final Form)

```
UI
 |
 v
ActionBar
 |
 v
onAction(payload)
 |
 v
Provider
 |      \
 |       -> sendToServer()  (GAME)
 |
 -> evaluateAnswer()       (LESSON)
 |
 -> setEvaluation()
```

Same wire. Different destination.

---

## 🧱 What You Accidentally Invented

**A headless poker engine UI.**

Meaning these become providers, not features:

- **Replays** - Historical snapshot provider
- **Lessons** - Educational snapshot provider  
- **Simulations** - What-if scenario provider
- **Solvers** - Optimal play provider
- **Coaching** - Interactive guidance provider
- **Hand reviews** - Analysis provider
- **Ghost tables** - Spectating provider

That's rare-level architecture.

---

## ⚠️ One Important Guardrail

**Do not introduce:**

- `mode` props
- `if (lesson)` inside TableLayout
- `if (lesson)` inside ActionBar  
- `if (lesson)` inside useTableSnapshot

**All lesson intelligence lives above.**

If you ever feel tempted, stop and move it to provider.

---

## 🧪 Small MVP Milestone

**If you implement just this:**

1. `useLessonTableProvider`
2. Hardcoded `buildLessonSnapshot()`
3. One lesson
4. One evaluator
5. One LessonPanel

**You already have a functional poker school.**

---

## 📋 Implementation Checklist

### Provider Contract ✅
```typescript
// apps/client/src/types/tableProvider.ts
export type TableProvider = {
  snapshot: TableSnapshotPayload;
  onAction: (payload: TableActionPayload) => void;
};
```

### Lesson Provider ✅
```typescript
// apps/client/src/hooks/useLessonTableProvider.ts
export function useLessonTableProvider(lessonId: string): TableProvider {
  // Returns exactly TableProvider shape
}
```

### Game Provider ✅
```typescript
// apps/client/src/hooks/useGameTableProvider.ts  
export function useGameTableProvider(tableId: string): TableProvider {
  // Returns exactly TableProvider shape
}
```

### Lesson Snapshot ✅
```typescript
// apps/client/src/lib/lessons/lessonSnapshots.ts
export function buildLessonSnapshot(lessonId: string): TableSnapshotPayload {
  // Returns valid TableSnapshotPayload with optional .lesson metadata
}
```

### Evaluator ✅
```typescript
// apps/client/src/lib/lessons/lessonEvaluator.ts
export function evaluateLessonAnswer(params: {
  lessonId: string;
  snapshot: TableSnapshotPayload;
  answer: TableActionPayload;
}): LessonEvaluation {
  // Pure function, no side effects
}
```

### Lesson Panel ✅
```typescript
// apps/client/src/components/lesson/LessonPanel.tsx
interface LessonPanelProps {
  evaluation: LessonEvaluation;
}
```

---

## 🔧 TableScreen Integration

```typescript
// apps/client/src/components/domain/table/TableScreen.tsx
const [mode, setMode] = useState<'GAME' | 'LESSON'>('GAME');

const provider = mode === 'GAME' 
  ? useGameTableProvider(tableId)
  : useLessonTableProvider(lessonId);

const { snapshot, onAction } = provider;

return (
  <div>
    <TableLayout snapshot={snapshot} onAction={onAction} />
    {mode === 'LESSON' && provider.evaluation && (
      <LessonPanel evaluation={provider.evaluation} />
    )}
  </div>
);
```

---

## 🎯 Success Criteria

### Architectural Purity ✅
- TableLayout has no mode awareness
- ActionBar has no lesson awareness  
- All lesson logic lives in providers
- Provider contract is identical for both modes

### Functional ✅
- Game mode works exactly as before
- Lesson mode renders table correctly
- Actions route to appropriate handler
- Evaluation displays properly

### Extensibility ✅
- New providers can be added without UI changes
- Multiplayer lessons become provider swap
- Replays/simulations follow same pattern

---

## 🚀 The Beauty of This Design

### Single Responsibility
- **TableLayout**: Renders snapshots
- **ActionBar**: Emits actions  
- **Providers**: Handle business logic
- **Panels**: Display results

### Zero Coupling
- UI doesn't know about data source
- Actions don't know about destination
- Evaluations don't know about display

### Infinite Extensibility
Any feature that can be expressed as "snapshot + actions" becomes a provider, not a feature.

---

## 🔮 Future Provider Examples

```typescript
// Replay provider
const useReplayProvider = (handId: string): TableProvider => {
  const [step, setStep] = useState(0);
  const snapshots = loadHandHistory(handId);
  
  return {
    snapshot: snapshots[step],
    onAction: () => setStep(step + 1) // Advance replay
  };
};

// Solver provider  
const useSolverProvider = (situation: Situation): TableProvider => {
  return {
    snapshot: situation,
    onAction: (action) => showSolverAnalysis(action)
  };
};
```

Same UI, zero changes.

---

Here’s a tight, execution-ordered MVP task list aligned with the canonical architecture:

1. Define the Frozen Provider Contract

Create types/tableProvider.ts

Export TableProvider type

Update any existing game-side logic to conform to returning { snapshot, onAction }

Outcome: One shared contract used everywhere.

2. Extract Current GAME Logic into useGameTableProvider

Move snapshot selection + sendAction wiring from TableScreen into hook

Hook returns TableProvider

Outcome: GAME path becomes just another provider.

3. Implement buildLessonSnapshot()

Create one hardcoded lesson snapshot shaped as TableSnapshotPayload

Add optional snapshot.lesson metadata

Ensure it renders correctly in TableLayout

Outcome: Table renders a lesson without realtime.

4. Implement useLessonTableProvider

Hold snapshot in state

Implement onAction that:

Records answer

Runs evaluator

Locks actions via hero.actionOptions = []

Outcome: Lessons respond to ActionBar clicks.

5. Implement Pure Lesson Evaluator

Create evaluateLessonAnswer()

Return { correct, explanation, expected? }

Outcome: Deterministic grading.

6. Build LessonPanel

Display correctness + explanation

Add “Continue” button (optional) to load next snapshot

Outcome: Feedback UI exists.

7. Add Route-Based Provider Selection

/table/[id] → useGameTableProvider

/lesson/[lessonId] → useLessonTableProvider

Render:

const { snapshot, onAction } = provider;
<TableLayout snapshot={snapshot} onAction={onAction} />
{evaluation && <LessonPanel evaluation={evaluation} />}


Outcome: Two modes, zero UI forks.

8. Smoke Test Guardrails

Confirm:

No lesson logic inside TableLayout

No lesson logic inside ActionBar

No mode props added

Outcome: Architecture stays clean.

If you complete these 8 tasks, you will have:

✅ A working poker lesson
✅ Reused table UI
✅ Headless provider architecture
✅ Foundation for multiplayer lessons, replays, solvers, and coaching

This is the correct build order.