import { describe, expect, it } from "vitest";
import { applyLobbyFilters, DEFAULT_LOBBY_FILTERS } from "./lobbyTableFilters";
import type { LobbyTableRow } from "@/lib/lobbyTables";

function row(partial: Partial<LobbyTableRow> & Pick<LobbyTableRow, "id" | "name">): LobbyTableRow {
  return {
    tableId: partial.id,
    roomId: "",
    blinds: "1/2",
    smallBlindCents: 100,
    bigBlindCents: 200,
    players: 3,
    seats: 9,
    minBuyInCents: 2000,
    maxBuyInCents: 20000,
    creatorName: "P",
    creatorAvatarUrl: null,
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("applyLobbyFilters", () => {
  const tables = [
    row({ id: "a", name: "Alpha", players: 9, seats: 9, bigBlindCents: 200 }),
    row({ id: "b", name: "Beta", players: 2, seats: 6, bigBlindCents: 1000 }),
  ];

  it("hides full tables", () => {
    const out = applyLobbyFilters(tables, { ...DEFAULT_LOBBY_FILTERS, hideFull: true });
    expect(out.map((t) => t.id)).toEqual(["b"]);
  });

  it("filters by max big blind", () => {
    const out = applyLobbyFilters(tables, { ...DEFAULT_LOBBY_FILTERS, maxBigBlindCents: 200 });
    expect(out.map((t) => t.id)).toEqual(["a"]);
  });

  it("filters by query", () => {
    const out = applyLobbyFilters(tables, { ...DEFAULT_LOBBY_FILTERS, query: "bet" });
    expect(out.map((t) => t.id)).toEqual(["b"]);
  });
});
