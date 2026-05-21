import { describe, expect, it } from "vitest";
import { getTournamentBotUserId } from "./tournament-bot-users.js";
import { getUserTournamentStats, recordTournamentPlayerResult } from "./tournament-user-stats.js";

describe("tournament user stats", () => {
  it("returns empty stats for tournament bot users", async () => {
    const stats = await getUserTournamentStats(getTournamentBotUserId("chaos_carl"));
    expect(stats).toEqual({
      tournamentsPlayed: 0,
      tournamentWins: 0,
      tournamentCashes: 0,
      tournamentEarningsCents: 0,
    });
  });

  it("does not record stats for tournament bot users", async () => {
    const result = await recordTournamentPlayerResult({
      tournamentId: "nonexistent-tournament",
      userId: getTournamentBotUserId("nash_nate"),
      finishPlace: 1,
      payoutCents: 10_000,
    });
    expect(result.recorded).toBe(false);
    expect(result.statsAfter.tournamentsPlayed).toBe(0);
  });
});
