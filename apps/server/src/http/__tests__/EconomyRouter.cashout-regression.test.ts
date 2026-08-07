import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";

const { matchMakerMock, prismaMock, cashOutMock } = vi.hoisted(() => {
  const matchMakerMock = {
    query: vi.fn(),
    remoteRoomCall: vi.fn(),
  };

  const prismaMock = {
    pokerTable: {
      findUnique: vi.fn(),
    },
  };

  const cashOutMock = vi.fn();

  return { matchMakerMock, prismaMock, cashOutMock };
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
    processCashGameBuyIn: vi.fn(),
    processCashGameCashOut: cashOutMock,
  },
}));

import { economyRouter } from "../EconomyRouter.js";

const app = express();
app.use(express.json());
app.use("/api/economy", economyRouter);

describe("EconomyRouter cash-out regressions", () => {
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
    matchMakerMock.query.mockResolvedValue([]);
    prismaMock.pokerTable.findUnique.mockResolvedValue({ name: "Table 1", creatorId: "creator_1" });
    cashOutMock.mockResolvedValue({ success: true });
  });

  it("generates a unique externalRef per cash-out when client omits externalRef (fallback-collision regression)", async () => {
    // Previously the fallback was the constant string `cashout_${tableId}_${userId}`,
    // so a second genuine cash-out for the same user/table would collide with the
    // first one's idempotency key and be silently treated as already-applied.
    await post("/api/economy/cash-out", { tableId: "table_1", amountCents: 3000 });
    await post("/api/economy/cash-out", { tableId: "table_1", amountCents: 3000 });

    expect(cashOutMock).toHaveBeenCalledTimes(2);
    const firstCall = cashOutMock.mock.calls[0]?.[0];
    const secondCall = cashOutMock.mock.calls[1]?.[0];

    expect(firstCall.externalRef).toBeTruthy();
    expect(secondCall.externalRef).toBeTruthy();
    expect(firstCall.externalRef).not.toBe(secondCall.externalRef);
  });

  it("passes a client-supplied externalRef through unchanged (retry-safety preserved)", async () => {
    await post("/api/economy/cash-out", {
      tableId: "table_1",
      amountCents: 3000,
      externalRef: "client-ref-123",
    });

    expect(cashOutMock).toHaveBeenCalledTimes(1);
    const call = cashOutMock.mock.calls[0]?.[0];
    expect(call.externalRef).toBe("client-ref-123");
  });

  it("reuses the same client-supplied externalRef across retries (idempotent retry)", async () => {
    await post("/api/economy/cash-out", {
      tableId: "table_1",
      amountCents: 3000,
      externalRef: "client-ref-retry",
    });
    await post("/api/economy/cash-out", {
      tableId: "table_1",
      amountCents: 3000,
      externalRef: "client-ref-retry",
    });

    expect(cashOutMock).toHaveBeenCalledTimes(2);
    const firstCall = cashOutMock.mock.calls[0]?.[0];
    const secondCall = cashOutMock.mock.calls[1]?.[0];
    expect(firstCall.externalRef).toBe("client-ref-retry");
    expect(secondCall.externalRef).toBe("client-ref-retry");
  });
});
