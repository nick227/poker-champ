import { describe, expect, it } from "vitest";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import { sortLobbyTables } from "./lobbyTableSort";

function table(overrides: Partial<LobbyTableRow> & Pick<LobbyTableRow, "id" | "name">): LobbyTableRow {
  return {
    tableId: overrides.id,
    roomId: overrides.roomId ?? overrides.id,
    blinds: "50/100",
    smallBlindCents: 50,
    bigBlindCents: 100,
    players: 0,
    seats: 9,
    minBuyInCents: 2000,
    maxBuyInCents: 20000,
    creatorName: "Player",
    creatorAvatarUrl: null,
    updatedAt: "2026-06-01T00:00:00.000Z",
    connectedHumanCount: 0,
    ...overrides,
  };
}

describe("sortLobbyTables", () => {
  const rows = [
    table({ id: "empty", name: "Zebra", players: 1, connectedHumanCount: 0 }),
    table({ id: "live", name: "Ace", players: 3, connectedHumanCount: 2 }),
    table({ id: "full", name: "Mid", players: 9, seats: 9, connectedHumanCount: 1 }),
    table({ id: "busy", name: "Busy", players: 3, connectedHumanCount: 0 }),
  ];

  it("defaults players desc: fullest first, then more connected humans", () => {
    expect(sortLobbyTables(rows, "players", "desc").map((t) => t.id)).toEqual([
      "full",
      "live",
      "busy",
      "empty",
    ]);
  });

  it("sorts status asc: live, open, full", () => {
    expect(sortLobbyTables(rows, "status", "asc").map((t) => t.id)).toEqual([
      "live",
      "busy",
      "empty",
      "full",
    ]);
  });

  it("sorts name ascending", () => {
    expect(sortLobbyTables(rows, "name", "asc").map((t) => t.name)).toEqual([
      "Ace",
      "Busy",
      "Mid",
      "Zebra",
    ]);
  });
});
