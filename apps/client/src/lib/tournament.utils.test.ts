import { describe, expect, it } from "vitest";
import {
  canCreatorDeleteTournament,
  canUnregisterTournament,
  filterTournamentsForBrowseLobby,
  filterTournamentsForPublicLobby,
  formatCountdownTo,
  formatJoinedTournamentHint,
  formatTournamentStartLocal,
  groupTournamentsForLobby,
  isTournamentStartDue,
  isTournamentStartLocked,
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
  it("offers unregister when registered during REGISTERING before start", () => {
    const futureStart = new Date(Date.now() + 60 * 60_000).toISOString();
    const cta = resolveTournamentCta(
      baseTournament({ isRegistered: true, startTime: futureStart }),
      { nowMs: Date.now() },
    );
    expect(cta).toEqual({ label: "Unregister", action: "unregister", disabled: false });
  });

  it("shows registration closed for unregistered running tournament after late reg", () => {
    const cta = resolveTournamentCta(
      baseTournament({
        status: "RUNNING",
        isRegistered: false,
        tableId: "table_1",
        roomId: "room_1",
      }),
    );
    expect(cta).toEqual({ label: "Registration closed", action: "none", disabled: true });
  });

  it("enables join for registered player after start even with one entrant", () => {
    const pastStart = new Date(Date.now() - 60_000).toISOString();
    const cta = resolveTournamentCta(
      baseTournament({
        status: "LATE_REG",
        lateRegMinutes: 16,
        startTime: pastStart,
        isRegistered: true,
        registeredCount: 1,
      }),
      { authenticated: true },
    );
    expect(cta).toEqual({ label: "Join Table", action: "join", disabled: false });
  });

  it("shows register during late registration when not enrolled", () => {
    const pastStart = new Date(Date.now() - 60_000).toISOString();
    const cta = resolveTournamentCta(
      baseTournament({
        status: "LATE_REG",
        startTime: pastStart,
        lateRegMinutes: 16,
        isRegistered: false,
        tableId: "table_1",
        roomId: "room_1",
        tableLive: true,
      }),
      { authenticated: true },
    );
    expect(cta).toEqual({ label: "Register", action: "register", disabled: false });
  });

  it("shows register for unregistered running tournaments while late registration is open", () => {
    const pastStart = new Date(Date.now() - 60_000).toISOString();
    const cta = resolveTournamentCta(
      baseTournament({
        status: "RUNNING",
        startTime: pastStart,
        lateRegMinutes: 16,
        isRegistered: false,
        tableId: "table_1",
        roomId: "room_1",
        tableLive: true,
      }),
      { authenticated: true },
    );
    expect(cta).toEqual({ label: "Register", action: "register", disabled: false });
  });

  it("enables join during late registration when table ids exist even if room not live", () => {
    const pastStart = new Date(Date.now() - 60_000).toISOString();
    const cta = resolveTournamentCta(
      baseTournament({
        status: "LATE_REG",
        startTime: pastStart,
        lateRegMinutes: 16,
        isRegistered: true,
        tableId: "table_1",
        roomId: "room_1",
        tableLive: false,
      }),
      { authenticated: true },
    );
    expect(cta).toEqual({ label: "Join Table", action: "join", disabled: false });
  });

  it("shows registration closed when unauthenticated and late reg is over", () => {
    const cta = resolveTournamentCta(
      baseTournament({
        status: "RUNNING",
        tableId: "table_1",
        roomId: "room_1",
        tableLive: true,
      }),
      { authenticated: false },
    );
    expect(cta).toEqual({ label: "Registration closed", action: "none", disabled: true });
  });

  it("shows log in to register when unauthenticated and registration is open", () => {
    const futureStart = new Date(Date.now() + 60 * 60_000).toISOString();
    const cta = resolveTournamentCta(baseTournament({ startTime: futureStart }), {
      authenticated: false,
    });
    expect(cta).toEqual({ label: "Log in to register", action: "register", disabled: false });
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

  it("shows table ended when running without late reg and room is not live", () => {
    const pastStart = new Date(Date.now() - 120 * 60_000).toISOString();
    const cta = resolveTournamentCta(
      baseTournament({
        status: "RUNNING",
        startTime: pastStart,
        lateRegMinutes: 0,
        isRegistered: true,
        tableId: "table_1",
        roomId: "room_1",
        tableLive: false,
      }),
      { authenticated: true },
    );
    expect(cta).toEqual({ label: "Table ended", action: "join", disabled: true });
  });

  it("shows standings CTA when finished for registered players", () => {
    const cta = resolveTournamentCta(
      baseTournament({ status: "FINISHED", isRegistered: true, playerStatus: "ELIMINATED" }),
    );
    expect(cta).toEqual({ label: "View Standings", action: "standings", disabled: false });
  });

  it("shows spectate for eliminated player while tournament is running", () => {
    const cta = resolveTournamentCta(
      baseTournament({
        status: "RUNNING",
        isRegistered: true,
        playerStatus: "ELIMINATED",
        tableId: "table_1",
        roomId: "room_1",
        tableLive: true,
      }),
    );
    expect(cta).toEqual({ label: "Spectate", action: "spectate", disabled: false });
  });

  it("shows rebuy for rebuy-pending player while tournament is running", () => {
    const cta = resolveTournamentCta(
      baseTournament({
        status: "RUNNING",
        isRegistered: true,
        playerStatus: "REBUY_PENDING",
        tableId: "table_1",
        roomId: "room_1",
        tableLive: true,
      }),
    );
    expect(cta).toEqual({ label: "Rebuy", action: "rebuy", disabled: false });
  });

  it("shows join table for active registered player", () => {
    const cta = resolveTournamentCta(
      baseTournament({
        status: "RUNNING",
        isRegistered: true,
        playerStatus: "ACTIVE",
        tableId: "table_1",
        roomId: "room_1",
        tableLive: true,
      }),
    );
    expect(cta).toEqual({ label: "Join Table", action: "join", disabled: false });
  });

  it("shows standings for winner after tournament finishes", () => {
    const cta = resolveTournamentCta(
      baseTournament({
        status: "FINISHED",
        isRegistered: true,
        playerStatus: "WINNER",
      }),
    );
    expect(cta).toEqual({ label: "View Standings", action: "standings", disabled: false });
  });

  it("does not offer unregister after scheduled start time", () => {
    const pastStart = new Date(Date.now() - 60_000).toISOString();
    const cta = resolveTournamentCta(
      baseTournament({
        status: "REGISTERING",
        isRegistered: true,
        startTime: pastStart,
      }),
      { nowMs: Date.now() },
    );
    expect(cta.action).not.toBe("unregister");
    expect(canUnregisterTournament(
      baseTournament({ status: "REGISTERING", isRegistered: true, startTime: pastStart }),
      Date.now(),
    )).toBe(false);
    expect(isTournamentStartLocked(
      baseTournament({ status: "REGISTERING", startTime: pastStart }),
      Date.now(),
    )).toBe(true);
  });

  it("does not offer unregister during LATE_REG", () => {
    const pastStart = new Date(Date.now() - 60_000).toISOString();
    const cta = resolveTournamentCta(
      baseTournament({
        status: "LATE_REG",
        lateRegMinutes: 16,
        isRegistered: true,
        startTime: pastStart,
      }),
      { authenticated: true },
    );
    expect(cta.action).toBe("join");
    expect(canUnregisterTournament(
      baseTournament({ status: "LATE_REG", isRegistered: true, startTime: pastStart }),
    )).toBe(false);
  });

  it("offers join CTA after scheduled start time even if status is still REGISTERING", () => {
    const pastStart = new Date(Date.now() - 60_000).toISOString();
    const cta = resolveTournamentCta(
      baseTournament({
        status: "REGISTERING",
        isRegistered: true,
        startTime: pastStart,
        tableId: "table_1",
        roomId: "room_1",
        tableLive: true,
      }),
      { nowMs: Date.now() },
    );
    expect(cta).toEqual({ label: "Join Table", action: "join", disabled: false });
  });
});

describe("formatTournamentStartLocal", () => {
  it("includes am/pm and local timezone in formatted start", () => {
    const formatted = formatTournamentStartLocal("2026-06-15T18:30:00.000Z");
    expect(formatted).not.toBe("Invalid start time");
    expect(formatted.length).toBeGreaterThan(8);
    expect(formatted).toMatch(/(AM|PM|am|pm)/);
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
    expect(mapTournamentApiError("TOURNAMENT_CLOSED")).toContain("paid entries");
    expect(mapTournamentApiError("TOURNAMENT_UNREGISTER_LOCKED")).toContain("start time");
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

describe("canCreatorDeleteTournament", () => {
  it("allows delete only for creator with zero registrations while registering", () => {
    expect(
      canCreatorDeleteTournament(
        baseTournament({ isCreator: true, status: "REGISTERING", registeredCount: 0 }),
      ),
    ).toBe(true);
    expect(
      canCreatorDeleteTournament(
        baseTournament({ isCreator: true, status: "REGISTERING", registeredCount: 1 }),
      ),
    ).toBe(false);
    expect(
      canCreatorDeleteTournament(
        baseTournament({ isCreator: false, status: "REGISTERING", registeredCount: 0 }),
      ),
    ).toBe(false);
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
  it("includes registered scheduled, live, and finished states", () => {
    const joined = selectJoinedTournaments([
      baseTournament({ id: "sched", isRegistered: true, status: "REGISTERING" }),
      baseTournament({ id: "live", isRegistered: true, status: "RUNNING", tableId: "t", roomId: "r" }),
      baseTournament({ id: "other", isRegistered: false, status: "REGISTERING" }),
      baseTournament({ id: "done", isRegistered: true, status: "FINISHED", playerStatus: "ELIMINATED" }),
      baseTournament({ id: "gone", isRegistered: true, status: "CANCELLED" }),
      baseTournament({ id: "abandoned", isRegistered: true, status: "ABANDONED" }),
    ]);
    expect(joined.map((t) => t.id)).toEqual(["live", "sched", "done", "abandoned"]);
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
    const now = Date.now();
    const farFuture = new Date(now + 60 * 60_000).toISOString();
    const startTs = new Date(farFuture).getTime();
    expect(
      formatJoinedTournamentHint(
        baseTournament({ status: "REGISTERING", startTime: farFuture }),
        now,
      ),
    ).toBe(`Scheduled · starts in ${formatCountdownTo(startTs, now)}`);
    expect(formatJoinedTournamentHint(baseTournament({ status: "RUNNING", currentLevel: 3 }))).toBe(
      "Live · level 3",
    );
  });

  it("shows late registration countdown after start when late reg enabled", () => {
    const now = Date.now();
    const past = new Date(now - 60_000).toISOString();
    const hint = formatJoinedTournamentHint(
      baseTournament({ status: "LATE_REG", startTime: past, lateRegMinutes: 16 }),
      now,
    );
    expect(hint).toMatch(/Late registration · closes in/);
  });

  it("describes cancelled and finished joined tournaments", () => {
    expect(formatJoinedTournamentHint(baseTournament({ status: "CANCELLED" }))).toMatch(/Cancelled/i);
    expect(formatJoinedTournamentHint(baseTournament({ status: "FINISHED" }))).toMatch(/Finished/i);
    expect(
      formatJoinedTournamentHint(
        baseTournament({ status: "FINISHED", playerStatus: "WINNER" }),
      ),
    ).toBe("Finished · you won this tournament");
    expect(
      formatJoinedTournamentHint(
        baseTournament({ status: "RUNNING", playerStatus: "ELIMINATED", currentLevel: 4 }),
      ),
    ).toBe("Eliminated · spectate the table");
    expect(
      formatJoinedTournamentHint(
        baseTournament({ status: "FINISHED", fillBotsAtStart: true, prizePoolCents: 0 }),
      ),
    ).toBe("Finished · bot challenge result · no money payout");
    expect(formatJoinedTournamentHint(baseTournament({ status: "ABANDONED" }))).toMatch(
      /refunded/i,
    );
  });
});

describe("formatCountdownTo", () => {
  it("returns null when start time has passed", () => {
    const now = 1_000_000;
    expect(formatCountdownTo(999_000, now)).toBeNull();
  });
});

describe("isTournamentStartDue", () => {
  it("is true when start time is in the past", () => {
    const t = baseTournament({ startTime: new Date(0).toISOString() });
    expect(isTournamentStartDue(t, 1000)).toBe(true);
  });
});
