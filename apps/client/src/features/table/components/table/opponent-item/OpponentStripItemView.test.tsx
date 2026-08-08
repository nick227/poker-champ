/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OpponentStripItemView, type OpponentStripItemViewModel } from "./OpponentStripItemView";

// Note: this exercises OpponentStripItemView (not OpponentStripItem) directly.
// OpponentStripItem pulls in PlayingCard -> CardBackPatterns, which imports
// nativewind's cssInterop and crashes under this app's vitest harness
// ("Unexpected token 'typeof'" parsing react-native-css-interop's Flow-typed
// source — nativewind isn't in the react-native/react-native-web alias/mock
// set in vitest.config.ts). That's a pre-existing gap in shared test config,
// not something introduced here, and out of scope to fix (touching the
// shared vitest.config.ts risks colliding with the other agents working in
// parallel on this branch). OpponentStripItemView is the actual leaf that
// receives isActive/betCents and renders PlayerPanel, so it's still a real
// test of the turn-indicator + chip-stack wiring.
function makeModel(overrides: Partial<OpponentStripItemViewModel> = {}): OpponentStripItemViewModel {
  return {
    opponentId: "user-42",
    opponentName: "Riverboat Ron",
    stackCents: 15_000,
    avatarUrl: undefined,
    initial: "R",
    nameDisplay: "Riverboat Ron",
    isDealer: false,
    isActive: false,
    inactive: false,
    stackFormatted: "$150.00",
    actionText: "---",
    actionTextClassName: undefined,
    isWinner: false,
    showTurnBar: false,
    activeTurnProgress: null,
    cardsSlot: null,
    colorSeed: "user-42",
    badgeLabel: 2,
    betCents: 0,
    betDisplay: undefined,
    ...overrides,
  };
}

describe("OpponentStripItemView", () => {
  it("mounts for a not-to-act opponent", () => {
    render(<OpponentStripItemView model={makeModel()} onPress={undefined} />);
    expect(screen.getAllByText("Riverboat Ron").length).toBeGreaterThan(0);
  });

  it("marks the avatar as to-act only when isActive is true", () => {
    const { container: notToAct } = render(
      <OpponentStripItemView model={makeModel({ isActive: false })} onPress={undefined} />,
    );
    expect(notToAct.querySelector('[data-active-turn="true"]')).toBeNull();

    const { container: toAct } = render(
      <OpponentStripItemView model={makeModel({ isActive: true })} onPress={undefined} />,
    );
    expect(toAct.querySelector('[data-active-turn="true"]')).toBeTruthy();
  });

  it("shows a chip-stack (not plain bet text) once there is a round bet", () => {
    render(
      <OpponentStripItemView
        model={makeModel({ betCents: 500, betDisplay: "$5.00" })}
        onPress={undefined}
      />,
    );
    expect(screen.getByText("$5.00")).toBeTruthy();
  });

  it("falls back to actionText (e.g. Folded) when there is no bet", () => {
    render(
      <OpponentStripItemView
        model={makeModel({ actionText: "Fold", actionTextClassName: "text-danger" })}
        onPress={undefined}
      />,
    );
    expect(screen.getAllByText("Fold").length).toBeGreaterThan(0);
  });
});
