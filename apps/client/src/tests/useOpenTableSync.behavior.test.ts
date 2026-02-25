import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
  };
});

import { useOpenTableSync } from "@/components/domain/table/hooks/useOpenTableSync";

describe("useOpenTableSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes lobby and opens table with persisted route buy-in when table is not open", () => {
    const refreshLobby = vi.fn();
    const openTable = vi.fn();
    const setActive = vi.fn();

    useOpenTableSync({
      tableId: "t1",
      routeBuyInCents: 5000,
      joinStateBuyInCents: 2000,
      openTableIds: [],
      activeTableId: "t2",
      openTable,
      setActive,
      lobbyTableCount: 0,
      refreshLobby,
    });

    expect(refreshLobby).toHaveBeenCalledTimes(1);
    expect(openTable).toHaveBeenCalledWith("t1", { buyInCents: 5000 });
    expect(setActive).toHaveBeenCalledWith("t1");
  });

  it("does not persist buy-in when route buy-in is unchanged and active table already matches", () => {
    const refreshLobby = vi.fn();
    const openTable = vi.fn();
    const setActive = vi.fn();

    useOpenTableSync({
      tableId: "t1",
      routeBuyInCents: 3000,
      joinStateBuyInCents: 3000,
      openTableIds: ["t1"],
      activeTableId: "t1",
      openTable,
      setActive,
      lobbyTableCount: 3,
      refreshLobby,
    });

    expect(refreshLobby).not.toHaveBeenCalled();
    expect(openTable).not.toHaveBeenCalled();
    expect(setActive).not.toHaveBeenCalled();
  });

  it("opens table without buy-in override when route buy-in is invalid", () => {
    const refreshLobby = vi.fn();
    const openTable = vi.fn();
    const setActive = vi.fn();

    useOpenTableSync({
      tableId: "t3",
      routeBuyInCents: 0,
      joinStateBuyInCents: undefined,
      openTableIds: [],
      activeTableId: null,
      openTable,
      setActive,
      lobbyTableCount: 1,
      refreshLobby,
    });

    expect(openTable).toHaveBeenCalledWith("t3", undefined);
    expect(setActive).toHaveBeenCalledWith("t3");
    expect(refreshLobby).not.toHaveBeenCalled();
  });

  it("does not re-open an already open table just to persist route buy-in", () => {
    const refreshLobby = vi.fn();
    const openTable = vi.fn();
    const setActive = vi.fn();

    useOpenTableSync({
      tableId: "t7",
      routeBuyInCents: 8000,
      joinStateBuyInCents: 2000,
      openTableIds: ["t7"],
      activeTableId: "t7",
      openTable,
      setActive,
      lobbyTableCount: 2,
      refreshLobby,
    });

    expect(openTable).not.toHaveBeenCalled();
    expect(setActive).not.toHaveBeenCalled();
    expect(refreshLobby).not.toHaveBeenCalled();
  });
});
