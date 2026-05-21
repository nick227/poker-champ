import { describe, expect, it } from "vitest";
import {
  buildTournamentStartIso,
  defaultAdminTournamentStartParts,
  parseDollarsToCents,
  parsePositiveInt,
} from "./admin-tournament-form";

describe("admin-tournament-form", () => {
  it("builds ISO from local date and time", () => {
    const iso = buildTournamentStartIso("2026-05-20", "14:30");
    expect(iso).toBeTruthy();
    const parsed = new Date(iso!);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(4);
    expect(parsed.getDate()).toBe(20);
    expect(parsed.getHours()).toBe(14);
    expect(parsed.getMinutes()).toBe(30);
  });

  it("rejects invalid date/time", () => {
    expect(buildTournamentStartIso("bad", "14:30")).toBeNull();
    expect(buildTournamentStartIso("2026-05-20", "99:99")).toBeNull();
  });

  it("parses dollars to cents", () => {
    expect(parseDollarsToCents("10")).toBe(1000);
    expect(parseDollarsToCents("$25.50")).toBe(2550);
    expect(parseDollarsToCents("0")).toBeNull();
  });

  it("parses bounded integers", () => {
    expect(parsePositiveInt("9", 2, 9)).toBe(9);
    expect(parsePositiveInt("1", 2, 9)).toBeNull();
  });

  it("default start is about one hour ahead", () => {
    const now = new Date("2026-01-15T10:00:00");
    const parts = defaultAdminTournamentStartParts(now);
    const iso = buildTournamentStartIso(parts.date, parts.time)!;
    const diffMs = new Date(iso).getTime() - now.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(59 * 60 * 1000);
    expect(diffMs).toBeLessThanOrEqual(61 * 60 * 1000);
  });
});
