import { describe, expect, it } from "vitest";
import { formatTournamentBotFillSummary, resolveTournamentBotFillTarget } from "./tournament-bot-fill";

describe("tournament-bot-fill", () => {
  it("returns null when bot fill disabled", () => {
    expect(formatTournamentBotFillSummary({ fillBotsAtStart: false, maxPlayers: 6 })).toBeNull();
  });

  it("describes configured bot count", () => {
    const summary = formatTournamentBotFillSummary({
      fillBotsAtStart: true,
      fillBotCount: 5,
      maxPlayers: 6,
      registeredCount: 1,
    });
    expect(summary).toContain("Bot fill:");
    expect(summary).toContain("5");
  });

  it("caps bot target by open seats", () => {
    expect(
      resolveTournamentBotFillTarget({
        fillBotsAtStart: true,
        fillBotCount: 8,
        maxPlayers: 6,
        registeredCount: 4,
      }),
    ).toBe(2);
  });
});
