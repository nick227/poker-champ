import { describe, expect, it } from "vitest";
import {
  MIN_TOURNAMENT_REGISTRATIONS_TO_PROVISION,
  MIN_TOURNAMENT_SEATED_HUMANS_TO_DEAL,
  MIN_TOURNAMENT_SEATED_TO_DEAL,
} from "./tournament-table-start.js";

describe("tournament-table-start", () => {
  it("provisions table with one registration; deals with one human plus an opponent", () => {
    expect(MIN_TOURNAMENT_REGISTRATIONS_TO_PROVISION).toBe(1);
    expect(MIN_TOURNAMENT_SEATED_HUMANS_TO_DEAL).toBe(1);
    expect(MIN_TOURNAMENT_SEATED_TO_DEAL).toBe(2);
  });
});
