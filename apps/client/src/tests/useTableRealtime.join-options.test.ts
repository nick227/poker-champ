import { beforeEach, describe, expect, it, vi } from "vitest";

const { useRealtimeChannelMock, storeRegistryMock } = vi.hoisted(() => {
  const useRealtimeChannelMock = vi.fn();
  const tablesApi = {
    disconnectOtherTables: vi.fn(),
    registerTableSender: vi.fn(),
    unregisterTableSender: vi.fn(),
    registerTableDisconnect: vi.fn(),
    unregisterTableDisconnect: vi.fn(),
    setRoomForTable: vi.fn(),
    roomIdByTableId: {} as Record<string, string>,
  };
  const tableApi = {
    setError: vi.fn(),
    resetSnapshotStream: vi.fn(),
    setSnapshot: vi.fn(),
    appendChatMessage: vi.fn(),
    setBotSummaries: vi.fn(),
    setConnectionStatus: vi.fn(),
    clearConnectionStatus: vi.fn(),
    setActiveSessionId: vi.fn(),
    getActiveSessionId: vi.fn(),
    clearActiveSessionId: vi.fn(),
  };
  const storeRegistryMock = {
    use: {
      auth: (selector: (s: { hydrated: boolean }) => boolean) => selector({ hydrated: true }),
    },
    tables: () => tablesApi,
    table: () => tableApi,
  };
  return { useRealtimeChannelMock, storeRegistryMock };
});

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useRef: <T,>(initialValue: T) => ({ current: initialValue }),
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
    useMemo: <T,>(factory: () => T) => factory(),
  };
});

vi.mock("@/realtime/useRealtimeChannel", () => ({
  useRealtimeChannel: useRealtimeChannelMock,
}));

vi.mock("@/registry/store.registry", () => ({
  storeRegistry: storeRegistryMock,
}));

import { useTableRealtime } from "@/realtime/useTableRealtime";

describe("useTableRealtime join options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__DEV__ = false;
    useRealtimeChannelMock.mockReturnValue({
      send: vi.fn(),
      disconnect: vi.fn(),
      getNativeRoom: vi.fn(),
    });
  });

  it("passes selected buyInCents into joinOptions", () => {
    useTableRealtime({
      tableId: "table_1",
      buyInCents: 7000,
      enabled: true,
    });

    expect(useRealtimeChannelMock).toHaveBeenCalled();
    const call = useRealtimeChannelMock.mock.calls.at(-1)?.[0];
    expect(call.joinOptions).toEqual({
      tableId: "table_1",
      buyInCents: 7000,
    });
  });

  it("omits invalid buyInCents from joinOptions", () => {
    useTableRealtime({
      tableId: "table_2",
      buyInCents: 0,
      enabled: true,
    });

    const call = useRealtimeChannelMock.mock.calls.at(-1)?.[0];
    expect(call.joinOptions).toEqual({
      tableId: "table_2",
    });
  });
});
