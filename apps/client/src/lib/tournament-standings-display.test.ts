import { describe, expect, it } from "vitest";
import {
  formatTournamentStandingPayout,
  formatTournamentStandingStatus,
  resolveTournamentStandingsPayoutMode,
} from "./tournament-standings-display";
import type { TournamentStandingRow } from "@/services/tournaments.types";

function row(overrides: Partial<TournamentStandingRow>): TournamentStandingRow {
  return {
    userId: "u1",
    displayName: "Player",
    finishPlace: null,
    eliminatedAt: null,
    payoutCents: 0,
    isBot: false,
    ...overrides,
  };
}

describe("tournament-standings-display", () => {
  it("labels no-show, busted, winner, and bot ineligible", () => {
    expect(formatTournamentStandingStatus(row({}))).toBe("No-show");
    expect(formatTournamentStandingStatus(row({ finishPlace: 3, eliminatedAt: "2026-01-01" }))).toBe(
      "Busted",
    );
    expect(formatTournamentStandingStatus(row({ finishPlace: 1 }))).toBe("Winner");
    expect(formatTournamentStandingStatus(row({ isBot: true }))).toBe("Prize ineligible");
  });

  it("shows refunds for terminal non-payout statuses", () => {
    expect(resolveTournamentStandingsPayoutMode("ABANDONED")).toBe("refunds");
    expect(resolveTournamentStandingsPayoutMode("CANCELLED")).toBe("refunds");
    expect(resolveTournamentStandingsPayoutMode("FINISHED")).toBe("prizes");
    expect(formatTournamentStandingPayout(row({}), "refunds")).toBe("Refunded");
    expect(formatTournamentStandingPayout(row({ isBot: true }), "refunds")).toBe("—");
  });
});
