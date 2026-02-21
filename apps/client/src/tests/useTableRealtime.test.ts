import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { handleTableRealtimeInboundMessage } from "@/realtime/tableRealtime.message";
import { useMultiTableStore } from "@/stores/multitable.store";
import { useTableStore } from "@/stores/table.store";

function makeSnapshot(seq: number, tableId = "t1"): TableSnapshotPayload {
  return {
    version: 1,
    snapshotId: `snap_${seq}`,
    snapshotSeq: seq,
    emittedAtTs: Date.now(),
    serverTimeTs: Date.now(),
    stateHash: `hash_${seq}`,
    reason: "ACTION_ACCEPTED",
    table: {
      tableId,
      tableName: "Table",
      visibility: "PUBLIC",
      maxSeats: 6,
      smallBlindCents: 50,
      bigBlindCents: 100,
      minBuyInCents: 1000,
      maxBuyInCents: 10000,
    },
    hand: {
      handId: "h1",
      handNumber: 1,
      street: "PREFLOP",
      dealerSeat: 0,
      sbSeat: 1,
      bbSeat: 2,
      toActSeat: 3,
      actionCount: 1,
      roundCurrentBetCents: 100,
      minRaiseCents: 100,
      potCents: 150,
      board: [],
    },
    seats: [
      {
        seat: 0,
        occupied: true,
        userId: "u1",
        name: "Hero",
        status: "ACTIVE",
        stackCents: 2500,
        roundBetCents: 0,
        committedCents: 0,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: true,
        isToAct: false,
        isBot: false,
      },
      {
        seat: 1,
        occupied: true,
        userId: "u2",
        name: "Villain",
        status: "ACTIVE",
        stackCents: 2500,
        roundBetCents: 0,
        committedCents: 0,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: false,
        isToAct: true,
        isBot: false,
      },
    ],
    hero: {
      userId: "u1",
      youAreSeated: true,
      seat: 0,
    },
  };
}

function dispatchTableMessage(tableId: string, type: string, payload: unknown) {
  handleTableRealtimeInboundMessage({
    tableId,
    type,
    payload,
    deps: {
      setRoomForTable: (t, roomId) => useMultiTableStore.getState().setRoomForTable(t, roomId),
      resetSnapshotStream: (t) => useTableStore.getState().resetSnapshotStream(t),
      setSnapshot: (t, snapshot) => useTableStore.getState().setSnapshot(t, snapshot),
      appendChatMessage: (t, msg) => useTableStore.getState().appendChatMessage(t, msg),
      setConnectionStatus: (t, status) => useTableStore.getState().setConnectionStatus(t, status),
      clearConnectionStatus: (t) => useTableStore.getState().clearConnectionStatus(t),
      setError: (t, message) => useTableStore.getState().setError(t, message),
      onError: undefined,
      debugLog: vi.fn(),
    },
  });
}

describe("useTableRealtime behavior", () => {
  beforeEach(() => {
    useTableStore.setState({
      snapshotsByTableId: {},
      chatMessagesByTableId: {},
      lastSeqByTableId: {},
      connectionStatusByTableId: {},
      statusByTableId: {},
      errorByTableId: {},
    });
    useMultiTableStore.getState().closeAll();
  });

  it("TABLE_SNAPSHOT updates snapshot store", () => {
    const snap = makeSnapshot(1);
    dispatchTableMessage("t1", "TABLE_SNAPSHOT", snap);

    expect(useTableStore.getState().snapshotsByTableId["t1"]).toEqual(snap);
    expect(useTableStore.getState().lastSeqByTableId["t1"]).toBe(1);
  });

  it("WELCOME NEW + seq=1 replaces stale snapshot stream", () => {
    dispatchTableMessage("t1", "TABLE_SNAPSHOT", makeSnapshot(5));
    expect(useTableStore.getState().lastSeqByTableId["t1"]).toBe(5);

    dispatchTableMessage("t1", "WELCOME", {
      version: 1,
      roomId: "room_new",
      playerId: "u1",
      tableId: "t1",
      joinMode: "NEW",
    });
    dispatchTableMessage("t1", "TABLE_SNAPSHOT", makeSnapshot(1));

    expect(useTableStore.getState().lastSeqByTableId["t1"]).toBe(1);
    expect(useTableStore.getState().snapshotsByTableId["t1"]?.snapshotSeq).toBe(1);
  });

  it("ignores stale snapshot sequence", () => {
    dispatchTableMessage("t1", "TABLE_SNAPSHOT", makeSnapshot(3));
    dispatchTableMessage("t1", "TABLE_SNAPSHOT", makeSnapshot(2));

    expect(useTableStore.getState().lastSeqByTableId["t1"]).toBe(3);
    expect(useTableStore.getState().snapshotsByTableId["t1"]?.snapshotSeq).toBe(3);
  });

  it("maps reconnect lifecycle to RECONNECTING then CONNECTED", () => {
    dispatchTableMessage("t1", "RECONNECTING", undefined);
    expect(useTableStore.getState().connectionStatusByTableId["t1"]).toBe("RECONNECTING");

    dispatchTableMessage("t1", "CONNECTED", undefined);
    expect(useTableStore.getState().connectionStatusByTableId["t1"]).toBe("CONNECTED");
  });

  it("clears connection status on DISCONNECTED", () => {
    dispatchTableMessage("t1", "CONNECTED", undefined);
    expect(useTableStore.getState().connectionStatusByTableId["t1"]).toBe("CONNECTED");

    dispatchTableMessage("t1", "DISCONNECTED", undefined);
    expect(useTableStore.getState().connectionStatusByTableId["t1"]).toBeUndefined();
  });
});
