/**
 * Canonical room resolution via `GET /api/lobby/tables/:tableId/connect-target`.
 *
 * The client previously resolved a table's Colyseus roomId purely by scanning the lobby table
 * list (a heuristic). This endpoint is the server-authoritative source of truth. These tests
 * assert the transport prefers the canonical connect-target result when it's available, and only
 * falls back to the heuristic table-list scan when connect-target is unavailable (e.g. network
 * error, or a server that hasn't deployed the endpoint yet).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@colyseus/sdk";
import { lobby, request } from "@poker-champ/sdk";
import { createRealtimeSession } from "@/realtime/transport";

const mockRoom = {
  leave: vi.fn(),
  sessionId: "session-1",
  roomId: "resolved-room-1",
  onMessage: vi.fn(),
  onError: vi.fn(),
  onLeave: vi.fn(),
};

let joinByIdCalls: Array<{ roomId: string }> = [];

vi.mock("@colyseus/sdk", () => ({
  Client: vi.fn().mockImplementation(() => ({
    joinById: (roomId: string) => {
      joinByIdCalls.push({ roomId });
      return Promise.resolve(mockRoom);
    },
    joinOrCreate: () => Promise.resolve(mockRoom),
    reconnect: () => Promise.resolve(mockRoom),
  })),
}));

vi.mock("@poker-champ/sdk", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return {
    ...mod,
    lobby: { listTables: vi.fn() },
    request: vi.fn(),
  };
});

describe("connect-target canonical room resolution", () => {
  beforeEach(() => {
    joinByIdCalls = [];
    vi.clearAllMocks();
  });

  it("uses the roomId resolved from connect-target, without falling back to the table-list heuristic", async () => {
    vi.mocked(request).mockResolvedValue({ tableId: "table-1", roomId: "canonical-room-9" });

    createRealtimeSession({
      transport: "colyseus",
      url: "wss://test",
      // Caller passes tableId as roomId (pre-resolution state) — this is what triggers the
      // client-side room-id recovery path.
      roomId: "table-1",
      joinOptions: { tableId: "table-1" },
      onMessage: vi.fn(),
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(request).toHaveBeenCalledWith("GET", "/api/lobby/tables/table-1/connect-target");
    expect(lobby.listTables).not.toHaveBeenCalled();
    expect(joinByIdCalls).toEqual([{ roomId: "canonical-room-9" }]);
  });

  it("falls back to the table-list heuristic when connect-target is unavailable", async () => {
    vi.mocked(request).mockRejectedValue(new Error("connect-target not deployed"));
    vi.mocked(lobby.listTables).mockResolvedValue({
      tables: [{ tableId: "table-1", roomId: "heuristic-room-5" } as any],
    });

    createRealtimeSession({
      transport: "colyseus",
      url: "wss://test",
      roomId: "table-1",
      joinOptions: { tableId: "table-1" },
      onMessage: vi.fn(),
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(lobby.listTables).toHaveBeenCalled();
    expect(joinByIdCalls).toEqual([{ roomId: "heuristic-room-5" }]);
  });
});
