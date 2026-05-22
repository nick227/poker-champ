import { describe, expect, it } from "vitest";
import {
  MIN_TOURNAMENT_REGISTRATIONS_TO_PROVISION,
  MIN_TOURNAMENT_SEATED_TO_DEAL,
} from "./tournament-table-start.js";

describe("tournament-table-start", () => {
  it("provisions table with one registration; deals with two seated", () => {
    expect(MIN_TOURNAMENT_REGISTRATIONS_TO_PROVISION).toBe(1);
    expect(MIN_TOURNAMENT_SEATED_TO_DEAL).toBe(2);
  });
});
