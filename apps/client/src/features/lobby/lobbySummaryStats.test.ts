import { describe, expect, it } from "vitest";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import type { TournamentSummary } from "@/services/tournaments.types";
import { computeCashLobbyStats, computeTournamentLobbyStats } from "./lobbySummaryStats";
import { sliceLobbyPreview } from "./lobbyPreview";

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
  it("counts registering events and enrolled players", () => {
    const stats = computeTournamentLobbyStats([
      { status: "REGISTERING", registeredCount: 18 } as TournamentSummary,
      { status: "RUNNING", registeredCount: 40 } as TournamentSummary,
      { status: "REGISTERING", registeredCount: 10 } as TournamentSummary,
    ]);
    expect(stats).toEqual({ upcomingEvents: 2, playersRegistered: 68 });
  });
});

describe("sliceLobbyPreview", () => {
  it("counts pinned rows toward the limit", () => {
    const out = sliceLobbyPreview(["p1", "p2"], ["a", "b", "c", "d"], 5);
    expect(out.pinned).toEqual(["p1", "p2"]);
    expect(out.rest).toEqual(["a", "b", "c"]);
    expect(out.hasMore).toBe(true);
    expect(out.total).toBe(6);
  });
});
