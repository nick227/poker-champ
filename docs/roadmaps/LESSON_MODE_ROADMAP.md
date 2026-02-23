# Lesson Mode Implementation Roadmap

## Executive Summary

Transform the existing poker table into a dual-purpose interactive learning surface by introducing a mode switch (GAME/LESSON) that allows the same `TableLayout` component to render either live game snapshots or lesson-based content. This approach maximizes code reuse while minimizing architectural risk.

---

## 🎯 Core Architecture Principle

**Table as Generic Snapshot Renderer**
- Single `TableLayout` component handles both modes
- Mode switch determines data source and action handling
- GAME mode: Live Colyseus snapshots (current behavior)
- LESSON mode: Local/static lesson snapshots (new behavior)

---

## 🏗️ Architecture Overview

```
TableScreen
├── Mode Switch (GAME/LESSON)
├── TableLayout (shared component)
│   ├── Snapshot Renderer (mode-agnostic)
│   ├── Action Handlers (mode-specific)
│   └── UI Elements (context-aware)
└── Mode Controllers
    ├── GameController (existing)
    └── LessonController (new)
```

---

## 📋 Implementation Phases

### Phase 1: Foundation - Mode Switch & Basic Lesson Rendering (2-3 weeks)

#### 1.1 Table Screen Mode Switch
**Files to modify:**
- `apps/client/src/components/domain/table/TableScreen.tsx`
- `apps/client/src/components/domain/table/TableLayout.tsx`

**Implementation:**
```typescript
// Add mode state
const [tableMode, setTableMode] = useState<'GAME' | 'LESSON'>('GAME');

// Conditional data source
const snapshot = tableMode === 'GAME' 
  ? useGameSnapshot(tableId) 
  : useLessonSnapshot(lessonId);

// Conditional action handlers
const handleAction = tableMode === 'GAME'
  ? handleGameAction 
  : handleLessonAction;
```

#### 1.2 Lesson Snapshot Structure
**New files:**
- `apps/client/src/lib/lessonSnapshot.ts`
- `apps/client/src/types/lesson.ts`

**Implementation:**
```typescript
interface LessonSnapshot {
  // Reuse existing snapshot structure
  tableState: TableSnapshotPayload;
  
  // Lesson-specific metadata
  lessonId: string;
  question: LessonQuestion;
  context: LessonContext;
  evaluation?: LessonEvaluation;
}

interface LessonQuestion {
  id: string;
  text: string;
  type: 'multiple-choice' | 'action' | 'sizing';
  options?: string[];
  correctAnswer: any;
}
```

#### 1.3 Basic Lesson Controller
**New files:**
- `apps/client/src/hooks/useLessonController.ts`
- `apps/client/src/services/lessonService.ts`

**Implementation:**
```typescript
const useLessonController = (lessonId: string) => {
  const [lessonSnapshot, setLessonSnapshot] = useState<LessonSnapshot>();
  const [answer, setAnswer] = useState<any>();
  
  const handleAction = (action: ActionPayload) => {
    // Record answer instead of sending to server
    setAnswer(action);
    evaluateAnswer(action);
  };
  
  return { lessonSnapshot, handleAction, answer };
};
```

---

### Phase 2: Lesson Content & Evaluation (2-3 weeks)

#### 2.1 Lesson Factory System
**New files:**
- `apps/client/src/lib/lessonFactory.ts`
- `apps/client/src/lib/lessonTemplates.ts`

**Implementation:**
```typescript
class LessonFactory {
  static createLesson(config: LessonConfig): LessonSnapshot {
    return {
      tableState: this.createTableState(config),
      question: this.createQuestion(config),
      context: this.createContext(config)
    };
  }
  
  private static createTableState(config: LessonConfig): TableSnapshotPayload {
    // Reuse existing table state structure
    // Populate with lesson-specific data
  }
}
```

#### 2.2 Answer Evaluation Engine
**New files:**
- `apps/client/src/lib/lessonEvaluation.ts`
- `apps/client/src/components/lesson/EvaluationPanel.tsx`

