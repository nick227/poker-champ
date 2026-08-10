/**
 * Shell band heights snapshot. Imports from table-layout.constants.ts (hyphen).
 * File name kept as tableLayout.constants.test.ts for historical continuity.
 */
import { describe, expect, it } from "vitest";
import {
  LAYOUT_GAME_TOP_BAR_HEIGHT,
  GAME_AREA_HEIGHT,
  HERO_ZONE_HEIGHT,
} from "./table-layout.constants";
import { ACTION_BAR_HEIGHT } from "../action-bar/ActionBar";

/** Snapshot to prevent accidental layout regressions when touching shell band heights. */
const EXPECTED_TOTAL_FIXED_HEIGHT =
  LAYOUT_GAME_TOP_BAR_HEIGHT +
  GAME_AREA_HEIGHT +
  HERO_ZONE_HEIGHT +
  ACTION_BAR_HEIGHT;

describe("table-layout.constants (shell band heights)", () => {
  it("sum of normal band heights snapshot unchanged (update test if intentionally changed)", () => {
    expect(EXPECTED_TOTAL_FIXED_HEIGHT).toBe(506);
  });
});

