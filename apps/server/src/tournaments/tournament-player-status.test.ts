import { describe, expect, it } from "vitest";
import {
  isTournamentSpectateEligible,
  resolveTournamentPlayerStatus,
} from "./tournament-player-status.js";

describe("resolveTournamentPlayerStatus", () => {
  it("returns NOT_REGISTERED when user is not enrolled", () => {
    expect(
      resolveTournamentPlayerStatus({
        isRegistered: false,
        tournamentStatus: "RUNNING",
        finishPlace: null,
        eliminatedAt: null,
      }),
    ).toBe("NOT_REGISTERED");
  });

  it("returns ACTIVE for enrolled player still in the field", () => {
    expect(
      resolveTournamentPlayerStatus({
        isRegistered: true,
        tournamentStatus: "RUNNING",
        finishPlace: null,
        eliminatedAt: null,
      }),
    ).toBe("ACTIVE");
  });

  it("returns ELIMINATED for busted players", () => {
    expect(
      resolveTournamentPlayerStatus({
        isRegistered: true,
        tournamentStatus: "RUNNING",
        finishPlace: 2,
        eliminatedAt: new Date(),
      }),
    ).toBe("ELIMINATED");
  });

  it("returns WINNER for first place when tournament finished", () => {
    expect(
      resolveTournamentPlayerStatus({
        isRegistered: true,
        tournamentStatus: "FINISHED",
        finishPlace: 1,
        eliminatedAt: null,
      }),
    ).toBe("WINNER");
  });

  it("returns REBUY_PENDING while rebuy window is open", () => {
    expect(
      resolveTournamentPlayerStatus({
        isRegistered: true,
        tournamentStatus: "RUNNING",
        finishPlace: null,
        eliminatedAt: null,
        rebuyPendingAt: new Date(),
        rebuyEligible: true,
      }),
    ).toBe("REBUY_PENDING");
  });

  it("returns ELIMINATED when rebuy window expired for pending player", () => {
    expect(
      resolveTournamentPlayerStatus({
        isRegistered: true,
        tournamentStatus: "RUNNING",
        finishPlace: null,
        eliminatedAt: null,
        rebuyPendingAt: new Date(),
        rebuyEligible: false,
      }),
    ).toBe("ELIMINATED");
  });
});

describe("isTournamentSpectateEligible", () => {
  it("requires live-phase status and table targets", () => {
    expect(
      isTournamentSpectateEligible({
        tournamentStatus: "RUNNING",
        tableId: "table_1",
        roomId: "room_1",
      }),
    ).toBe(true);
    expect(
      isTournamentSpectateEligible({
        tournamentStatus: "FINISHED",
        tableId: "table_1",
        roomId: "room_1",
      }),
    ).toBe(false);
  });
});
