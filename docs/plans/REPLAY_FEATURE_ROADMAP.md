# Replay Feature Roadmap

## Summary

Replay is triggered from hand history and should **open in a sheet** (not a full-page route). The **replay engine** (data + controller) must have **zero UI**; the **replay surface** (table + controls) must have **zero routing**; **containers** (sheet/page/overlay) must have **zero replay logic**. Replay must support both **fetch-by-handId** and **preloaded snapshots** so in-game, share link, and embed stay trivial.

---

## Current State (Post–Phase 2)

| Area | Implementation |
|------|----------------|
| **Entry** | Hand list: "Replay Hand" on `HandListItem` when `hasReplay === true`; HandDetailModal: "Replay Hand" when `hand.snapshots?.length > 0` and `onReplayPress` provided. |
| **Flow** | Both trigger `setReplaySheetSource({ type: "handId", handId })` → ReplaySheet opens (sheet-first). |
| **Fallback** | If `onReplayPress` not provided (e.g. list reused elsewhere), `router.push(\`/replay/${hand.id}\`)`. |
| **Full page** | `/replay/[handId]` is a thin wrapper: shell + `<ReplayContent source={{ type: "handId", handId }} />` (deep links). |
| **Replay core** | Engine: `useHandReplayTableProvider`, `useReplayTableProviderFromSnapshots`. Surface: ReplaySurface (TableLayout + ReplayControls). Content: ReplayContent → ReplayFromRemoteSource | ReplayFromSnapshots. |
| **Data** | `GET /api/history/hands/:id` returns `HandHistoryDetail` with `snapshots: TableSnapshotPayload[]`. Replay scene model is frozen and action-disabled via `buildReplayDisabledSceneModel`. |
| **Tests** | replaySceneModel.test.ts, replay.scrubber.test.ts, useReplayTableProviderFromSnapshots.test.ts (17 tests). |

---

## Goals

1. **Sheet from history** – Replay opens in a **sheet** when user taps "Replay Hand" in hand history.
2. **Source-agnostic replay** – Replay accepts either **handId** (fetch) or **snapshots** (preloaded). ReplayContent never fetches unless told to; containers decide source.
3. **One table, one surface** – Replay uses the **same** TableLayout, HeroZone, OpponentStrip, DealerAnnounceBar as in-game. ReplayControls are the only addition. No “replay-only” table variant.
4. **Container-driven layout** – ReplayContent does **not** assume full-screen height; the container (sheet, page, overlay) dictates size. Layout works inside constrained height.
5. **Future-proof reuse** – In-game “review last hand”, share link, embed, coach view, AI overlay = same ReplayContent with different source/container.

---

## Final Architecture (Ideal Form)

```
┌─────────────────────────────────────────────────────────────────┐
│ CONTAINERS (zero replay logic)                                    │
│  • ReplaySheet (history)                                          │
│  • ReplayPage (/replay/[handId] – thin wrapper)                   │
│  • (Future) InGameReplayOverlay, SharedReplayView, Embed          │
│  Decide: source (handId vs snapshots), size, chrome               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ REPLAY CONTENT (public API – thin adapter)                        │
│  • Props: source: ReplaySource, compact?, onClose?                │
│  • Dispatches to ReplayFromRemoteSource or ReplayFromSnapshots   │
│  • Never fetches unless source says so; never knows where data came from │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌────────────────┴────────────────┐
              ▼                                  ▼
┌─────────────────────────┐       ┌─────────────────────────────┐
│ ReplayFromRemoteSource   │       │ ReplayFromSnapshots          │
│ (handId → fetch; future  │       │ (preloaded snapshots)         │
│  handRef/tableId ok)     │       │ useReplayTableProviderFrom   │
│ loading / error / empty  │       │ Snapshots (no fetch)          │
└─────────────────────────┘       └─────────────────────────────┘
              │                                  │
              └────────────────┬────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ REPLAY SURFACE (internal – single shared renderer)                │
│  • Props: sceneModel, controller, compact? (explicit contract)     │
│  • TableLayout (same as in-game) + ReplayControls                 │
│  • Zero routing; adapters extract and pass only what surface needs │
│  • One visual surface forever                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ ENGINE (zero UI)                                                  │
│  • useHandReplayTableProvider(handId)                             │
│  • useReplayTableProviderFromSnapshots(snapshots) [new]          │
│  • ReplayController, ReplayTableProvider                          │
└─────────────────────────────────────────────────────────────────┘
```

