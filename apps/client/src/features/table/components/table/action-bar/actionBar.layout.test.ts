import { describe, expect, it } from "vitest";
import { ACTION_BAR_HEIGHT } from "../constants/table-layout.constants";
import { BUTTONS, CONTAINER } from "./layout";

describe("action bar layout contract", () => {
  it("fits primary act row + optional wager input without status chrome", () => {
    const internalPadding = 10;
    const requiredHeight =
      internalPadding + CONTAINER.GAP + BUTTONS.ROW_HEIGHT + BUTTONS.BET_INPUT_ROW_HEIGHT;

    expect(requiredHeight).toBeLessThanOrEqual(ACTION_BAR_HEIGHT);
  });

  it("keeps the desktop HUD to one primary act row band", () => {
    const requiredHeight = 10 + BUTTONS.ROW_HEIGHT;
    expect(requiredHeight).toBeLessThanOrEqual(96);
  });
});
