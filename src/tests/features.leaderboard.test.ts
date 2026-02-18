import { afterEach, describe, expect, it } from "vitest";
import { isLeaderboardEnabled } from "../config/features.js";

describe("leaderboard feature flag", () => {
  const original = process.env.ENABLE_LEADERBOARD;

  afterEach(() => {
    if (original == null) delete process.env.ENABLE_LEADERBOARD;
    else process.env.ENABLE_LEADERBOARD = original;
  });

  it("defaults to enabled when env is missing", () => {
    delete process.env.ENABLE_LEADERBOARD;
    expect(isLeaderboardEnabled()).toBe(true);
  });

  it("enables when env is true", () => {
    process.env.ENABLE_LEADERBOARD = "true";
    expect(isLeaderboardEnabled()).toBe(true);
  });

  it("disables when env is false", () => {
    process.env.ENABLE_LEADERBOARD = "false";
    expect(isLeaderboardEnabled()).toBe(false);
  });
});
