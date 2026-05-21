import { describe, expect, it } from "vitest";
import {
  buildTournamentStartIsoFromSchedule,
  defaultTournamentStartSchedule,
  formatSchedulePreview,
} from "./tournament-start-schedule";

describe("tournament-start-schedule", () => {
  it("builds ISO from 12-hour schedule", () => {
    const iso = buildTournamentStartIsoFromSchedule({
      dateYmd: "2026-05-20",
      hour12: 2,
      minute: 30,
      meridiem: "PM",
    });
    expect(iso).toBeTruthy();
    const parsed = new Date(iso!);
    expect(parsed.getHours()).toBe(14);
    expect(parsed.getMinutes()).toBe(30);
  });

  it("handles 12 AM and 12 PM", () => {
    const noon = buildTournamentStartIsoFromSchedule({
      dateYmd: "2026-05-20",
      hour12: 12,
      minute: 0,
      meridiem: "PM",
    });
    expect(new Date(noon!).getHours()).toBe(12);

    const midnight = buildTournamentStartIsoFromSchedule({
      dateYmd: "2026-05-20",
      hour12: 12,
      minute: 0,
      meridiem: "AM",
    });
    expect(new Date(midnight!).getHours()).toBe(0);
  });

  it("preview includes am/pm", () => {
    const preview = formatSchedulePreview({
      dateYmd: "2026-06-15",
      hour12: 6,
      minute: 30,
      meridiem: "PM",
    });
    expect(preview).toMatch(/(AM|PM|am|pm)/);
  });

  it("default start is about one hour ahead", () => {
    const now = new Date("2026-01-15T10:00:00");
    const schedule = defaultTournamentStartSchedule(now);
    const iso = buildTournamentStartIsoFromSchedule(schedule)!;
    const diffMs = new Date(iso).getTime() - now.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(59 * 60 * 1000);
    expect(diffMs).toBeLessThanOrEqual(61 * 60 * 1000);
  });
});