- **Engine** – Data + controller only. No UI.
- **Surface** – Table + controls only. No routing, no fetch.
- **Container** – Where replay appears. No replay logic; passes `source` and size.

---

## ReplaySource and Public API

ReplayContent must **not** be locked to `handId` only. Design from day one for handId and preloaded snapshots.

**Types** (e.g. `components/replay/replay.types.ts`):

```ts
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

export type ReplaySource =
  | { type: "handId"; handId: string }
  | {
      type: "snapshots";
      snapshots: TableSnapshotPayload[];
      handId?: string; // optional for labeling / title
    };

export type ReplayContentProps = {
  source: ReplaySource;
  /** Optional layout hints (e.g. for sheet) */
  compact?: boolean;
  /** Optional callbacks */
  onClose?: () => void;
};
```

**ReplayContent as thin adapter** – no direct TableLayout; delegates to ReplayFromRemoteSource or ReplayFromSnapshots:

```ts
function ReplayContent({ source, compact, onClose }: ReplayContentProps) {
  if (source.type === "handId") {
    return <ReplayFromRemoteSource handId={source.handId} compact={compact} onClose={onClose} />;
  }
  return (
    <ReplayFromSnapshots
      snapshots={source.snapshots}
      handId={source.handId}
      compact={compact}
      onClose={onClose}
    />
  );
}
```

**Usage examples:**

| Context | Usage |
|--------|--------|
| History sheet | `<ReplayContent source={{ type: "handId", handId }} />` |
| In-game “Review last hand” | `<ReplayContent source={{ type: "snapshots", snapshots: lastHandSnapshots, handId: lastHandId }} />` |
| Shared / deep link page | `<ReplayContent source={{ type: "handId", handId: params.handId }} />` |

Containers decide source; ReplayContent never fetches unless told to.

---

## ReplayFromRemoteSource vs ReplayFromSnapshots

Naming is symmetrical and transport-agnostic: later you may support `{ type: "handRef"; tableId; handNumber }` without baking "handId" into the component name.

- **ReplayFromRemoteSource** – Uses existing `useHandReplayTableProvider(handId)` (or future handRef). Handles loading, error, empty. Extracts `sceneModel` and `controller` from provider; passes only those to ReplaySurface.
- **ReplayFromSnapshots** – Uses new hook `useReplayTableProviderFromSnapshots(snapshots)` with **readonly** snapshots (see below). No fetch. Extracts `sceneModel` and `controller`; passes only those to ReplaySurface.

Both paths converge on **ReplaySurface**. No UI duplication.

---

## ReplaySurface (internal)

Single shared renderer so the replay table is **identical** to in-game. Props are **explicit** so the surface does not depend on provider internals and the contract stays stable:

```ts
type ReplaySurfaceProps = {
  sceneModel: TableSceneModel;
  controller: ReplayController;
  compact?: boolean;
};
```

- Same **TableLayout** (same HeroZone, OpponentStrip, DealerAnnounceBar).
- **ReplayControls** are the only addition.
- ReplayFromRemoteSource / ReplayFromSnapshots **adapters** extract `sceneModel` and `controller` from the provider and pass only what the surface needs.

ReplayContent **never** directly renders TableLayout; it always goes through ReplaySurface. One visual surface, one place, forever.

---

## ReplaySheet Considerations

Sheet constraints must be decided early so ReplayContent does not assume full-screen:

- **Height** – Does replay fill full sheet height, or is it scrollable?
- **Scroll** – If sheet is constrained, does the table area scroll?
- **Snap** – Does the sheet snap (e.g. half / full)?
- **Controls** – Are ReplayControls sticky at bottom of sheet?

**Documented rule:** ReplayContent should **not assume full-screen height**. **ReplaySurface must not use `flex: 1` on its root**; the container controls height. This prevents "why is the sheet overflowing" bugs. Let the container dictate size; ReplayContent/ReplaySurface layout must work inside constrained height.

---

## Entry points

- **Hand list** – "Replay Hand" opens ReplaySheet with `source={{ type: "handId", handId }}` (no route push).
- **Hand detail modal** – Optional: add "Replay" when hand has replay; same ReplaySheet, same source.
- **Full page** – `/replay/[handId]` remains a thin wrapper: shell + `<ReplayContent source={{ type: "handId", handId }} />`.

