# Game Stream Process Analysis

## Scope
This document describes the current live game stream flow from server emit to client render, plus replay persistence hooks and known failure modes.

Date: 2026-02-19

## 1) Contract Surface (Single Source of Truth)
- `packages/realtime-contract/src/table.ts`
- Outbound table stream message types:
  - `WELCOME`
  - `SESSION_RESTORED`
  - `TABLE_SNAPSHOT`
  - `ERROR`
  - `CHAT_MESSAGE`
- `TABLE_SNAPSHOT` carries:
  - `snapshotId`
  - `snapshotSeq` (positive int)
  - `reason` (`HAND_START`, `ACTION_ACCEPTED`, `BOT_ACTION`, `RUNOUT_STAGE`, `HAND_SHOWDOWN`, `HAND_END`, etc.)
  - full table/hand/seats/hero payload

## 2) Server Stream Pipeline

### Room + Dealer Wiring
- `PokerRoom` builds `Dealer` on room create.
- Dealer callback `onTableSnapshotEmitted` is wired to snapshot log persistence when feature flag is enabled.
- File path: `src/rooms/PokerRoom.ts`

### Snapshot Emission
- `Dealer` delegates emits to `SnapshotService`.
- `SnapshotService` holds in-memory `snapshotSeq` counter and increments on every emit call.
- `emitToAll(reason, actionId)`:
  - increments sequence once
  - builds canonical SYSTEM payload for persistence hook
  - builds per-user payloads and sends to all bound clients
- File path: `src/engine/dealer/services/SnapshotService.ts`

### Hand Lifecycle Reasons
- Emission reasons are driven by lifecycle/action services:
  - `HAND_START`
  - `ACTION_ACCEPTED` / `BOT_ACTION`
  - `RUNOUT_STAGE` / `AUTO_TRANSITION`
  - `HAND_SHOWDOWN`
  - `HAND_END`
- Files:
  - `src/engine/Dealer.ts`
  - `src/engine/dealer/services/HandLifecycleService.ts`

## 3) Client Stream Pipeline

### Transport Session
- `useRealtimeChannel` establishes `colyseus` (default) or `ws`.
- For table scope, it will not start until auth is hydrated + token exists.
- File: `apps/client/src/realtime/useRealtimeChannel.ts`

### Table Realtime Hook
- `useTableRealtime` receives inbound messages, logs diagnostics, and dispatches to registry handlers.
- On `WELCOME` with `joinMode === "NEW"`:
  - resets local snapshot stream cursor/state for that table.
- File: `apps/client/src/realtime/useTableRealtime.ts`

### Message Dispatch
- `dispatchRealtimeChannelMessage("table", ...)` validates outbound contract shape before handling.
- `TABLE_SNAPSHOT` handler calls store `setSnapshot(tableId, snapshot)`.
- File: `apps/client/src/registry/realtime-channel.registry.ts`

### Store Sequencing Gate
- `table.store` keeps `lastSeqByTableId`.
- Normal rule: drop snapshots with `snapshotSeq <= lastSeq`.
- Stream restart guard: if incoming seq is `1` after `lastSeq > 1`, accept it as restart and reset cursor.
- File: `apps/client/src/stores/table.store.ts`

## 4) Replay/Persistence Path

### Live Snapshot Logging
- `PokerRoom -> TableSnapshotLogService.writeSnapshot(...)`
- Includes payload byte cap + sample rate + idempotency and foreign key fallbacks.
- File: `src/engine/persistence/TableSnapshotLogService.ts`

### Replay Frame Read
- `ReplayFrameService.getFramesForHand(handId)` reads from `TableSnapshotLog`.
- Filters to canonical SYSTEM perspective and valid replay frame reasons.
- Used by hand history detail endpoint.
- Files:
  - `src/engine/persistence/ReplayFrameService.ts`
  - `src/http/HandHistoryRouter.ts`

## 5) Current Sequencing Semantics
- `snapshotSeq` is monotonic for the lifetime of a dealer process (not per-hand).
- On process/stream restart, sequence can restart at `1`.
- Client-side dedupe/order assumes monotonic progression per active stream.

## 6) Regression Class Observed (Root Cause)
- Symptom: table UI stuck at "Waiting for hand - CONNECTED".
- Observed logs:
  - inbound `HAND_START` with `snapshotSeq: 1`
  - store drops snapshot: `seq 1 <= last 3`
- Cause:
  - stale `lastSeqByTableId` survived into a fresh stream.
  - new stream started at `1`, so all fresh snapshots were rejected as stale.
- Mitigation now in place:
  - explicit reset on `WELCOME joinMode=NEW`
  - defensive acceptance of `seq=1` restart in store

## 7) Known Operational Risks
- Sequence continuity depends on in-memory counter (no persisted epoch/stream id).
- `emitToUser` increments sequence independently; if used heavily, it can advance cursor outside normal table cadence.
- Transport reconnect races can reorder late/stale events (partially mitigated by seq gate).
- If contract validation fails in dispatch, message is dropped and surfaced as `INVALID_REALTIME_MESSAGE`.

## 8) Recommended Next Hardening
1. Add `streamId` (or `snapshotEpoch`) to `TABLE_SNAPSHOT` so restarts are explicit, not inferred from seq=1.
2. Keep `snapshotSeq` strictly table-stream scoped and document `emitToUser` expectations.
3. Add an integration test for: stale cursor + new join (`WELCOME NEW`) + first hand snapshot acceptance.
4. Add lightweight server/client metric counters:
   - accepted snapshots
   - dropped snapshots
   - restart-resets applied

## 9) Quick Debug Checklist
1. Confirm `TABLE_SNAPSHOT` is inbound with expected `reason`, `handId`, `snapshotSeq`.
2. Check store warnings for dropped snapshots.
3. Verify `WELCOME` payload includes `joinMode`.
4. Verify table connection status transitions: `RECONNECTING -> CONNECTED`.
5. If replay issue: verify `TableSnapshotLog` rows exist for hand and are SYSTEM frames.
