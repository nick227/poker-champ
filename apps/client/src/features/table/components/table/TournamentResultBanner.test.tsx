/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
  it("opens in-the-money reveal for podium finish", () => {
    render(
      <TournamentResultBanner
        tournament={tournament}
        tournamentViewer={{ isEliminated: true, finishPlace: 3, payoutCents: 4200 }}
        onViewStandings={() => {}}
        onBackToLobby={() => {}}
      />,
    );
    expect(screen.getByText("IN THE MONEY")).toBeTruthy();
    expect(screen.getByText(/3rd place/i)).toBeTruthy();
    expect(screen.getByText(/\$42/)).toBeTruthy();
  });

  it("shows champion reveal for seated winner with isWinner flag", () => {
    render(
      <TournamentResultBanner
        tournament={{ ...tournament, status: "FINISHED", playFormat: "FREEZEOUT" }}
        tournamentViewer={{ isEliminated: false, isWinner: true, finishPlace: 1, payoutCents: 10_000 }}
        onViewStandings={() => {}}
        onBackToLobby={() => {}}
      />,
    );
    expect(screen.getByText("CHAMPION")).toBeTruthy();
    expect(screen.getByText(/1st place/i)).toBeTruthy();
    expect(screen.getByText(/\$100/)).toBeTruthy();
  });

  it("shows freezeout elimination copy for busted player", () => {
    render(
      <TournamentResultBanner
        tournament={{ ...tournament, playFormat: "FREEZEOUT" }}
        tournamentViewer={{ isEliminated: true, finishPlace: 2, payoutCents: 0 }}
        onViewStandings={() => {}}
        onBackToLobby={() => {}}
      />,
    );
    expect(
      screen.getByText("You were eliminated. This is a freezeout — you cannot re-enter."),
    ).toBeTruthy();
  });

  it("collapses reveal to compact banner after dismiss", () => {
    render(
      <TournamentResultBanner
        tournament={tournament}
        tournamentViewer={{ isEliminated: true, finishPlace: 2, payoutCents: 3000 }}
        onViewStandings={() => {}}
        onBackToLobby={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Keep watching"));
    expect(screen.queryByText("IN THE MONEY")).toBeNull();
    expect(screen.getByText("In the money")).toBeTruthy();
    expect(
      screen.getByText("You were eliminated. This is a freezeout — you cannot re-enter."),
    ).toBeTruthy();
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

  it("shows plain banner when eliminated out of the money", () => {
    render(
      <TournamentResultBanner
        tournament={tournament}
        tournamentViewer={{ isEliminated: true, finishPlace: 8, payoutCents: 0 }}
        onViewStandings={() => {}}
        onBackToLobby={() => {}}
      />,
    );
    expect(screen.queryByText("IN THE MONEY")).toBeNull();
    expect(
      screen.getByText("You were eliminated. This is a freezeout — you cannot re-enter."),
    ).toBeTruthy();
    expect(screen.getByText(/Spectating/i)).toBeTruthy();
  });
});
