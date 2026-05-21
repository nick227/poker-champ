/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TournamentResultBanner } from "./TournamentResultBanner";

const tournament = {
  tournamentId: "t1",
  status: "RUNNING" as const,
  currentLevel: 1,
  smallBlindCents: 50,
  bigBlindCents: 100,
  anteCents: 0,
};

describe("TournamentResultBanner", () => {
  it("shows eliminated finish place, payout, and CTAs", () => {
    render(
      <TournamentResultBanner
        tournament={tournament}
        tournamentViewer={{ isEliminated: true, finishPlace: 3, payoutCents: 4200 }}
        onViewStandings={() => {}}
        onBackToLobby={() => {}}
      />,
    );
    expect(screen.getByText(/3rd place/i)).toBeTruthy();
    expect(screen.getByText(/\$42/)).toBeTruthy();
    expect(screen.getByText("View standings")).toBeTruthy();
    expect(screen.getByText("Back to lobby")).toBeTruthy();
  });

  it("stays hidden for active seated players while tournament runs", () => {
    const { container } = render(
      <TournamentResultBanner
        tournament={tournament}
        onViewStandings={() => {}}
        onBackToLobby={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
