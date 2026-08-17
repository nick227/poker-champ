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

  describe("rejects cash-out via the shared admission boundary", () => {
    beforeEach(() => {
      matchMakerMock.query.mockResolvedValue([
        { roomId: "room_1", metadata: { tableId: "table_1", name: "Table 1", creatorId: "creator_1" } },
      ]);
    });

    it("rejects before any balance mutation when the player is actively seated (bet in flight)", async () => {
      // Models the exact race: player is seated, a bet operation is conceptually in flight in the
      // room, and an HTTP cash-out is attempted concurrently. The room-side admission boundary must
      // win and no money may move -- the ledger must never discover afterward that the stack vanished.
      matchMakerMock.remoteRoomCall.mockImplementation(async (_roomId: string, method: string) =>
        method === "beginCashOutAdmission" ? { ok: false, reason: "SEATED_AT_TABLE" } : undefined,
      );

      const res = await post("/api/economy/cash-out", { tableId: "table_1", amountCents: 3000 });

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "SEATED_AT_TABLE" });
      expect(cashOutMock).not.toHaveBeenCalled();
    });

    it("rejects when a buy-in has already committed funds but not yet synced room state", async () => {
      // The TOCTOU window this admission boundary closes: isUserSeated() alone would read false
      // here (the player isn't seated yet), but the room reports a buy-in admission still in
      // flight for this user, so cash-out must not be allowed to race it.
      matchMakerMock.remoteRoomCall.mockImplementation(async (_roomId: string, method: string) =>
        method === "beginCashOutAdmission" ? { ok: false, reason: "ADMISSION_IN_PROGRESS" } : undefined,
      );

      const res = await post("/api/economy/cash-out", { tableId: "table_1", amountCents: 3000 });

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "ADMISSION_IN_PROGRESS" });
      expect(cashOutMock).not.toHaveBeenCalled();
    });

    it("allows cash-out once the room admits it, and releases the admission afterward", async () => {
      matchMakerMock.remoteRoomCall.mockImplementation(async (_roomId: string, method: string) =>
        method === "beginCashOutAdmission" ? { ok: true } : undefined,
      );

      const res = await post("/api/economy/cash-out", { tableId: "table_1", amountCents: 3000 });

      expect(res.status).toBe(200);
      expect(cashOutMock).toHaveBeenCalledTimes(1);
      const endCalls = matchMakerMock.remoteRoomCall.mock.calls.filter((c: unknown[]) => c[1] === "endCashOutAdmission");
      expect(endCalls).toHaveLength(1);
      expect(endCalls[0]?.[2]).toEqual(["user_test_1"]);
    });

    it("releases the admission even when the ledger call throws", async () => {
      matchMakerMock.remoteRoomCall.mockImplementation(async (_roomId: string, method: string) =>
        method === "beginCashOutAdmission" ? { ok: true } : undefined,
      );
      cashOutMock.mockRejectedValueOnce(new Error("INSUFFICIENT_TABLE_BALANCE"));

      const res = await post("/api/economy/cash-out", { tableId: "table_1", amountCents: 3000 });

      expect(res.status).toBe(400);
      const endCalls = matchMakerMock.remoteRoomCall.mock.calls.filter((c: unknown[]) => c[1] === "endCashOutAdmission");
      expect(endCalls).toHaveLength(1);
    });

    it("fails closed (rejects, no mutation) if the admission check itself fails", async () => {
      matchMakerMock.remoteRoomCall.mockRejectedValue(new Error("room unreachable"));

      const res = await post("/api/economy/cash-out", { tableId: "table_1", amountCents: 3000 });

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "TABLE_STATE_UNAVAILABLE" });
      expect(cashOutMock).not.toHaveBeenCalled();
    });
  });
});
