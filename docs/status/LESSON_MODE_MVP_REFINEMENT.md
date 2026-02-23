# Lesson Mode MVP Refinement

## Executive Summary

A tightened, MVP-oriented refinement that keeps TableLayout dumb and generic by introducing Snapshot Provider + Action Provider abstraction at the TableScreen level. This preserves architectural cleanliness and prevents lesson logic from leaking into core table UI.

---

## ✅ What Windsurf Got Right

- Mode switch at the TableScreen level
- Reusing TableLayout as the rendering surface  
- Lesson snapshots shaped like TableSnapshotPayload
- Separate controllers for GAME vs LESSON
- Local lesson evaluation instead of realtime

These align perfectly with existing snapshot + actionContext architecture.

---

## ⚠️ Architectural Adjustment: Keep TableLayout Dumb

### ❌ Instead of:
```typescript
<TableLayout mode="LESSON" ... />
```

### ✅ Prefer:
```typescript
const { snapshot, onAction } = useSnapshotProvider();
<TableLayout snapshot={snapshot} onAction={onAction} />
```

**Why:**
- TableLayout already assumes "I render a snapshot"
- Existing logic already moved into hooks (useTableSnapshot)
- Keeps lessons from polluting game UI code
- Lets lessons behave like "fake tables"

**Principle:** TableLayout never knows what mode exists.

---

## 🏗️ Provider Architecture

### Two Providers at TableScreen Level

```typescript
const provider = 
  mode === "GAME"
    ? useGameTableProvider(...)
    : useLessonTableProvider(...);

const { snapshot, onAction } = provider;
```

**Provider Contract:**
```typescript
type TableProvider = {
  snapshot: TableSnapshotPayload;
  onAction: (action: TableActionPayload) => void;
};
```

That's it. No new props to TableLayout.

---

## 📊 Lesson Snapshots: Extension, Not Parallel

### ❌ Avoid parallel structures:
```typescript
interface LessonSnapshot {
  tableState: TableSnapshotPayload;
}
```

### ✅ Prefer extension:
```typescript
type LessonSnapshot = TableSnapshotPayload & {
  lesson?: {
    question?: LessonQuestion;
    explanation?: string;
  };
};
```

**Why:**
- Zero adapters needed
- Existing selectors keep working
- Optional lesson metadata rides alongside

---

## 🔄 Action Remapping = Harness, Not Fork

### Lesson Provider:
```typescript
const onAction = (payload) => {
  setStudentAnswer(payload);
  evaluate(payload);
};
```

### Game Provider:
```typescript
const onAction = sendToServer;
```

ActionBar doesn't change. This matches the harness concept that remaps handlers.

---

## 🎨 UI Placement: Beside, Not Inside

### ❌ Instead of embedding LessonPanel inside TableLayout:
```typescript
<TableLayout>
  <LessonPanel /> // Inside table
</TableLayout>
```

### ✅ Prefer:
```typescript
<TableLayout ... />
{mode === "LESSON" && <LessonPanel />} // Beside table
```

**Why:**
- Table stays visually pure
- Lessons can be cards-only, video-only, MCQ-only, etc.
- Future multiplayer lessons won't touch table code

---

## 🔑 MVP Architecture (Simplified)

```
TableScreen
 ├─ useGameTableProvider OR useLessonTableProvider
 │     ├─ snapshot
 │     └─ onAction
 ├─ TableLayout(snapshot, onAction)
 └─ LessonPanel (only in lesson mode)
```

No mode prop. No TableLayout branching.

---

## 🧱 Minimal File Set (MVP)

### New Files
```
hooks/useLessonTableProvider.ts
lib/lessons/lessonSnapshots.ts
lib/lessons/lessonEvaluator.ts
components/lesson/LessonPanel.tsx
```

### Modified Files
```
TableScreen.tsx   // choose provider
```

That's it. Everything else can come later.

---

## 🚀 Strategic Advantage

**Lessons feel like tables**
- Same visual experience
- Same interaction patterns

**Tables can later feel like lessons**
- Seamless transition between modes

