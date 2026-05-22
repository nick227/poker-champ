import { describe, expect, it } from "vitest";
import { isLateRegistrationOpen, lateRegCloseMs } from "./tournament-schedule";
import {
  canJoinTournament,
  formatJoinedTournamentHint,
  isTournamentRegistrationOpen,
  resolveTournamentCta,
} from "./tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";

function lateRegTournament(overrides: Partial<TournamentSummary> = {}): TournamentSummary {
  const startTime = overrides.startTime ?? new Date(Date.now() - 5 * 60_000).toISOString();
  return {
    id: "late-1",
    name: "Late Reg MTT",
    status: "LATE_REG",
    entryFeeCents: 1000,
    prizePoolCents: 2000,
    startTime,
    maxPlayers: 9,
    startingStackCents: 10_000,
    blindStructureId: "standard_8min",
    lateRegMinutes: 16,
    currentLevel: 1,
    registeredCount: 2,
    fillBotsAtStart: false,
    createdAt: startTime,
    updatedAt: startTime,
    tableId: "table_late",
    roomId: "room_late",
    tableLive: false,
    ...overrides,
  };
}

describe("late registration lobby behavior", () => {
  const nowMs = Date.now();

  it("registration stays open for LATE_REG and early RUNNING inside the window", () => {
    const t = lateRegTournament();
    expect(isTournamentRegistrationOpen(t, nowMs)).toBe(true);
    expect(isLateRegistrationOpen(t, nowMs)).toBe(true);

    const running = lateRegTournament({ status: "RUNNING" });
    expect(isTournamentRegistrationOpen(running, nowMs)).toBe(true);
  });

  it("registration closes after late reg window ends", () => {
    const startTime = new Date(nowMs - 20 * 60_000).toISOString();
    const t = lateRegTournament({ startTime, status: "RUNNING" });
    const closeMs = lateRegCloseMs(t);
    expect(isTournamentRegistrationOpen(t, closeMs)).toBe(false);
    expect(isTournamentRegistrationOpen(t, closeMs + 1)).toBe(false);
  });

  it("registered player can join with table target while late reg is open", () => {
    const t = lateRegTournament({ isRegistered: true, tableLive: false });
    expect(canJoinTournament(t, nowMs)).toBe(true);
    expect(resolveTournamentCta(t, { authenticated: true, nowMs })).toEqual({
      label: "Join Table",
      action: "join",
      disabled: false,
    });
  });

  it("unregistered logged-in user sees Register, not join or table ended", () => {
    const t = lateRegTournament({ isRegistered: false });
    expect(resolveTournamentCta(t, { authenticated: true, nowMs })).toEqual({
      label: "Register",
      action: "register",
      disabled: false,
    });
  });

  it("shows waiting for players when only one registration and no table", () => {
    const t = lateRegTournament({
      isRegistered: true,
      registeredCount: 1,
      tableId: undefined,
      roomId: undefined,
    });
    expect(canJoinTournament(t, nowMs)).toBe(false);
    expect(resolveTournamentCta(t, { authenticated: true, nowMs })).toEqual({
      label: "Waiting for players",
      action: "join",
      disabled: true,
    });
  });

  it("shows starting soon when enough registrations but table not created yet", () => {
    const t = lateRegTournament({
      isRegistered: true,
      registeredCount: 2,
      tableId: undefined,
      roomId: undefined,
    });
    expect(canJoinTournament(t, nowMs)).toBe(false);
    expect(resolveTournamentCta(t, { authenticated: true, nowMs })).toEqual({
      label: "Starting soon…",
      action: "join",
      disabled: true,
    });
  });

  it("join stays available on RUNNING while late reg window is open even if room not live", () => {
    const t = lateRegTournament({
      status: "RUNNING",
      isRegistered: true,
      tableLive: false,
    });
    expect(canJoinTournament(t, nowMs)).toBe(true);
  });

  it("requires live room to join after late reg closes on RUNNING", () => {
    const startTime = new Date(nowMs - 20 * 60_000).toISOString();
    const t = lateRegTournament({
      startTime,
      status: "RUNNING",
      isRegistered: true,
      tableLive: false,
    });
    const afterClose = lateRegCloseMs(t) + 60_000;
    expect(canJoinTournament(t, afterClose)).toBe(false);
    expect(resolveTournamentCta(t, { authenticated: true, nowMs: afterClose })).toEqual({
      label: "Table ended",
      action: "join",
      disabled: true,
    });
  });

  it("hint shows late registration countdown while window is open", () => {
    const hint = formatJoinedTournamentHint(lateRegTournament(), nowMs);
    expect(hint).toMatch(/Late registration · closes in/);
  });

  it("disables register when tournament is full during late reg", () => {
    const t = lateRegTournament({
      isRegistered: false,
      registeredCount: 9,
      maxPlayers: 9,
    });
    expect(resolveTournamentCta(t, { authenticated: true, nowMs })).toEqual({
      label: "Register",
      action: "register",
      disabled: true,
    });
  });
});
