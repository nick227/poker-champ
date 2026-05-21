import { describe, expect, it } from "vitest";
import {
  filterTournamentsForBrowseLobby,
  filterTournamentsForPublicLobby,
  formatJoinedTournamentHint,
  formatTournamentStartLocal,
  groupTournamentsForLobby,
  mapTournamentApiError,
  mapTournamentErrorMessage,
  resolveTournamentCta,
  selectJoinedTournaments,
} from "./tournament.utils";
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
    fillBotsAtStart: false,
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

  it("shows starting soon when registered but table not ready", () => {
    const cta = resolveTournamentCta(
      baseTournament({
        status: "RUNNING",
        isRegistered: true,
      }),
      { authenticated: true },
    );
    expect(cta).toEqual({ label: "Starting soon…", action: "join", disabled: true });
  });

  it("shows not registered for live tournament when logged in but not enrolled", () => {
    const cta = resolveTournamentCta(
      baseTournament({
        status: "RUNNING",
        isRegistered: false,
        tableId: "table_1",
        roomId: "room_1",
        tableLive: true,
      }),
      { authenticated: true },
    );
    expect(cta).toEqual({ label: "Not registered", action: "none", disabled: true });
  });

  it("shows log in to join only when unauthenticated", () => {
    const cta = resolveTournamentCta(
      baseTournament({
        status: "RUNNING",
        tableId: "table_1",
        roomId: "room_1",
        tableLive: true,
      }),
      { authenticated: false },
    );
    expect(cta.label).toBe("Log in to join");
  });

  it("enables join for registered running tournament with live table", () => {
    const cta = resolveTournamentCta(
      baseTournament({
        status: "RUNNING",
        isRegistered: true,
        tableId: "table_1",
        roomId: "room_1",
        tableLive: true,
      }),
    );
    expect(cta).toEqual({ label: "Join Table", action: "join", disabled: false });
  });

  it("shows table ended when room is not live", () => {
    const cta = resolveTournamentCta(
      baseTournament({
        status: "RUNNING",
        isRegistered: true,
        tableId: "table_1",
        roomId: "room_1",
        tableLive: false,
      }),
      { authenticated: true },
    );
    expect(cta).toEqual({ label: "Table ended", action: "join", disabled: true });
  });

  it("shows standings CTA when finished", () => {
    const cta = resolveTournamentCta(baseTournament({ status: "FINISHED" }));
    expect(cta.action).toBe("standings");
  });
});

describe("formatTournamentStartLocal", () => {
  it("includes local timezone in formatted start", () => {
    const formatted = formatTournamentStartLocal("2026-06-15T18:30:00.000Z");
    expect(formatted).not.toBe("Invalid start time");
    expect(formatted.length).toBeGreaterThan(8);
  });

  it("returns fallback for invalid iso", () => {
    expect(formatTournamentStartLocal("not-a-date")).toBe("Invalid start time");
  });
});

describe("mapTournamentApiError", () => {
  it("maps known API codes from message", () => {
    expect(mapTournamentApiError("TOURNAMENT_FULL")).toBe("This tournament is full.");
    expect(mapTournamentApiError("Registration failed", "INSUFFICIENT_BANKROLL")).toBe(
      "Insufficient bankroll for this entry fee.",
    );
  });

  it("maps cancel and closed errors", () => {
    expect(mapTournamentErrorMessage("TOURNAMENT_NOT_CANCELLABLE")).toContain("registering");
    expect(mapTournamentApiError("TOURNAMENT_CLOSED")).toContain("closed");
  });
});

describe("groupTournamentsForLobby", () => {
  it("groups by lifecycle section", () => {
    const groups = groupTournamentsForLobby([
      baseTournament({ id: "a", status: "REGISTERING" }),
      baseTournament({ id: "b", status: "RUNNING", tableId: "t", roomId: "r" }),
    ]);
    expect(groups.upcoming.map((t) => t.id)).toEqual(["a"]);
    expect(groups.running.map((t) => t.id)).toEqual(["b"]);
  });
});

describe("filterTournamentsForPublicLobby", () => {
  it("excludes finished and cancelled", () => {
    const visible = filterTournamentsForPublicLobby([
      baseTournament({ id: "open", status: "REGISTERING" }),
      baseTournament({ id: "done", status: "FINISHED" }),
      baseTournament({ id: "gone", status: "CANCELLED" }),
    ]);
    expect(visible.map((t) => t.id)).toEqual(["open"]);
  });
});

describe("selectJoinedTournaments", () => {
  it("includes registered scheduled and live only", () => {
    const joined = selectJoinedTournaments([
      baseTournament({ id: "sched", isRegistered: true, status: "REGISTERING" }),
      baseTournament({ id: "live", isRegistered: true, status: "RUNNING", tableId: "t", roomId: "r" }),
      baseTournament({ id: "other", isRegistered: false, status: "REGISTERING" }),
      baseTournament({ id: "done", isRegistered: true, status: "FINISHED" }),
    ]);
    expect(joined.map((t) => t.id)).toEqual(["live", "sched"]);
  });

  it("removes joined active rows from browse list", () => {
    const all = [
      baseTournament({ id: "mine", isRegistered: true, status: "REGISTERING" }),
      baseTournament({ id: "open", isRegistered: false, status: "REGISTERING" }),
    ];
    const browse = filterTournamentsForBrowseLobby(all);
    expect(browse.map((t) => t.id)).toEqual(["open"]);
  });
});

describe("formatJoinedTournamentHint", () => {
  it("describes scheduled and live states", () => {
    const farFuture = new Date(Date.now() + 60 * 60_000).toISOString();
    expect(formatJoinedTournamentHint(baseTournament({ status: "REGISTERING", startTime: farFuture }))).toMatch(
      /^Scheduled · starts in /,
    );
    expect(formatJoinedTournamentHint(baseTournament({ status: "RUNNING", currentLevel: 3 }))).toBe("Live · level 3");
  });
});
