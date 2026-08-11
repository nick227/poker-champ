import { describe, expect, it } from "vitest";
import {
  buildTournamentResultRevealKey,
  formatFinishPlace,
  getTournamentResultTier,
  shouldShowTournamentResultOverlay,
} from "./tournament-result.utils";

describe("tournament-result.utils", () => {
  it("formats ordinal places", () => {
    expect(formatFinishPlace(1)).toBe("1st");
    expect(formatFinishPlace(2)).toBe("2nd");
    expect(formatFinishPlace(3)).toBe("3rd");
    expect(formatFinishPlace(11)).toBe("11th");
    expect(formatFinishPlace(22)).toBe("22nd");
  });

  it("classifies in-the-money tiers", () => {
    expect(getTournamentResultTier(1, 5000)).toBe("champion");
    expect(getTournamentResultTier(2, 1500)).toBe("podium");
    expect(getTournamentResultTier(4, 0)).toBe("none");
    expect(getTournamentResultTier(null, 100)).toBe("none");
  });

  it("shows overlay when eliminated, winner, or tournament finished", () => {
    expect(shouldShowTournamentResultOverlay({ isEliminated: true }, "RUNNING")).toBe(true);
    expect(shouldShowTournamentResultOverlay({ isWinner: true }, "RUNNING")).toBe(true);
    expect(shouldShowTournamentResultOverlay(undefined, "FINISHED")).toBe(true);
    expect(shouldShowTournamentResultOverlay(undefined, "RUNNING")).toBe(false);
  });

  it("builds stable reveal keys", () => {
    expect(buildTournamentResultRevealKey("t1", 1, 9000)).toBe("t1:1:9000");
  });
});
