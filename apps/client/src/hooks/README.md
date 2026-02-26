# Hooks Directory

## Replay Architecture

Replay is implemented via table providers. Do not add generic replay providers.

### Correct approach

- `useHandReplayTableProvider(handId)` - lean `TableProvider` + replay controller
- Future: `useLessonReplayTableProvider(lessonId)` - same interface, different data source
- Future: `useCoachingReplayTableProvider(sessionId)` - same interface, different data source

### Obsolete (deleted)

- `useReplayProvider` - generic replay abstraction
- `useHandReplayProvider` - legacy hand replay provider

### Architecture principle

Replay is another provider mode, not a separate system.

```text
Snapshot Source -> useXReplayTableProvider -> TableProvider -> ActiveTableView
```

All replay modes (hand history, lessons, coaching) share:

- `TableProvider` contract (snapshot + onAction)
- replay controller interface (navigation + playback)
- same `ActiveTableView` renderer

This ensures:

- single UI codebase
- type safety via `assertTableProvider`
- future extensibility
- no parallel abstractions
