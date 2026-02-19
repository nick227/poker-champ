import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMultiTableStore } from "../stores/multitable.store";

const TTL_MS = 24 * 60 * 60 * 1000;

describe("multi-table metadata persistence", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const localStorageRef = (globalThis as { localStorage?: Storage }).localStorage;
    if (localStorageRef) {
      localStorageRef.removeItem("multitable-store");
    }
    useMultiTableStore.setState({
      openTableIds: [],
      activeTableId: null,
      tableSenders: {},
      tableJoinById: {},
      roomIdByTableId: {},
      lastBuyInCentsByTableId: {},
      tableMetaUpdatedAt: {},
    });
  });

  it("persists roomId per table", () => {
    useMultiTableStore.getState().setRoomForTable("t1", "room_1");
    expect(useMultiTableStore.getState().roomIdByTableId.t1).toBe("room_1");
  });

  it("persists lastBuyInCents per table", () => {
    useMultiTableStore.getState().setLastBuyIn("t1", 5000);
    expect(useMultiTableStore.getState().lastBuyInCentsByTableId.t1).toBe(5000);
  });

  it("updates timestamp when metadata is written", () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1000);
    useMultiTableStore.getState().setRoomForTable("t1", "room_1");
    const first = useMultiTableStore.getState().tableMetaUpdatedAt.t1;

    vi.spyOn(Date, "now").mockReturnValueOnce(2000);
    useMultiTableStore.getState().setLastBuyIn("t1", 6000);
    const second = useMultiTableStore.getState().tableMetaUpdatedAt.t1;

    expect(first).toBe(1000);
    expect(second).toBe(2000);
  });

  it("ttl prune removes expired entries", () => {
    useMultiTableStore.setState({
      roomIdByTableId: { old: "room_old" },
      lastBuyInCentsByTableId: { old: 3000 },
      tableMetaUpdatedAt: { old: 1000 },
    });

    vi.spyOn(Date, "now").mockReturnValue(1000 + TTL_MS + 1);
    useMultiTableStore.getState().pruneExpiredTables();

    const state = useMultiTableStore.getState();
    expect(state.roomIdByTableId.old).toBeUndefined();
    expect(state.lastBuyInCentsByTableId.old).toBeUndefined();
    expect(state.tableMetaUpdatedAt.old).toBeUndefined();
  });

  it("ttl prune keeps fresh entries", () => {
    useMultiTableStore.setState({
      roomIdByTableId: { fresh: "room_fresh" },
      lastBuyInCentsByTableId: { fresh: 4500 },
      tableMetaUpdatedAt: { fresh: 1000 },
    });

    vi.spyOn(Date, "now").mockReturnValue(1000 + TTL_MS - 1);
    useMultiTableStore.getState().pruneExpiredTables();

    const state = useMultiTableStore.getState();
    expect(state.roomIdByTableId.fresh).toBe("room_fresh");
    expect(state.lastBuyInCentsByTableId.fresh).toBe(4500);
    expect(state.tableMetaUpdatedAt.fresh).toBe(1000);
  });
});
