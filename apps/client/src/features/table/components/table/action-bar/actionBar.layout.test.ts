import { describe, expect, it } from "vitest";
import { ACTION_BAR_HEIGHT } from "../constants/table-layout.constants";
import { BUTTONS, CONTAINER } from "./layout";

describe("action bar layout contract", () => {
  it("fits sizing row + act row inside ACTION_BAR_HEIGHT", () => {
    const internalPadding = 10;
    const requiredHeight =
      internalPadding +
      CONTAINER.GAP +
      BUTTONS.CHIPS_ROW_HEIGHT +
      BUTTONS.ROW_HEIGHT;

    expect(requiredHeight).toBeLessThanOrEqual(ACTION_BAR_HEIGHT);
  });

  it("keeps the same two-row stack on all widths (sizing above acts)", () => {
    const requiredHeight =
      10 + CONTAINER.GAP + BUTTONS.BET_INPUT_ROW_HEIGHT + BUTTONS.ROW_HEIGHT;
    expect(requiredHeight).toBeLessThanOrEqual(ACTION_BAR_HEIGHT);
  });
});
