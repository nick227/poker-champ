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

vi.mock("../../engine/economy/CashierService.js", () => ({
  TABLE_NAME_REQUIRED: "TABLE_NAME_REQUIRED",
  CashierService: {
    processCashGameBuyIn: buyInMock,
    processCashGameCashOut: vi.fn(),
  },
}));

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
    buyInMock.mockResolvedValue({ success: true, newTableBalance: 8000 });
  });

  it("returns an error when room rebuy application fails after ledger buy-in", async () => {
    matchMakerMock.remoteRoomCall.mockRejectedValueOnce(new Error("room unavailable"));

    const res = await post("/api/economy/buy-in", { tableId: "table_1", amountCents: 3000 });

    expect(res.status).toBeGreaterThanOrEqual(500);
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

