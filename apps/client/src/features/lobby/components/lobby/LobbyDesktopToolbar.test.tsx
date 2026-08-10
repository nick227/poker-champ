/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LobbyDesktopToolbar } from "./LobbyDesktopToolbar";
import { DEFAULT_LOBBY_FILTERS } from "../../lobbyTableFilters";

describe("LobbyDesktopToolbar mode chips", () => {
  it("renders All / Cash / Tournaments chips", () => {
    render(
      <LobbyDesktopToolbar
        mode="all"
        onModeChange={() => {}}
        filters={DEFAULT_LOBBY_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.getByText("Cash")).toBeTruthy();
    expect(screen.getByText("Tournaments")).toBeTruthy();
  });

  it("calls onModeChange when a mode chip is pressed", () => {
    const onModeChange = vi.fn();
    render(
      <LobbyDesktopToolbar
        mode="all"
        onModeChange={onModeChange}
        filters={DEFAULT_LOBBY_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Cash"));
    expect(onModeChange).toHaveBeenCalledWith("cash");
  });

  it("appends joined tournament count on the Tournaments chip", () => {
    render(
      <LobbyDesktopToolbar
        mode="all"
        onModeChange={() => {}}
        tournamentsBadgeCount={2}
        filters={DEFAULT_LOBBY_FILTERS}
        onFiltersChange={() => {}}
      />,
    );
    expect(screen.getByText("Tournaments (2)")).toBeTruthy();
  });
});