**Implementation:**
```typescript
class LessonEvaluator {
  static evaluateAnswer(
    question: LessonQuestion, 
    answer: ActionPayload
  ): LessonEvaluation {
    switch (question.type) {
      case 'multiple-choice':
        return this.evaluateMultipleChoice(question, answer);
      case 'action':
        return this.evaluateAction(question, answer);
      case 'sizing':
        return this.evaluateSizing(question, answer);
    }
  }
}
```

#### 2.3 Lesson UI Components
**New files:**
- `apps/client/src/components/lesson/LessonPanel.tsx`
- `apps/client/src/components/lesson/QuestionDisplay.tsx`
- `apps/client/src/components/lesson/FeedbackDisplay.tsx`

---

### Phase 3: Lesson Management & Navigation (2 weeks)

#### 3.1 Lesson Navigation System
**New files:**
- `apps/client/src/components/lesson/LessonNavigator.tsx`
- `apps/client/src/hooks/useLessonNavigation.ts`

**Implementation:**
```typescript
const useLessonNavigation = () => {
  const [currentLesson, setCurrentLesson] = useState(0);
  const [lessons, setLessons] = useState<LessonSnapshot[]>([]);
  
  const nextLesson = () => {
    if (currentLesson < lessons.length - 1) {
      setCurrentLesson(currentLesson + 1);
    }
  };
  
  const previousLesson = () => {
    if (currentLesson > 0) {
      setCurrentLesson(currentLesson - 1);
    }
  };
  
  return { currentLesson, lessons, nextLesson, previousLesson };
};
```

#### 3.2 Lesson Progress Tracking
**New files:**
- `apps/client/src/lib/lessonProgress.ts`
- `apps/client/src/components/lesson/ProgressBar.tsx`

#### 3.3 Mode Switch UI
**Files to modify:**
- `apps/client/src/components/domain/table/TableScreen.tsx`

**Implementation:**
```typescript
// Add mode switcher
<div className="mode-switcher">
  <button 
    onClick={() => setTableMode('GAME')}
    className={tableMode === 'GAME' ? 'active' : ''}
  >
    Play Game
  </button>
  <button 
    onClick={() => setTableMode('LESSON')}
    className={tableMode === 'LESSON' ? 'active' : ''}
  >
    Lessons
  </button>
</div>
```

---

### Phase 4: Advanced Features & Polish (2-3 weeks)

#### 4.1 Lesson Templates Library
**New files:**
- `apps/client/src/lib/lessonTemplates/preflop.ts`
- `apps/client/src/lib/lessonTemplates/postflop.ts`
- `apps/client/src/lib/lessonTemplates/tournament.ts`

#### 4.2 Interactive Explanations
**New files:**
- `apps/client/src/components/lesson/InteractiveExplanation.tsx`
- `apps/client/src/lib/lessonAnimations.ts`

#### 4.3 Performance Optimization
- Lazy loading of lesson content
- Snapshot caching for instant transitions
- Optimized re-rendering for smooth animations

---

## 🔧 Technical Implementation Details

### 1. Mode-Aware TableLayout

**Key modifications to `TableLayout.tsx`:**
```typescript
interface TableLayoutProps {
  mode: 'GAME' | 'LESSON';
  snapshot: TableSnapshotPayload;
  onAction: (action: ActionPayload) => void;
  lessonContext?: LessonContext;
}

const TableLayout: React.FC<TableLayoutProps> = ({
  mode,
  snapshot,
  onAction,
  lessonContext
}) => {
  // Shared rendering logic
  const renderTable = () => { /* existing logic */ };
  
  // Mode-specific action handling
  const handleAction = useCallback((action: ActionPayload) => {
    if (mode === 'LESSON' && lessonContext?.readOnly) {
      // Show explanation instead of action
      return;
    }
    onAction(action);
  }, [mode, onAction, lessonContext]);
  
  return (
    <div className="table-layout">
      {renderTable()}
      {mode === 'LESSON' && (
        <LessonPanel context={lessonContext} />
      )}
    </div>
  );
};
```

### 2. Snapshot Abstraction Layer