---

## Roadmap Phases

### Phase 1: ReplaySource, ReplayContent adapter, ReplaySurface, ReplaySheet

- Add **replay.types.ts** with `ReplaySource`, `ReplayContentProps`, `ReplaySurfaceProps` (sceneModel, controller, compact?).
- Add **ReplaySurface** – single shared renderer: TableLayout (same as in-game) + ReplayControls; **props: sceneModel, controller, compact?** (explicit contract; no provider internals).
- Add **ReplayFromRemoteSource** – uses `useHandReplayTableProvider(handId)`; loading/error/empty; extracts sceneModel + controller from provider; passes only those to ReplaySurface.
- Add **ReplayFromSnapshots** – uses `useReplayTableProviderFromSnapshots(snapshots: readonly TableSnapshotPayload[])` (new hook); extracts sceneModel + controller; passes only those to ReplaySurface.
- Add **ReplayContent** – thin adapter: `source.type === "handId"` → ReplayFromRemoteSource, else → ReplayFromSnapshots. No direct TableLayout.
- Add **useReplayTableProviderFromSnapshots(snapshots: readonly TableSnapshotPayload[])** – builds ReplayController + current snapshot from array; same ReplayTableProvider shape; no fetch; frozen array contract.
- Add **ReplaySheet** – props `visible`, `source: ReplaySource | null`, `onClose`. Renders `ReplayContent` with that source when visible. Container controls height; ReplaySurface must not use flex:1 on root.
- Refactor **app/replay/[handId].tsx** – thin wrapper: shell + `<ReplayContent source={{ type: "handId", handId }} />`.

**Deliverable:** ReplayContent accepts `ReplaySource`; ReplaySurface is the single table+controls renderer; ReplaySheet exists; full page is thin wrapper.

### Phase 2: Wire hand history to sheet (no full-page navigation)

- **History screen** – state `replaySource: ReplaySource | null`. On "Replay Hand": set `replaySource = { type: "handId", handId }`; do not push route.
- **HandList / HandListItem** – support `onReplayPress?.(handId)`. When set, use it; else fallback `router.push(\`/replay/${hand.id}\`)`.
- **History** – render `ReplaySheet visible={!!replaySource} source={replaySource} onClose={() => setReplaySource(null)}`.
- **HandDetailModal** (optional) – "Replay" when hand has replay; same ReplaySheet with same source.

**Deliverable:** "Replay Hand" opens ReplaySheet only. Full-page route still works for deep link.

### Phase 3: Reuse in other contexts (in-game, sharing)

- **In-game** – e.g. "Review last hand": container passes `source={{ type: "snapshots", snapshots: lastHandSnapshots, handId: lastHandId }}`. No new replay logic.
- **Sharing / embed** – same ReplayContent with `source={{ type: "handId", handId }}` or preloaded snapshots; container handles auth/public token.

**Deliverable:** New replay entry = choose source + container; no architectural churn.

---

## File Layout

```
apps/client/src/components/replay/
  replay.types.ts             ReplaySource, ReplayContentProps, ReplaySurfaceProps
  ReplayContent.tsx           Public API – thin adapter by source type
  ReplayFromRemoteSource.tsx  handId → fetch; loading/error/empty → ReplaySurface(sceneModel, controller)
  ReplayFromSnapshots.tsx     useReplayTableProviderFromSnapshots(readonly snapshots) → ReplaySurface
  ReplaySurface.tsx           Single shared: TableLayout + ReplayControls; props: sceneModel, controller, compact?
  ReplaySheet.tsx             Container: ModalSheet + ReplayContent; container controls height
  ReplayControls.tsx          (existing)
```

Engine hooks remain in `hooks/`: `useHandReplayTableProvider`, new `useReplayTableProviderFromSnapshots(snapshots: readonly TableSnapshotPayload[])`.

---

## useReplayTableProviderFromSnapshots (minimal sketch)

Same contract as existing provider: `ReplayTableProvider` (snapshot + onAction + sceneModel + replay). No fetch; snapshots are already in memory.

- **Input:** `snapshots: readonly TableSnapshotPayload[]` – frozen array to prevent accidental mutation and communicate immutability.
- State: `currentStep`, `isPlaying`, `speed` (same as handId hook).
- Current snapshot = `snapshots[currentStep]`.
- ReplayController: next/prev/goTo/play/pause/setSpeed; same shape.
- Build sceneModel from current snapshot with `canAct: false`, `showActions: false`.
- Return `{ provider: ReplayTableProvider, loading: false, error: null }` (no loading/error when snapshots are provided; empty array can be treated as error or empty state by ReplayFromSnapshots).

