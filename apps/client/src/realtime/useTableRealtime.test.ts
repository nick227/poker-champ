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
      showStats: true,
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

function dispatchTableMessage(
  tableId: string,
  type: string,
  payload: unknown,
  overrides?: {
    onTableGone?: (tableId: string) => void;
    onError?: (message: string) => void;
  },
) {
  handleTableRealtimeInboundMessage({
    tableId,
    type,
    payload,
    deps: {
      setRoomForTable: (t, roomId) => useMultiTableStore.getState().setRoomForTable(t, roomId),
      resetSnapshotStream: (t) => useTableStore.getState().resetSnapshotStream(t),
      setSnapshot: (t, snapshot) => useTableStore.getState().setSnapshot(t, snapshot),
      appendChatMessage: (t, msg) => useTableStore.getState().appendChatMessage(t, msg),
      setBotSummaries: (t, bots) => useTableStore.getState().setBotSummaries(t, bots),
      setConnectionStatus: (t, status) => useTableStore.getState().setConnectionStatus(t, status),
      clearConnectionStatus: (t) => useTableStore.getState().clearConnectionStatus(t),
      setActiveSessionId: (t, sessionId) => useTableStore.getState().setActiveSessionId(t, sessionId),
      getActiveSessionId: (t) => useTableStore.getState().getActiveSessionId(t),
      clearActiveSessionId: (t) => useTableStore.getState().clearActiveSessionId(t),
      setError: (t, message) => useTableStore.getState().setError(t, message),
      onError: overrides?.onError,
      onTableGone: overrides?.onTableGone,
      debugLog: vi.fn(),
    },
  });
}

