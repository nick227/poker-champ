/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LobbyTabs } from "./LobbyTabs";

describe("LobbyTabs", () => {
  it("renders both tabs and marks the active one selected", () => {
    render(<LobbyTabs active="cash" onChange={() => {}} />);
    expect(screen.getByText("Cash Games")).toBeTruthy();
    expect(screen.getByText("Tournaments")).toBeTruthy();
  });

  it("calls onChange with the tapped tab's key", () => {
    const onChange = vi.fn();
    render(<LobbyTabs active="cash" onChange={onChange} />);
    fireEvent.click(screen.getByText("Tournaments"));
    expect(onChange).toHaveBeenCalledWith("tournaments");
  });

  it("fires onChange when tapping the active tab", () => {
    const onChange = vi.fn();
    render(<LobbyTabs active="cash" onChange={onChange} />);
    fireEvent.click(screen.getByText("Cash Games"));
    expect(onChange).toHaveBeenCalledWith("cash");
  });

  it("appends a badge count to the Tournaments label when provided", () => {
    render(<LobbyTabs active="cash" onChange={() => {}} tournamentsBadgeCount={3} />);
    expect(screen.getByText("Tournaments (3)")).toBeTruthy();
  });

  it("omits the badge when the count is zero", () => {
    render(<LobbyTabs active="cash" onChange={() => {}} tournamentsBadgeCount={0} />);
    expect(screen.getByText("Tournaments")).toBeTruthy();
    expect(screen.queryByText("Tournaments (0)")).toBeNull();
  });
});
