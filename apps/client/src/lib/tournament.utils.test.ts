import { describe, expect, it } from "vitest";
import { groupTournamentsForLobby, resolveTournamentCta } from "./tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";

function baseTournament(overrides: Partial<TournamentSummary>): TournamentSummary {
  return {
    id: "t1",
    name: "Test",
    status: "REGISTERING",
    entryFeeCents: 1000,
    prizePoolCents: 0,
    startTime: "2026-06-01T18:00:00.000Z",
    maxPlayers: 6,
    startingStackCents: 10000,
    blindStructureId: "standard_8min",
    lateRegMinutes: 0,
    currentLevel: 1,
    registeredCount: 0,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveTournamentCta", () => {
  it("offers unregister when registered during REGISTERING", () => {
    const cta = resolveTournamentCta(baseTournament({ isRegistered: true }));
    expect(cta).toEqual({ label: "Unregister", action: "unregister", disabled: false });
  });

  it("disables join until registered with table link", () => {
    const cta = resolveTournamentCta(
      baseTournament({
        status: "RUNNING",
        isRegistered: false,
        tableId: "table_1",
        roomId: "room_1",
      }),
    );
    expect(cta.disabled).toBe(true);
  });

  it("enables join for registered running tournament", () => {
    const cta = resolveTournamentCta(
      baseTournament({
        status: "RUNNING",
        isRegistered: true,
        tableId: "table_1",
        roomId: "room_1",
      }),
    );
    expect(cta).toEqual({ label: "Join Table", action: "join", disabled: false });
  });

  it("shows standings CTA when finished", () => {
    const cta = resolveTournamentCta(baseTournament({ status: "FINISHED" }));
    expect(cta.action).toBe("standings");
  });
});

describe("groupTournamentsForLobby", () => {
  it("groups by lifecycle section", () => {
    const groups = groupTournamentsForLobby([
      baseTournament({ id: "a", status: "REGISTERING" }),
      baseTournament({ id: "b", status: "RUNNING", tableId: "t", roomId: "r" }),
      baseTournament({ id: "c", status: "FINISHED", finishedAt: "2026-06-02T00:00:00.000Z" }),
    ]);
    expect(groups.upcoming.map((t) => t.id)).toEqual(["a"]);
    expect(groups.running.map((t) => t.id)).toEqual(["b"]);
    expect(groups.recent.map((t) => t.id)).toEqual(["c"]);
  });
});
