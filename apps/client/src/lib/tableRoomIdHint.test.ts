import { beforeEach, describe, expect, it, vi } from "vitest";
import { seedTableRoomIdHint, syncTableRoomIdFromProp } from "@/lib/tableRoomIdHint";

describe("seedTableRoomIdHint", () => {
  it("persists roomId when provided", () => {
    const setRoomForTable = vi.fn();
    seedTableRoomIdHint("t1", "room-a", setRoomForTable);
    expect(setRoomForTable).toHaveBeenCalledWith("t1", "room-a");
  });

  it("skips empty or whitespace roomId", () => {
    const setRoomForTable = vi.fn();
    seedTableRoomIdHint("t1", "", setRoomForTable);
    seedTableRoomIdHint("t1", "  ", setRoomForTable);
    seedTableRoomIdHint("t1", null, setRoomForTable);
    expect(setRoomForTable).not.toHaveBeenCalled();
  });
});

describe("syncTableRoomIdFromProp", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("seeds store when no roomId exists yet", () => {
    const setRoomForTable = vi.fn();
    syncTableRoomIdFromProp({
      tableId: "t1",
      propRoomId: "lobby-room",
      setRoomForTable,
    });
    expect(setRoomForTable).toHaveBeenCalledWith("t1", "lobby-room");
  });

  it("does not overwrite a different authoritative roomId", () => {
    const setRoomForTable = vi.fn();
    syncTableRoomIdFromProp({
      tableId: "t1",
      propRoomId: "stale-lobby-room",
      currentRoomId: "welcome-room",
      setRoomForTable,
    });
    expect(setRoomForTable).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      "[TABLE_LOAD] stale_prop_roomid_ignored",
      expect.objectContaining({
        tableId: "t1",
        existingRoomId: "welcome-room",
        propRoomId: "stale-lobby-room",
      }),
    );
  });

  it("no-ops when prop matches store", () => {
    const setRoomForTable = vi.fn();
    syncTableRoomIdFromProp({
      tableId: "t1",
      propRoomId: "same-room",
      currentRoomId: "same-room",
      setRoomForTable,
    });
    expect(setRoomForTable).not.toHaveBeenCalled();
  });
});
