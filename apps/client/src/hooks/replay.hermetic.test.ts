/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { useReplayTableProviderFromSnapshots } from "@/hooks/useReplayTableProviderFromSnapshots";
import { useMultiTableStore } from "@/features/table/stores/multitable.store";
import { useTableStore } from "@/features/table/stores/table.store";
import { useLobbyStore } from "@/features/lobby/stores/lobby.store";

function makeSnapshot(seq: number): TableSnapshotPayload {
  return {
    version: 1,
    snapshotId: `snap_${seq}`,
    snapshotSeq: seq,
    emittedAtTs: Date.now() + seq,
    serverTimeTs: Date.now() + seq,
    stateHash: `hash_${seq}`,
    reason: "ACTION_ACCEPTED",
    table: {
      tableId: "replay_table",
      tableName: "Replay Table",
      visibility: "PUBLIC",
      maxSeats: 6,
      smallBlindCents: 50,
      bigBlindCents: 100,
      minBuyInCents: 1000,
      maxBuyInCents: 10000,
      showStats: true,
    },
    seats: [
      {
        seat: 0,
        occupied: true,
        userId: "hero",
        name: "Hero",
        stackCents: 2000,
        roundBetCents: 0,
        committedCents: 0,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: false,
        status: "ACTIVE",
        isToAct: false,
        isBot: false,
      },
    ],
    hero: {
      userId: "hero",
      youAreSeated: true,
      seat: 0,
    },
    hand: {
      handId: "replay_hand",
      handNumber: 1,
      street: "PREFLOP",
      board: [],
      potCents: 150,
      dealerSeat: 0,
      sbSeat: 0,
      bbSeat: 1,
      toActSeat: 0,
      actionCount: seq,
      roundCurrentBetCents: 0,
      minRaiseCents: 0,
    },
  };
}

describe("replay hermetic behavior", () => {
  beforeEach(() => {
    useTableStore.setState({
      snapshotsByTableId: {},
      chatMessagesByTableId: {},
      botSummariesByTableId: {},
      botSummariesUpdatedAtByTableId: {},
      lastSeqByTableId: {},
      connectionStatusByTableId: {},
      activeSessionIdByTableId: {},
      statusByTableId: {},
      errorByTableId: {},
    });
    useMultiTableStore.getState().closeAll();
    useLobbyStore.setState({
      tables: [],
      onlineTotal: 0,
      onlinePlayers: [],
      onlineBusy: false,
      onlineError: null,
      busy: false,
      error: null,
      transportState: "DISCONNECTED",
      lobbyVoiceParticipantIds: [],
      lobbyVoiceServerNowTs: null,
      chatMessages: [],
      chatScope: "lobby",
      chatNextCursor: null,
      chatHasMore: false,
      chatLoading: false,
      chatLoadingMore: false,
      chatLoaded: false,
      chatError: null,
    });
  });

  it("does not emit live table actions during replay controls", () => {
    const sender = vi.fn(() => true);
    useMultiTableStore.getState().registerTableSender("live-table-1", sender);

    const { result } = renderHook(() =>
      useReplayTableProviderFromSnapshots([makeSnapshot(1), makeSnapshot(2), makeSnapshot(3)]),
    );

    act(() => {
      result.current.provider?.replay.next();
      result.current.provider?.replay.prev();
      result.current.provider?.replay.goTo(2);
      result.current.provider?.replay.play();
      result.current.provider?.replay.pause();
    });

    expect(sender).not.toHaveBeenCalled();
  });

  it("does not mutate live table/lobby store state when scrubbing replay", () => {
    useTableStore.setState({
      snapshotsByTableId: { "live-table-1": makeSnapshot(10) },
      lastSeqByTableId: { "live-table-1": 10 },
      connectionStatusByTableId: { "live-table-1": "CONNECTED" },
    });
    useMultiTableStore.setState({
      openTableIds: ["live-table-1"],
      activeTableId: "live-table-1",
      roomIdByTableId: { "live-table-1": "room-1" },
    });
    useLobbyStore.setState({
      tables: [{ tableId: "live-table-1" }],
      onlineTotal: 3,
      transportState: "CONNECTED",
    });

    const beforeTableStore = {
      snapshotsByTableId: useTableStore.getState().snapshotsByTableId,
      lastSeqByTableId: useTableStore.getState().lastSeqByTableId,
      connectionStatusByTableId: useTableStore.getState().connectionStatusByTableId,
    };
    const beforeMultiTableStore = {
      openTableIds: useMultiTableStore.getState().openTableIds,
      activeTableId: useMultiTableStore.getState().activeTableId,
      roomIdByTableId: useMultiTableStore.getState().roomIdByTableId,
    };
    const beforeLobbyStore = {
      tables: useLobbyStore.getState().tables,
      onlineTotal: useLobbyStore.getState().onlineTotal,
      transportState: useLobbyStore.getState().transportState,
    };

    const { result } = renderHook(() =>
      useReplayTableProviderFromSnapshots([makeSnapshot(1), makeSnapshot(2), makeSnapshot(3)]),
    );

    act(() => {
      result.current.provider?.replay.next();
      result.current.provider?.replay.goTo(2);
      result.current.provider?.replay.prev();
    });

    expect({
      snapshotsByTableId: useTableStore.getState().snapshotsByTableId,
      lastSeqByTableId: useTableStore.getState().lastSeqByTableId,
      connectionStatusByTableId: useTableStore.getState().connectionStatusByTableId,
    }).toEqual(beforeTableStore);
    expect({
      openTableIds: useMultiTableStore.getState().openTableIds,
      activeTableId: useMultiTableStore.getState().activeTableId,
      roomIdByTableId: useMultiTableStore.getState().roomIdByTableId,
    }).toEqual(beforeMultiTableStore);
    expect({
      tables: useLobbyStore.getState().tables,
      onlineTotal: useLobbyStore.getState().onlineTotal,
      transportState: useLobbyStore.getState().transportState,
    }).toEqual(beforeLobbyStore);
  });
});

