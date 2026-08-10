/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActionBar } from "./ActionBar";
import { getActionContext } from "./actionBar.logic";

function notMyTurnContext() {
  return getActionContext({ isMyTurn: false, actionOptions: undefined, connectionStatus: "CONNECTED" });
}

function myTurnContext() {
  return getActionContext({
    isMyTurn: true,
    actionOptions: {
      canFold: true,
      canCheck: true,
      canCall: false,
      canBet: false,
      canRaise: false,
      canAllIn: true,
      primaryWagerAction: "NONE",
      callAmount: 0,
      minRaiseTo: 0,
      maxRaiseTo: 0,
    },
    connectionStatus: "CONNECTED",
  });
}

describe("ActionBar all-in banner wiring", () => {
  it("shows the ALL-IN banner when hero is all-in and not acting", () => {
    render(
      <ActionBar actionContext={notMyTurnContext()} heroStatus="ALL_IN" onAction={vi.fn()} />,
    );
    expect(screen.getByTestId("all-in-banner")).toBeTruthy();
    expect(screen.queryByTestId("table-status-strip")).toBeNull();
  });

  it("keeps action status out of the HUD for other hero statuses", () => {
    render(
      <ActionBar actionContext={notMyTurnContext()} heroStatus="FOLDED" onAction={vi.fn()} />,
    );
    expect(screen.queryByTestId("all-in-banner")).toBeNull();
    expect(screen.queryByTestId("table-status-strip")).toBeNull();
  });

  it("does not show the ALL-IN banner while the hero still has actions to take", () => {
    render(<ActionBar actionContext={myTurnContext()} heroStatus="ALL_IN" onAction={vi.fn()} />);
    expect(screen.queryByTestId("all-in-banner")).toBeNull();
  });
});