**New file: `apps/client/src/lib/snapshotAdapter.ts`**
```typescript
class SnapshotAdapter {
  static toTableSnapshot(lessonSnapshot: LessonSnapshot): TableSnapshotPayload {
    // Convert lesson snapshot to table snapshot format
    return lessonSnapshot.tableState;
  }
  
  static toLessonSnapshot(tableSnapshot: TableSnapshotPayload): LessonSnapshot {
    // Convert table snapshot to lesson format (for saving interesting spots)
    return {
      tableState: tableSnapshot,
      lessonId: generateId(),
      question: generateQuestionFromContext(tableSnapshot),
      context: extractContext(tableSnapshot)
    };
  }
}
```

### 3. Action Handler Abstraction

**New file: `apps/client/src/lib/actionHandler.ts`**
```typescript
interface ActionHandler {
  handleAction(action: ActionPayload): Promise<void>;
  canAct(userId: string): boolean;
  getActionOptions(): ActionOptions;
}

class GameActionHandler implements ActionHandler {
  constructor(private room: Room) {}
  
  async handleAction(action: ActionPayload) {
    await this.room.send('action', action);
  }
  // ... existing game logic
}

class LessonActionHandler implements ActionHandler {
  constructor(private lessonController: LessonController) {}
  
  async handleAction(action: ActionPayload) {
    await this.lessonController.recordAnswer(action);
  }
  // ... lesson-specific logic
}
```

---

## 📊 File Structure Impact

### New Files
```
apps/client/src/
├── components/lesson/
│   ├── LessonPanel.tsx
│   ├── QuestionDisplay.tsx
│   ├── FeedbackDisplay.tsx
│   ├── LessonNavigator.tsx
│   └── ProgressBar.tsx
├── hooks/
│   ├── useLessonController.ts
│   └── useLessonNavigation.ts
├── lib/
│   ├── lessonSnapshot.ts
│   ├── lessonFactory.ts
│   ├── lessonEvaluation.ts
│   ├── lessonTemplates/
│   ├── snapshotAdapter.ts
│   └── actionHandler.ts
├── services/
│   └── lessonService.ts
└── types/
    └── lesson.ts
```

### Modified Files
```
apps/client/src/
├── components/domain/table/
│   ├── TableScreen.tsx (add mode switch)
│   └── TableLayout.tsx (make mode-aware)
└── lib/lobbyTables.ts (extend for lesson support)
```

---

## 🎯 Success Criteria

### Phase 1 Success
- [ ] Mode switch works without breaking game functionality
- [ ] Basic lesson snapshots render correctly in TableLayout
- [ ] Action handling properly routed based on mode

### Phase 2 Success
- [ ] Lesson evaluation works for all question types
- [ ] Feedback displays correctly after answer submission
- [ ] Lesson factory creates valid snapshots

### Phase 3 Success
- [ ] Complete lesson flow works end-to-end
- [ ] Progress tracking persists across sessions
- [ ] Navigation between lessons is smooth

### Phase 4 Success
- [ ] Performance matches game mode responsiveness
- [ ] Template library supports diverse lesson types
- [ ] UI/UX is polished and intuitive

---

## 🚀 Benefits of This Approach

### 1. Minimal Code Duplication
- Single TableLayout component serves both modes
- Existing snapshot structure reused
- Shared action handling logic

### 2. Low Architectural Risk
- Game mode remains unchanged
- Lesson mode is additive, not invasive
- Clear separation of concerns

### 3. Scalable Foundation
- Easy to add new lesson types
- Supports future multiplayer lessons
- Extensible to other learning content

### 4. Fast Development Cycle
- Leverages existing battle-tested components
- Clear, phased implementation
- Immediate value at each phase

---

## 🔄 Future Extensions

### Multiplayer Lessons
- Colyseus room for collaborative learning
- Shared lesson state and discussion
- Instructor-led sessions

### Advanced Interactions
- Voice explanations
- Animated demonstrations
- Interactive range visualizations

### Content Management
- Web-based lesson creator
- Community lesson sharing
- AI-assisted lesson generation

---

*This roadmap provides a clear, low-risk path to transforming the poker table into a powerful interactive learning surface while preserving all existing functionality and maximizing code reuse.*
