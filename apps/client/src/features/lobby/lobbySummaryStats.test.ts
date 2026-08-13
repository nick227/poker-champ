import { describe, expect, it } from "vitest";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import type { TournamentSummary } from "@/services/tournaments.types";
import { computeCashLobbyStats, computeTournamentLobbyStats } from "./lobbySummaryStats";

function table(partial: Partial<LobbyTableRow> & Pick<LobbyTableRow, "id">): LobbyTableRow {
  return {
    tableId: partial.id,
    roomId: "",
    name: "T",
    smallBlindCents: 100,
    bigBlindCents: 200,
    players: 0,
    seats: 9,
    minBuyInCents: 2000,
    maxBuyInCents: 20000,
    creatorName: "P",
    creatorAvatarUrl: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("computeCashLobbyStats", () => {
  it("counts live tables and open seats", () => {
    const stats = computeCashLobbyStats([
      table({ id: "a", players: 6, seats: 9 }),
      table({ id: "b", players: 6, seats: 6 }),
    ]);
    expect(stats).toEqual({ tablesLive: 2, seatsAvailable: 3 });
  });
});

describe("computeTournamentLobbyStats", () => {
  it("counts registering events and enrolled players on lobby-visible tournaments only", () => {
    const stats = computeTournamentLobbyStats([
      { status: "REGISTERING", registeredCount: 2 } as TournamentSummary,
      { status: "RUNNING", registeredCount: 6 } as TournamentSummary,
      { status: "FINISHED", registeredCount: 27 } as TournamentSummary,
      { status: "CANCELLED", registeredCount: 9 } as TournamentSummary,
    ]);
    expect(stats).toEqual({ upcomingEvents: 1, playersRegistered: 8 });
  });
});