**Multiplayer lessons become trivial**
- Replace useLessonTableProvider with Colyseus-backed provider
- Zero UI duplication
- Zero fork of ActionBar, HeroZone, CommunityBoard, etc.

---

## 🎯 Big Idea: The One to Anchor On

**A poker table is just a projection of a snapshot + action pipe.**

If you can swap the snapshot source and action sink, you unlock:
- Games
- Lessons  
- Replays
- Simulations
- Coaching

All without touching UI.

---

## 🧠 Mental Model

```
ActionBar
   |
   v
onAction(payload)
   |
   v
LessonTableProvider.handleAction(payload)
   |
   +-- store studentAnswer
   +-- run evaluator
   +-- produce feedback
   +-- update lesson state
```

Exactly the same shape as GAME mode:
```
ActionBar → onAction → sendToServer()
```

---

## 📁 useLessonTableProvider Implementation

```typescript
export function useLessonTableProvider(lessonId: string) {
  const [snapshot, setSnapshot] = useState<TableSnapshotPayload>(
    buildLessonSnapshot(lessonId)
  );

  const [evaluation, setEvaluation] = useState<LessonEvaluation | null>(null);

  const handleAction = useCallback((payload) => {
    // 1) Store answer
    const answer = payload;

    // 2) Evaluate
    const result = evaluateLessonAnswer({
      lessonId,
      snapshot,
      answer,
    });

    // 3) Save evaluation
    setEvaluation(result);

    // 4) Optionally mutate snapshot (lock actions, etc.)
    setSnapshot((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        actionOptions: [], // disables buttons
      },
    }));
  }, [lessonId, snapshot]);

  return {
    snapshot,
    onAction: handleAction,
    evaluation,
  };
}
```

---

## 🧩 Evaluator (Pure Function)

```typescript
export function evaluateLessonAnswer({
  lessonId,
  snapshot,
  answer,
}: {
  lessonId: string;
  snapshot: TableSnapshotPayload;
  answer: TableActionPayload;
}): LessonEvaluation {
  const lesson = getLessonById(lessonId);

  if (lesson.correctAction === answer.type) {
    return {
      correct: true,
      explanation: lesson.explanation,
    };
  }

  return {
    correct: false,
    explanation: lesson.explanation,
    expected: lesson.correctAction,
  };
}
```

No React. No UI. No side effects.

---

## 📦 LessonPanel Consumes Evaluation

```typescript
const { evaluation } = useLessonTableProvider(...);

{evaluation && (
  <LessonPanel evaluation={evaluation} />
)}
```

---

## 🎮 What ActionBar Experiences

Nothing special.

Buttons call:
```typescript
onAction({ type: "FOLD" })
```

Lesson provider intercepts it. ActionBar stays blissfully ignorant.

---

## 🔒 Locking Actions After Answer

We already use:
```typescript
hero.actionOptions = []
```

Since ActionBar already respects allowedActions, all buttons disable automatically. Zero new logic.

---

## 🔁 Multi-Step Lessons

After user clicks Continue in LessonPanel:
```typescript
setSnapshot(buildLessonSnapshot(nextLessonId));
setEvaluation(null);
```

ActionBar becomes enabled again because new snapshot has actionOptions.

---

## 🧱 Why This Works So Well

✔ No ActionBar changes
✔ No TableLayout changes  
✔ No duplicated UI
✔ Lessons feel like poker hands
✔ Multiplayer-ready later
✔ Evaluation fully decoupled

---

## 🧠 Conceptual Takeaway

You are not "adding lessons."

You are **replacing the server with a local brain.**

ActionBar already talks to a function. You're just swapping where that function points.

---

## 🔑 One-Sentence Rule

**ActionBar always emits actions. Providers decide whether actions become network messages or lesson answers.**

---

## 🚀 Next Steps (Optional)

If you want to continue, we can walk through:

👉 Example lesson snapshot object
👉 How to embed multiple-choice questions (no cards)  
👉 How to show EV ranges instead of right/wrong

Just say the word.

---

*This refinement preserves the core insight while pushing intelligence upward and keeping TableLayout completely dumb, creating the cleanest possible separation between game and lesson modes.*
