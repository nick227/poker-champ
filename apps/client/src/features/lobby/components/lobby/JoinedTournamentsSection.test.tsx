/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TournamentSummary } from "@/services/tournaments.types";
import { JoinedTournamentsSection } from "./JoinedTournamentsSection";

vi.mock("@/hooks/useNowMs", () => ({
  useNowMs: () => Date.now(),
}));

function baseTournament(overrides: Partial<TournamentSummary>): TournamentSummary {
  return {
    id: "t1",
    name: "Test",
    status: "REGISTERING",
    entryFeeCents: 1000,
    prizePoolCents: 0,
    startTime: new Date(Date.now() + 3600_000).toISOString(),
    maxPlayers: 6,
    startingStackCents: 10000,
    blindStructureId: "standard_8min",
    lateRegMinutes: 16,
    currentLevel: 1,
    registeredCount: 1,
    fillBotsAtStart: false,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

const noop = () => {};

describe("JoinedTournamentsSection", () => {
  it("renders only joined active tournaments, not FINISHED or ABANDONED", () => {
    render(
      <JoinedTournamentsSection
        authenticated
        tournaments={[
          baseTournament({ id: "live", name: "Live Event", isRegistered: true, status: "RUNNING" }),
          baseTournament({
            id: "done",
            name: "Finished Event",
            isRegistered: true,
            status: "FINISHED",
            playerStatus: "ELIMINATED",
          }),
          baseTournament({
            id: "gone",
            name: "Abandoned Event",
            isRegistered: true,
            status: "ABANDONED",
          }),
        ]}
        onTournamentAction={noop}
        onOpenTournamentDetail={noop}
      />,
    );

    expect(screen.getByText("Your tournaments")).toBeTruthy();
    expect(screen.getByText("Live Event")).toBeTruthy();
    expect(screen.queryByText("Finished Event")).toBeNull();
    expect(screen.queryByText("Abandoned Event")).toBeNull();
  });

  it("renders nothing when unauthenticated", () => {
    const { container } = render(
      <JoinedTournamentsSection
        authenticated={false}
        tournaments={[baseTournament({ id: "live", isRegistered: true, status: "RUNNING" })]}
        onTournamentAction={noop}
        onOpenTournamentDetail={noop}
      />,
    );
    expect(container.textContent).toBe("");
  });
});
