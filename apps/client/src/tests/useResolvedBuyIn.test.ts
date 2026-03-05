import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useMemo: <T,>(factory: () => T) => factory(),
  };
});

import { useResolvedBuyIn } from "@/components/domain/table/hooks/useResolvedBuyIn";

describe("useResolvedBuyIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers route buy-in over join-state and persisted values", () => {
    const tableById = new Map([
      [
        "t1",
        {
          tableId: "t1",
          roomId: "r1",
          name: "Table 1",
          visibility: "PUBLIC",
          maxSeats: 6,
          smallBlindCents: 50,
          bigBlindCents: 100,
          minBuyInCents: 2000,
          maxBuyInCents: 20000,
          showStats: true,
          speed: "normal",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          runningSince: Date.now(),
          humanCount: 1,
          connectedHumanCount: 1,
        },
      ],
    ] as const);

    const result = useResolvedBuyIn({
      tableId: "t1",
      buyInCentsParam: "7000",
      joinStateBuyInCents: 4000,
      persistedBuyInCents: 3000,
      tableById: tableById as any,
    });

    expect(result.routeBuyInCents).toBe(7000);
    expect(result.buyInCents).toBe(7000);
  });

  it("falls back to join-state buy-in when route buy-in is missing", () => {
    const result = useResolvedBuyIn({
      tableId: "t2",
      buyInCentsParam: undefined,
      joinStateBuyInCents: 5000,
      persistedBuyInCents: 3000,
      tableById: new Map(),
    });

    expect(result.routeBuyInCents).toBeUndefined();
    expect(result.buyInCents).toBe(5000);
  });
});
