import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";

const { matchMakerMock, prismaMock, buyInMock } = vi.hoisted(() => {
  const matchMakerMock = {
    query: vi.fn(),
    remoteRoomCall: vi.fn(),
  };

  const prismaMock = {
    pokerTable: {
      findUnique: vi.fn(),
    },
    // Pre-existing gap: the router checks for an active REBUY tournament on
    // this table before treating the buy-in as a plain cash-game buy-in.
    // Without this mock, `prisma.tournament.findFirst` throws for every
    // request (masking whatever the test is actually trying to exercise
    // behind an unrelated 500), so every buy-in request short-circuits
    // before ever reaching CashierService or the room-sync call.
    tournament: {
      findFirst: vi.fn(),
    },
    balanceTransaction: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  const buyInMock = vi.fn();

  return { matchMakerMock, prismaMock, buyInMock };
});

vi.mock("@colyseus/core", () => ({
  matchMaker: matchMakerMock,
}));

vi.mock("@poker-champ/db", () => ({
  getPrisma: () => prismaMock,
}));

vi.mock("../../engine/auth/RequireAuth.js", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user_test_1" };
    next();
  },
}));

vi.mock("../../engine/economy/CashierService.js", async () => {
  const actual = await vi.importActual<typeof import("../../engine/economy/CashierService.js")>(
    "../../engine/economy/CashierService.js",
  );
  return {
    TABLE_NAME_REQUIRED: "TABLE_NAME_REQUIRED",
    CashierService: {
      processCashGameBuyIn: buyInMock,
      processCashGameCashOut: vi.fn(),
      // Use the real retry/backoff + dead-letter implementation so the
      // router-level tests below exercise actual retry behavior instead of
      // a synthetic stand-in.
      syncRoomAfterBuyIn: actual.CashierService.syncRoomAfterBuyIn,
    },
  };
});

import { economyRouter } from "../EconomyRouter.js";

const app = express();
app.use(express.json());
app.use("/api/economy", economyRouter);

describe("EconomyRouter rebuy regressions", () => {
  let server: http.Server;
  let baseUrl: string;

  async function post(path: string, body?: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
      body: body == null ? undefined : JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    matchMakerMock.query.mockResolvedValue([
      {
        roomId: "room_1",
        metadata: { tableId: "table_1", name: "Table 1", creatorId: "creator_1" },
      },
    ]);
    matchMakerMock.remoteRoomCall.mockResolvedValue(undefined);
    prismaMock.pokerTable.findUnique.mockResolvedValue({ name: "Table 1", creatorId: "creator_1" });
    prismaMock.tournament.findFirst.mockResolvedValue(null);
    prismaMock.balanceTransaction.findUnique.mockResolvedValue(null);
    prismaMock.balanceTransaction.update.mockResolvedValue(undefined);
    buyInMock.mockResolvedValue({ success: true, newTableBalance: 8000 });
  });

  it("returns an error when room rebuy application keeps failing after exhausting retries", async () => {
    // The buy-in route now retries the room-sync call a bounded number of
    // times with backoff (see CashierService.syncRoomAfterBuyIn); only a
    // failure on *every* attempt should surface as an error to the client.
    matchMakerMock.remoteRoomCall.mockRejectedValue(new Error("room unavailable"));
    prismaMock.balanceTransaction.findUnique.mockResolvedValue({ metaJson: null });

    const res = await post("/api/economy/buy-in", { tableId: "table_1", amountCents: 3000 });

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(matchMakerMock.remoteRoomCall.mock.calls.length).toBeGreaterThan(1);

    // The already-committed buy-in gets dead-lettered so it's discoverable
    // for manual reconciliation instead of silently vanishing.
    expect(prismaMock.balanceTransaction.update).toHaveBeenCalledTimes(1);
    const updateArgs = prismaMock.balanceTransaction.update.mock.calls[0]![0];
    expect(updateArgs.data.metaJson.roomSyncStatus).toBe("FAILED");
    expect(updateArgs.data.metaJson.roomSyncAttempts).toBeGreaterThan(1);
  });

  it("recovers via retry when the room rebuy application fails transiently then succeeds", async () => {
    matchMakerMock.remoteRoomCall
      .mockRejectedValueOnce(new Error("transient room unavailable"))
      .mockResolvedValueOnce(undefined);

    const res = await post("/api/economy/buy-in", { tableId: "table_1", amountCents: 3000 });

    expect(res.status).toBe(200);
    expect(matchMakerMock.remoteRoomCall).toHaveBeenCalledTimes(2);
  });

  it("generates a unique externalRef per rebuy when client omits externalRef", async () => {
    await post("/api/economy/buy-in", { tableId: "table_1", amountCents: 3000 });
    await post("/api/economy/buy-in", { tableId: "table_1", amountCents: 3000 });

    const firstCall = buyInMock.mock.calls[0]?.[0];
    const secondCall = buyInMock.mock.calls[1]?.[0];

    expect(firstCall.externalRef).toBeTruthy();
    expect(secondCall.externalRef).toBeTruthy();
    expect(firstCall.externalRef).not.toBe(secondCall.externalRef);
  });
});

