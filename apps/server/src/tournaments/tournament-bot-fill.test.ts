import { describe, expect, it } from "vitest";
import { resolveTournamentBotFillCount } from "./tournament-bot-fill.js";

describe("resolveTournamentBotFillCount", () => {
  it("returns zero when table is full", () => {
    expect(
      resolveTournamentBotFillCount({
        maxPlayers: 6,
        registrationCount: 6,
        humanCount: 1,
        fillBotCount: 5,
      }),
    ).toBe(0);
  });

  it("defaults to filling open seats up to max minus humans", () => {
    expect(
      resolveTournamentBotFillCount({
        maxPlayers: 6,
        registrationCount: 1,
        humanCount: 1,
        fillBotCount: null,
      }),
    ).toBe(5);
  });

  it("respects explicit fillBotCount", () => {
    expect(
      resolveTournamentBotFillCount({
        maxPlayers: 9,
        registrationCount: 2,
        humanCount: 2,
        fillBotCount: 3,
      }),
    ).toBe(3);
  });
});
