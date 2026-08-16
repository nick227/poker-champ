import { describe, expect, it } from "vitest";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import {
  buildPinnedCashLobbyRows,
  excludePinnedLobbyTables,
} from "./lobbySessionTables";

function row(overrides: Partial<LobbyTableRow> & Pick<LobbyTableRow, "id">): LobbyTableRow {
  return {
    tableId: overrides.id,
    roomId: "r1",
    name: "Table",
    smallBlindCents: 50,
    bigBlindCents: 100,
    players: 2,
    seats: 6,
    minBuyInCents: 2000,
    maxBuyInCents: 10000,
    creatorName: "Host",
    creatorAvatarUrl: null,
    updatedAt: "2026-05-01T00:00:00.000Z",
    connectedHumanCount: 1,
    ...overrides,
  };
}

describe("lobbySessionTables", () => {
  it("pins only live rows whose server membership is resumable", () => {
    const lobby = [row({
      id: "cash-1",
      name: "Felt One",
      status: "LIVE",
      viewer: { status: "SEATED", canResume: true },
    })];
    const pinned = buildPinnedCashLobbyRows({
      openTableIds: ["cash-1", "orphan", "tour-1"],
      lobbyTables: lobby,
      tournamentTableIds: new Set(["tour-1"]),
    });

    expect(pinned).toHaveLength(1);
    expect(pinned[0]?.name).toBe("Felt One");
  });

  it("excludes pinned ids from browse list", () => {
    const tables = [row({ id: "a" }), row({ id: "b" })];
    expect(excludePinnedLobbyTables(tables, new Set(["a"])).map((t) => t.id)).toEqual(["b"]);
  });
});
