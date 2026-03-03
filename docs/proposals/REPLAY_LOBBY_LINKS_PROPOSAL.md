# Replay Lobby Links Proposal

## Scope
Add two lobby entry points:

1. `Replay last hand`
2. `Community Hand`

Both should open replay using the existing table-based replay experience, where replay controls are the primary interaction and table actions are hidden.

## Product Decision (After Review)
We are **not** introducing a heavyweight runtime abstraction in this epic.

Phase 1 uses a hard, simple boundary:
- Live table path mounts live provider(s) only.
- Replay path mounts replay provider(s) only.
- Replay loads as a single chunk (full payload/snapshots), no streaming.

This is enough to ship safely without over-engineering.

## Current Replay Status

### What is already strong
- Replay architecture is modular and reusable:
  - `ReplayContent` dispatches by source type (`handId` or `snapshots`).
  - `ReplayFromRemoteSource` and `ReplayFromSnapshots` converge on one `ReplaySurface`.
  - `ReplaySurface` renders the same `ActiveTableView` used in live play plus `ReplayControls`.
- Core hooks exist and are usable now:
  - `useHandReplayTableProvider(handId)`
  - `useReplayTableProviderFromSnapshots(snapshots)`
- History integration is already live:
  - Hand list and hand detail can open `ReplaySheet`.
  - Full page replay route `/replay/[handId]` exists.
- Test coverage exists for replay engine behavior:
  - `replaySceneModel`, scrubber math, snapshots provider hook.
  - Current replay-targeted tests pass (17/17).

### Gaps and risks
- No lobby entry points yet for replay.
- No latest replayable hand selector in lobby state.
- No curated community replay dataset yet.
- Replay mode is not visually distinct enough from live mode.
- No explicit guardrail test proving replay creates zero realtime socket activity.
- No hermeticity test proving replay does not mutate live global stores.
- `ReplayController` contains legacy source enum typing in `types/replayController.ts` while source-of-truth now lives in `components/replay/replay.types.ts`.

## Readiness Verdict
Replay is ready enough to ship as a lobby feature now, with targeted UI and safety hardening.

For lesson-style walkthroughs, architecture is ready because snapshots-based replay is already implemented. The missing pieces are curated content and replay-mode UX treatment.

## Product Proposal

### 1) Lobby link: `Replay last hand`
- Add a quick action in lobby (primary).
- Behavior:
  - If user has a replayable hand, open `ReplaySheet` with `source={{ type: "handId", handId }}`.
  - If none exists, show disabled state with helper text (`Play a hand to unlock replay`).
- Data strategy:
  - Fetch recent hands via `historyService.getHands({ limit: N })`.
  - Pick first hand where `hasReplay === true`.
  - Cache in lobby state and refresh on lobby load/interval.
  - Phase 1b optimization: update a lightweight in-memory `latestReplayHandId` on hand completion event to reduce lag.

### 2) Lobby link: `Community Hand`
- Add a second quick action in lobby (secondary).
- Behavior:
  - Open `ReplaySheet` with snapshots source:
    - `source={{ type: "snapshots", snapshots, handId: "community:<id>" }}`
- Content strategy:
  - Create curated catalog under replay feature domain:
    - `apps/client/src/features/replay/community/communityHands.ts`
  - Start with one canonical hand (6-12 snapshots).
  - Include metadata (`id`, `title`, `summary`, `difficulty`, `snapshots`).
  - Include snapshot schema/version assertion to catch silent breakage.

## Technical Design

### Lobby UI integration
- Add component:
  - `apps/client/src/components/domain/lobby/ReplayQuickLinks.tsx`
- Render in `app/lobby.tsx` near top content (`GameListHeader` / `InstantGamePanels` region).
- Manage local replay source:
  - `const [replaySheetSource, setReplaySheetSource] = useState<ReplaySource | null>(null);`
- Reuse existing `ReplaySheet`.

### Data/loading
- Add helper hook:
  - `apps/client/src/hooks/useLatestReplayHand.ts`
- Responsibilities:
  - Load recent hands (token from auth store).
  - Derive latest replayable hand id.
  - If `hasReplay` is not flagged from list API, probe recent hand details and select first hand with non-empty `snapshots`.
  - Expose `{ latestHandId, loading, error, refresh }`.

### Community hand content
- Add:
  - `apps/client/src/features/replay/community/communityHands.ts`
  - `apps/client/src/features/replay/community/assertReplaySnapshotsShape.ts`
- Export:
  - `COMMUNITY_HAND_DEFAULT_ID`
  - `getCommunityHandById(id)`
  - `getDefaultCommunityHand()`
- Enforce:
  - readonly snapshots contract
  - schema/version assertion at load time

### Replay mode UX boundary (required)
- Add explicit render mode: `tableMode: "live" | "replay"`.
- In replay mode:
  - Hide live action area entirely (do not show disabled live actions).
  - Render replay controls as the only bottom interaction surface.
  - Add subtle replay indicator (badge/header label).
- Ensure sheet and full-page replay use the same `ReplaySurface` composition.

### Hermetic runtime boundary (required)
- Replay path must not mount realtime hooks/providers.
- Replay path must not join websocket rooms, register table presence, or emit heartbeats.
- Replay data sources are HTTP history fetch or local snapshots only.

## Implementation Plan

1. Add lobby replay quick-link UI and wire `ReplaySheet` in `app/lobby.tsx`.
2. Implement `useLatestReplayHand` and enabled/disabled state for `Replay last hand`.
3. Add `features/replay/community/communityHands.ts` with one predefined hand and schema/version assertions.
4. Add replay visual mode polish (`tableMode="replay"`) and hide live action UI in replay.
5. Add hermetic guardrail tests.

## Testing Plan

### Unit
- `useLatestReplayHand.test.ts`
  - returns latest replayable hand id
  - handles no replayable hands
  - handles auth missing/error
- `communityHands.test.ts`
  - default hand exists
  - snapshots non-empty and valid
  - invalid shape/version fails assertion

### Component/integration
- Lobby quick links:
  - last hand link enabled/disabled correctly
  - pressing each link opens replay sheet
- Replay behavior:
  - replay controls visible
  - live action UI hidden in replay mode

### Hermeticity tests (required)
- Opening replay from lobby triggers zero realtime socket/room activity.
- Replay scrub/play operations do not mutate live global stores:
  - bankroll unchanged
  - active tables unchanged
  - lobby/presence state unchanged

### E2E (optional phase 1)
- From lobby, open `Replay last hand` and scrub steps.
- From lobby, open `Community Hand` and scrub/play through.

## Acceptance Criteria
- Lobby shows both links: `Replay last hand`, `Community Hand`.
- `Replay last hand` opens latest replayable hand when available.
- `Community Hand` opens predefined walkthrough hand via snapshots source.
- Replay controls are the only bottom interaction surface in replay.
- Replay open path triggers zero realtime socket/room/presence activity.
- Replay scrub/play does not mutate live stores.
- No regression to existing history replay and `/replay/[handId]` route.

## Out of Scope
- Multi-hand community library picker UI.
- Backend CMS for community hand authoring.
- Full lesson progression/scoring integration.
- Full runtime abstraction unification unless future repetition justifies it.

## Suggested Follow-up (Next Epic)
- Add multiple community hands with difficulty tiers.
- Add deep links for community hand ids.
- Add step-based message/decision overlays on top of replay timeline without live-server coupling.