This keeps Engine (hooks) free of UI; Surface stays unique; ReplayContent stays a thin adapter.

---

## Modularity Checklist (Upgraded)

- [ ] **ReplayContent accepts future alternate data source** – Public API is `source: ReplaySource` (handId | snapshots), not only `handId`.
- [ ] **ReplayContent does not assume navigation context** – No router, no "where am I"; containers own navigation/sheet/page.
- [ ] **ReplayContent renders identical table layout to in-game** – TableLayout (HeroZone, OpponentStrip, DealerAnnounceBar) is the same; only ReplayControls are added. ReplaySurface is the single place that renders table + controls.
- [ ] **ReplayContent layout works inside constrained height** – Does not assume full-screen; container dictates size (sheet/page/overlay).
- [ ] **Full-page route is thin wrapper only** – Shell + `<ReplayContent source={{ type: "handId", handId }} />`; no inline replay logic.
- [ ] **ReplayContent never fetches unless told to** – handId path fetches via hook; snapshots path uses provided array. Containers decide source.

---

## Strategic Payoff (If Done Right)

With source-agnostic ReplayContent and Engine/Surface/Container split:

- **Sharing a replay** – Trivial (container + source).
- **Embedding replay in profile page** – Trivial.
- **Showing opponent perspective** – Trivial (different snapshot source or filter).
- **Coach review tool** – Trivial.
- **AI hand analyzer overlay** – Trivial.

If ReplayContent is coupled to handId or to the history sheet, all of the above become messy and require refactors.

---

## Acceptance Criteria (Phase 1–2)

- [ ] "Replay Hand" from hand history opens ReplaySheet, not a new page.
- [ ] ReplayContent accepts `ReplaySource` (handId or snapshots); Phase 1 implements handId path; snapshots path implemented in Phase 1 (hook + ReplayFromSnapshots) so architecture is ready.
- [ ] Replay table is the same TableLayout as in-game; only ReplayControls are added.
- [ ] ReplayContent does not assume full-screen height; works inside sheet.
- [ ] Full-page `/replay/[handId]` is thin wrapper using ReplayContent with `source={{ type: "handId", handId }}`.
- [ ] Hand detail modal can optionally show "Replay" and open same sheet (Phase 2).

---

## Design Principles (recap)

- **ReplayContent never fetches unless told to** – handId ⇒ fetch; snapshots ⇒ use as-is.
- **ReplayContent never knows where data came from** – Containers decide source.
- **Engine has zero UI** – Hooks return provider/controller only.
- **Surface has zero routing** – ReplaySurface only renders table + controls.
- **Container has zero replay logic** – Sheet/page/overlay only pass source and chrome.

---

## Conceptual Model (locked)

Only **SOURCE** changes. Everything else is stable.

```
SOURCE  →  ENGINE  →  SURFACE  →  CONTAINER
(handId | snapshots)
```

- **SOURCE** – handId (fetch) or snapshots (preloaded); future: handRef/tableId/handNumber.
- **ENGINE** – Hooks; no UI.
- **SURFACE** – sceneModel + controller → TableLayout + ReplayControls; no routing.
- **CONTAINER** – Sheet / page / overlay; passes source and chrome; no replay logic.

---

## Risk Assessment

**Low.** This refactor does **not** touch:

- ReplayController internals
- TableLayout
- Game scene model

It only re-houses **where composition occurs** (Content → FromRemoteSource/FromSnapshots → Surface). Safe refactor territory. Phase 1 can proceed as documented.

---

## References

- `docs/roadmaps/HAND_REPLAYER_ROADMAP.md` – Original replayer scope and data (snapshots, backend).
- `docs/reference/HAND_HISTORY_REPLAY_SYSTEM.md` – Backend snapshot capture, API, ReplayController/ReplayTableProvider.
- `docs/analysis/HAND_REPLAYER_GENERATION_ANALYSIS.md` – When replay data is generated and how `hasReplay` is set.
- Existing: `useHandReplayTableProvider`, `ReplayControls`, `TableLayout`, `ModalSheet`, `history.service.getHandDetail`.
