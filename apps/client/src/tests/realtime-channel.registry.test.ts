import { describe, expect, it, vi } from "vitest";
import { dispatchRealtimeChannelMessage } from "@/registry/realtime-channel.registry";

describe("realtime channel registry dispatch", () => {
  it("routes valid lobby message to handler", () => {
    const onTableList = vi.fn();
    dispatchRealtimeChannelMessage("lobby", "TABLE_LIST", { tables: [{ id: "t1" }] }, { onTableList });
    expect(onTableList).toHaveBeenCalledTimes(1);
    expect(onTableList).toHaveBeenCalledWith([{ id: "t1" }]);
  });

  it("rejects invalid payload and reports error", () => {
    const onError = vi.fn();
    const onTableList = vi.fn();
    dispatchRealtimeChannelMessage("lobby", "TABLE_LIST", { bad: true }, { onError, onTableList });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("INVALID_REALTIME_MESSAGE");
    expect(onTableList).not.toHaveBeenCalled();
  });
});
