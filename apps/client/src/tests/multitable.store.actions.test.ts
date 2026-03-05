import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TableAction } from "@poker-champ/realtime-contract";
import { useMultiTableStore } from "@/stores/multitable.store";

describe("multi-table action idempotency payloads", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useMultiTableStore.setState({
      openTableIds: [],
      activeTableId: null,
      tableSenders: {},
      pendingActionByTableId: {},
      tableJoinById: {},
      roomIdByTableId: {},
      lastBuyInCentsByTableId: {},
      tableMetaUpdatedAt: {},
    });
  });

  it("drops invalid retry payloads that are missing actionId", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const sender = vi.fn(() => true);
    useMultiTableStore.getState().registerTableSender("t1", sender);

    useMultiTableStore.setState({
      pendingActionByTableId: {
        t1: {
          actionId: "",
          payload: { action: "CHECK" as TableAction } as { actionId: string; action: TableAction },
          retriesLeft: 1,
        },
      },
    });

    useMultiTableStore.getState().scheduleActionRetry("t1", 1);
    vi.advanceTimersByTime(1000);

    expect(sender).not.toHaveBeenCalled();
    expect(useMultiTableStore.getState().pendingActionByTableId.t1).toBeUndefined();

    vi.useRealTimers();
  });

  it("dispatches SET_SITTING_OUT with validated payload", () => {
    const sender = vi.fn(() => true);
    useMultiTableStore.getState().registerTableSender("t1", sender);

    const ok = useMultiTableStore.getState().dispatchSetSittingOut({
      tableId: "t1",
      sittingOut: true,
    });

    expect(ok).toBe(true);
    expect(sender).toHaveBeenCalledWith("SET_SITTING_OUT", { sittingOut: true });
  });

  it("dispatches REJOIN with validated payload", () => {
    const sender = vi.fn(() => true);
    useMultiTableStore.getState().registerTableSender("t1", sender);

    const ok = useMultiTableStore.getState().dispatchRejoin({ tableId: "t1" });

    expect(ok).toBe(true);
    expect(sender).toHaveBeenCalledWith("REJOIN", {});
  });
});
