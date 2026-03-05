import { describe, expect, it } from "vitest";
import {
  LAYOUT_GAME_TOP_BAR_HEIGHT,
  GAME_AREA_HEIGHT,
  HERO_ZONE_HEIGHT,
  ACTION_BAR_HEIGHT,
} from "@/components/domain/table/constants/tableLayout.constants";

/** Snapshot to prevent accidental layout regressions when touching band heights. */
const EXPECTED_TOTAL_FIXED_HEIGHT =
  LAYOUT_GAME_TOP_BAR_HEIGHT +
  GAME_AREA_HEIGHT +
  HERO_ZONE_HEIGHT +
  ACTION_BAR_HEIGHT;

describe("tableLayout.constants", () => {
  it("sum of normal band heights snapshot unchanged (update test if intentionally changed)", () => {
    expect(EXPECTED_TOTAL_FIXED_HEIGHT).toBe(550);
  });
});
