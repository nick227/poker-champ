import { describe, expect, it } from "vitest";
import { MIN_TOURNAMENT_REGISTRATIONS_TO_START } from "./tournament-table-start.js";

describe("tournament-table-start", () => {
  it("requires at least two registrations before spawning a table", () => {
    expect(MIN_TOURNAMENT_REGISTRATIONS_TO_START).toBe(2);
  });
});