describe("useTableRealtime behavior", () => {
  beforeEach(() => {
    useTableStore.setState({
      snapshotsByTableId: {},
      chatMessagesByTableId: {},
      botSummariesByTableId: {},
      lastSeqByTableId: {},
      connectionStatusByTableId: {},
      activeSessionIdByTableId: {},
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

  it("SESSION_RESTORED resets cursor so post-restore snapshots are accepted", () => {
    dispatchTableMessage("t1", "TABLE_SNAPSHOT", makeSnapshot(5));
    expect(useTableStore.getState().lastSeqByTableId["t1"]).toBe(5);

    dispatchTableMessage("t1", "SESSION_RESTORED", {
      userId: "u1",
      deadlineTs: 0,
      joinMode: "RESTORE",
    });
    dispatchTableMessage("t1", "TABLE_SNAPSHOT", makeSnapshot(4));

    expect(useTableStore.getState().lastSeqByTableId["t1"]).toBe(4);
    expect(useTableStore.getState().snapshotsByTableId["t1"]?.snapshotSeq).toBe(4);
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

  it("routes TABLE_GONE to onTableGone callback without setting table error", () => {
    const onTableGone = vi.fn();
    dispatchTableMessage("t1", "ERROR", { code: "TABLE_GONE", message: "Table no longer exists" }, { onTableGone });
    expect(onTableGone).toHaveBeenCalledWith("t1");
    expect(useTableStore.getState().errorByTableId["t1"]).toBeUndefined();
  });

  it("keeps CONNECTED when DISCONNECTED is from a stale session (session scoping)", () => {
    const tableId = "t1";
    dispatchTableMessage(tableId, "CONNECTED", { sessionId: "sessionB" });
    expect(useTableStore.getState().connectionStatusByTableId[tableId]).toBe("CONNECTED");
    expect(useTableStore.getState().getActiveSessionId(tableId)).toBe("sessionB");

    dispatchTableMessage(tableId, "DISCONNECTED", { sessionId: "sessionA" });
    expect(useTableStore.getState().connectionStatusByTableId[tableId]).toBe("CONNECTED");
    expect(useTableStore.getState().getActiveSessionId(tableId)).toBe("sessionB");
  });

  it("stale DISCONNECTED then TABLE_SNAPSHOT leaves status CONNECTED (healing path)", () => {
    const tableId = "t1";
    dispatchTableMessage(tableId, "CONNECTED", { sessionId: "sessionB" });
    dispatchTableMessage(tableId, "DISCONNECTED", { sessionId: "sessionA" });
    dispatchTableMessage(tableId, "TABLE_SNAPSHOT", makeSnapshot(1, tableId));

    expect(useTableStore.getState().connectionStatusByTableId[tableId]).toBe("CONNECTED");
  });

  describe("rapid reconnect and session ownership stress", () => {
    const tableId = "t1";

    it("rapid CONNECTED sequence: only last session owns; stale DISCONNECTEDs ignored", () => {
      dispatchTableMessage(tableId, "CONNECTED", { sessionId: "s1" });
      dispatchTableMessage(tableId, "CONNECTED", { sessionId: "s2" });
      dispatchTableMessage(tableId, "CONNECTED", { sessionId: "s3" });

      expect(useTableStore.getState().connectionStatusByTableId[tableId]).toBe("CONNECTED");
      expect(useTableStore.getState().getActiveSessionId(tableId)).toBe("s3");

      dispatchTableMessage(tableId, "DISCONNECTED", { sessionId: "s1" });
      dispatchTableMessage(tableId, "DISCONNECTED", { sessionId: "s2" });
      expect(useTableStore.getState().connectionStatusByTableId[tableId]).toBe("CONNECTED");
      expect(useTableStore.getState().getActiveSessionId(tableId)).toBe("s3");

      dispatchTableMessage(tableId, "DISCONNECTED", { sessionId: "s3" });
      expect(useTableStore.getState().connectionStatusByTableId[tableId]).toBeUndefined();
      expect(useTableStore.getState().getActiveSessionId(tableId)).toBeUndefined();
    });

    it("rapid loop: CONNECTED → real DISCONNECTED → CONNECTED; stale DISCONNECTED then TABLE_SNAPSHOT", () => {
      dispatchTableMessage(tableId, "CONNECTED", { sessionId: "s1" });
      dispatchTableMessage(tableId, "DISCONNECTED", { sessionId: "s1" });
      expect(useTableStore.getState().connectionStatusByTableId[tableId]).toBeUndefined();

      dispatchTableMessage(tableId, "CONNECTED", { sessionId: "s2" });
      dispatchTableMessage(tableId, "DISCONNECTED", { sessionId: "s1" });
      dispatchTableMessage(tableId, "TABLE_SNAPSHOT", makeSnapshot(1, tableId));

      expect(useTableStore.getState().connectionStatusByTableId[tableId]).toBe("CONNECTED");
      expect(useTableStore.getState().getActiveSessionId(tableId)).toBe("s2");
    });

    it("many CONNECTED then only matching DISCONNECTED clears", () => {
      for (let i = 1; i <= 10; i++) {
        dispatchTableMessage(tableId, "CONNECTED", { sessionId: `s${i}` });
      }
      expect(useTableStore.getState().getActiveSessionId(tableId)).toBe("s10");

      for (let i = 1; i <= 9; i++) {
        dispatchTableMessage(tableId, "DISCONNECTED", { sessionId: `s${i}` });
      }
      expect(useTableStore.getState().connectionStatusByTableId[tableId]).toBe("CONNECTED");
      expect(useTableStore.getState().getActiveSessionId(tableId)).toBe("s10");

      dispatchTableMessage(tableId, "DISCONNECTED", { sessionId: "s10" });
      expect(useTableStore.getState().connectionStatusByTableId[tableId]).toBeUndefined();
      expect(useTableStore.getState().getActiveSessionId(tableId)).toBeUndefined();
    });

    it("interleaved CONNECTED, DISCONNECTED, TABLE_SNAPSHOT: final owner wins and healing holds", () => {
      dispatchTableMessage(tableId, "CONNECTED", { sessionId: "sA" });
      dispatchTableMessage(tableId, "TABLE_SNAPSHOT", makeSnapshot(1, tableId));
      dispatchTableMessage(tableId, "CONNECTED", { sessionId: "sB" });
      dispatchTableMessage(tableId, "DISCONNECTED", { sessionId: "sA" });
      dispatchTableMessage(tableId, "TABLE_SNAPSHOT", makeSnapshot(2, tableId));
      dispatchTableMessage(tableId, "CONNECTED", { sessionId: "sC" });
      dispatchTableMessage(tableId, "DISCONNECTED", { sessionId: "sA" });
      dispatchTableMessage(tableId, "DISCONNECTED", { sessionId: "sB" });

      expect(useTableStore.getState().connectionStatusByTableId[tableId]).toBe("CONNECTED");
      expect(useTableStore.getState().getActiveSessionId(tableId)).toBe("sC");
      expect(useTableStore.getState().snapshotsByTableId[tableId]?.snapshotSeq).toBe(2);

      dispatchTableMessage(tableId, "DISCONNECTED", { sessionId: "sC" });
      expect(useTableStore.getState().connectionStatusByTableId[tableId]).toBeUndefined();
    });

    it("DISCONNECTED without sessionId clears (real disconnect)", () => {
      dispatchTableMessage(tableId, "CONNECTED", { sessionId: "s1" });
      dispatchTableMessage(tableId, "DISCONNECTED", undefined);
      expect(useTableStore.getState().connectionStatusByTableId[tableId]).toBeUndefined();
      expect(useTableStore.getState().getActiveSessionId(tableId)).toBeUndefined();
    });
  });
});
