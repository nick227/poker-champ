# 🎯 Hooks Directory

## Replay Architecture

**Replay is implemented via TableProviders. Do NOT add generic replay providers.**

### ✅ Correct Approach
- `useHandReplayTableProvider(handId)` - Lean TableProvider + ReplayController
- Future: `useLessonReplayTableProvider(lessonId)` - Same interface, different data source
- Future: `useCoachingReplayTableProvider(sessionId)` - Same interface, different data source

### ❌ Obsolete (Deleted)
- `useReplayProvider` - Generic replay abstraction (removed)
- `useHandReplayProvider` - Legacy hand replay provider (removed)

### 🏗️ Architecture Principle
**Replay is just another provider, not a new system.**

```
Snapshot Source → useXReplayTableProvider → TableProvider → TableLayout
```

All replay modes (hand history, lessons, coaching) use the same:
- TableProvider contract (snapshot + onAction)
- ReplayController interface (navigation + playback)
- Same TableLayout component

This ensures:
- ✅ Single UI codebase
- ✅ Type safety via assertTableProvider
- ✅ Future extensibility
- ✅ No parallel abstractions
