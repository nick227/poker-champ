import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findLiveCashRoomByTableId: vi.fn(),
}));

vi.mock("../tables/cash-table-room.js", () => ({
  findLiveCashRoomByTableId: mocks.findLiveCashRoomByTableId,
}));

vi.mock("@colyseus/core", () => ({
  matchMaker: {
    query: vi.fn(),
    createRoom: vi.fn(),
    remoteRoomCall: vi.fn(),
  },
}));

vi.mock("../lobby/TableManager.js", () => ({
  buildTableConfig: vi.fn(),
  isPasswordValid: vi.fn(),
}));

vi.mock("../engine/auth/RequireAuth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("@poker-champ/db", () => ({
  getPrisma: () => ({
    user: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
    lobbyChatMessage: { findMany: vi.fn(), create: vi.fn() },
  }),
}));

vi.mock("../tournaments/lobby-table-filter.js", () => ({
  isTournamentTableMetadata: () => false,
}));

// Import after mocks are registered so the router picks up the mocked module graph.
const { lobbyRouter } = await import("./LobbyRouter.js");

type FakeRes = {
  statusCode?: number;
  body?: unknown;
  status: (code: number) => FakeRes;
  json: (body: unknown) => FakeRes;
  send: (body?: unknown) => FakeRes;
};

function makeRes(): FakeRes {
  const res: FakeRes = {
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    send(body?: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function findConnectTargetHandler() {
  const layer = (lobbyRouter as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: (...args: unknown[]) => unknown }> } }> }).stack.find(
    (l) => l.route?.path === "/tables/:tableId/connect-target" && l.route.methods.get,
  );
  if (!layer?.route) throw new Error("connect-target route not registered");
  return layer.route.stack[layer.route.stack.length - 1]!.handle;
}

describe("GET /api/lobby/tables/:tableId/connect-target", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves {tableId, roomId} for a live table", async () => {
    mocks.findLiveCashRoomByTableId.mockResolvedValue({
      tableId: "table_live",
      roomId: "room_abc123",
      metadata: {},
    });

    const handler = findConnectTargetHandler();
    const res = makeRes();
    await handler({ params: { tableId: "table_live" } }, res);

    expect(mocks.findLiveCashRoomByTableId).toHaveBeenCalledWith("table_live");
    expect(res.statusCode).toBeUndefined();
    expect(res.body).toEqual({ tableId: "table_live", roomId: "room_abc123" });
  });

  it("404s for an unknown tableId", async () => {
    mocks.findLiveCashRoomByTableId.mockResolvedValue(null);

    const handler = findConnectTargetHandler();
    const res = makeRes();
    await handler({ params: { tableId: "table_gone" } }, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Table not found" });
  });

  it("returns 400 when tableId param is missing", async () => {
    const handler = findConnectTargetHandler();
    const res = makeRes();
    await handler({ params: {} }, res);

    expect(res.statusCode).toBe(400);
    expect(mocks.findLiveCashRoomByTableId).not.toHaveBeenCalled();
  });
});
