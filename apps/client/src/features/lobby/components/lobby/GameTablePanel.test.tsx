/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import { GameTablePanel } from "./GameTablePanel";

function baseTable(overrides: Partial<LobbyTableRow> = {}): LobbyTableRow {
  return {
    id: "t1",
    tableId: "t1",
    roomId: "r1",
    name: "Table One",
    smallBlindCents: 100,
    bigBlindCents: 200,
    players: 1,
    seats: 6,
    minBuyInCents: 2000,
    maxBuyInCents: 20000,
    creatorId: "u1",
    creatorName: "Nico",
    creatorAvatarUrl: null,
    updatedAt: new Date().toISOString(),
    connectedHumanCount: 1,
    ...overrides,
  };
}

const noop = () => {};

describe("GameTablePanel", () => {
  it("renders the derived seats tag and Open status for a lightly seated table", () => {
    render(
      <GameTablePanel table={baseTable({ players: 1, seats: 6 })} balanceCents={100000} onJoin={noop} />,
    );
    expect(screen.getByText("Table One")).toBeTruthy();
    expect(screen.getByText("6-Max")).toBeTruthy();
    expect(screen.getByText("Open")).toBeTruthy();
  });

  it("shows Almost Full once occupancy crosses 3/4", () => {
    render(
      <GameTablePanel table={baseTable({ players: 5, seats: 6 })} balanceCents={100000} onJoin={noop} />,
    );
    expect(screen.getByText("Almost Full")).toBeTruthy();
  });

  it("shows the insufficient-balance join hint when balance is below min buy-in", () => {
    render(
      <GameTablePanel
        table={baseTable({ minBuyInCents: 5000 })}
        balanceCents={1000}
        onJoin={noop}
      />,
    );
    expect(screen.getByText("Insufficient balance for min buy-in")).toBeTruthy();
  });

  it("calls onJoin when the join button is pressed", () => {
    const onJoin = vi.fn();
    render(<GameTablePanel table={baseTable()} balanceCents={100000} onJoin={onJoin} />);
    screen.getByText("Join Table").click();
    expect(onJoin).toHaveBeenCalled();
  });

  it("shows delete affordance only for the creator when no humans are seated", () => {
    const onDelete = vi.fn();
    const { rerender } = render(
      <GameTablePanel
        table={baseTable({ creatorId: "u1", connectedHumanCount: 0 })}
        balanceCents={100000}
        onJoin={noop}
        onDelete={onDelete}
        currentUserId="u1"
      />,
    );
    expect(screen.getByText("🗑️")).toBeTruthy();

    rerender(
      <GameTablePanel
        table={baseTable({ creatorId: "u1", connectedHumanCount: 0 })}
        balanceCents={100000}
        onJoin={noop}
        onDelete={onDelete}
        currentUserId="someone-else"
      />,
    );
    expect(screen.queryByText("🗑️")).toBeNull();
  });
});
