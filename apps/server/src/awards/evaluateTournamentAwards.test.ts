import { describe, expect, it } from "vitest";
import { evaluateTournamentAwards } from "./evaluateTournamentAwards.js";

describe("evaluateTournamentAwards", () => {
  const base = {
    tournamentId: "t1",
    tournamentName: "Friday MTT",
    finishPlace: 1,
    payoutCents: 5000,
    tournamentsPlayedAfter: 1,
  };

  it("grants first tournament, winner, and paid finish on first win", () => {
    const candidates = evaluateTournamentAwards(base, new Set());
    expect(candidates.map((c) => c.awardId).sort()).toEqual(
      ["first_tournament_played", "tournament_paid_finish", "tournament_winner"].sort(),
    );
    expect(candidates.find((c) => c.awardId === "tournament_winner")?.triggerKey).toBe("tournament_win_t1");
    expect(candidates.find((c) => c.awardId === "tournament_paid_finish")?.triggerKey).toBe("tournament_cash_t1");
  });

  it("skips first tournament when already earned", () => {
    const candidates = evaluateTournamentAwards(
      { ...base, tournamentsPlayedAfter: 2, finishPlace: 2, payoutCents: 1500 },
      new Set(["first_tournament_played"]),
    );
    expect(candidates.map((c) => c.awardId)).toEqual(["tournament_paid_finish"]);
  });

  it("omits paid finish when payout is zero", () => {
    const candidates = evaluateTournamentAwards(
      { ...base, payoutCents: 0, finishPlace: 3 },
      new Set(["first_tournament_played"]),
    );
    expect(candidates.map((c) => c.awardId)).toEqual([]);
  });
});
