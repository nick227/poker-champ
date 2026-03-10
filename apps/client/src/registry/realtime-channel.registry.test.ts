import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { dispatchRealtimeChannelMessage } from "@/registry/realtime-channel.registry";
import { useTableStore } from "@/features/table/stores/table.store";

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
    hero: {
      userId: "u1",
      youAreSeated: false,
    },
    seats: [
      {
        seat: 0,
        occupied: true,
        userId: "u1",
        name: "Hero",
        status: "ACTIVE",
        stackCents: 2000,
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
        stackCents: 2000,
        roundBetCents: 0,
        committedCents: 0,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: false,
        isToAct: true,
        isBot: false,
      },
    ],
  };
}

describe("realtime channel registry dispatch", () => {
  beforeEach(() => {
    useTableStore.setState({
      snapshotsByTableId: {},
      chatMessagesByTableId: {},
      lastSeqByTableId: {},
      connectionStatusByTableId: {},
      statusByTableId: {},
      errorByTableId: {},
    });
  });

  it("routes TABLE_SNAPSHOT to context snapshot handler", () => {
    const onSnapshot = vi.fn();
    const snapshot = makeSnapshot(1);

    dispatchRealtimeChannelMessage("table", "TABLE_SNAPSHOT", snapshot, {
      tableId: "t1",
      onSnapshot,
      onError: vi.fn(),
      setStatus: vi.fn(),
    });

    expect(onSnapshot).toHaveBeenCalledWith("t1", snapshot);
  });

  it("routes lifecycle status events to context setStatus", () => {
    const setStatus = vi.fn();

    dispatchRealtimeChannelMessage("table", "RECONNECTING", undefined, {
      tableId: "t1",
      onSnapshot: vi.fn(),
      onError: vi.fn(),
      setStatus,
    });
    dispatchRealtimeChannelMessage("table", "CONNECTED", undefined, {
      tableId: "t1",
      onSnapshot: vi.fn(),
      onError: vi.fn(),
      setStatus,
    });

    expect(setStatus).toHaveBeenNthCalledWith(1, "RECONNECTING");
    expect(setStatus).toHaveBeenNthCalledWith(2, "CONNECTED");
  });

  it("stores valid CHAT_MESSAGE through registry store integration", () => {
    const message = {
      id: "m1",
      tableId: "t1",
      senderUserId: "u2",
      senderName: "Villain",
      text: "hi",
      createdAtTs: Date.now(),
    };

    dispatchRealtimeChannelMessage("table", "CHAT_MESSAGE", message, {
      tableId: "t1",
      appendChatMessage: (tableId, chat) => useTableStore.getState().appendChatMessage(tableId, chat),
      onSnapshot: vi.fn(),
      onError: vi.fn(),
      setStatus: vi.fn(),
    });

    const list = useTableStore.getState().chatMessagesByTableId["t1"];
    expect(list).toHaveLength(1);
    expect(list?.[0]?.id).toBe("m1");
  });

  it("routes BOTS_LIST through context callback", () => {
    const onBotsList = vi.fn();
    const bots = [{ id: "nash_nate", name: "Nash Nate" }];

    dispatchRealtimeChannelMessage("table", "BOTS_LIST", { bots }, {
      tableId: "t1",
      onBotsList,
      onSnapshot: vi.fn(),
      onError: vi.fn(),
      setStatus: vi.fn(),
    });

    expect(onBotsList).toHaveBeenCalledWith("t1", bots);
  });

  it("rejects invalid payload and surfaces INVALID_REALTIME_MESSAGE", () => {
    const onError = vi.fn();

    dispatchRealtimeChannelMessage("table", "TABLE_SNAPSHOT", { bad: true }, {
      tableId: "t1",
      onSnapshot: vi.fn(),
      onError,
      setStatus: vi.fn(),
    });

    expect(onError).toHaveBeenCalledWith("INVALID_REALTIME_MESSAGE");
  });
});

