import { describe, expect, it } from "vitest";
import { SessionPlayerStatsTracker } from "../SessionPlayerStatsTracker.js";

describe("SessionPlayerStatsTracker", () => {
  it("returns undefined when no hands recorded", () => {
    const t = new SessionPlayerStatsTracker();
    expect(t.get("u1")).toBeUndefined();
  });

  it("records dealt-in hand with no VPIP/PFR (fold preflop)", () => {
    const t = new SessionPlayerStatsTracker();
    t.recordHandForUser("u1", { dealtIn: true, vpip: false, pfr: false });
    expect(t.get("u1")).toEqual({ hands: 1, vpipPct: 0, pfrPct: 0 });
  });

  it("records VPIP only (limp)", () => {
    const t = new SessionPlayerStatsTracker();
    t.recordHandForUser("u1", { dealtIn: true, vpip: true, pfr: false });
    expect(t.get("u1")).toEqual({ hands: 1, vpipPct: 100, pfrPct: 0 });
  });

  it("records VPIP and PFR (open raise)", () => {
    const t = new SessionPlayerStatsTracker();
    t.recordHandForUser("u1", { dealtIn: true, vpip: true, pfr: true });
    expect(t.get("u1")).toEqual({ hands: 1, vpipPct: 100, pfrPct: 100 });
  });

  it("accumulates over multiple hands and rounds percentages", () => {
    const t = new SessionPlayerStatsTracker();
    t.recordHandForUser("u1", { dealtIn: true, vpip: false, pfr: false });
    t.recordHandForUser("u1", { dealtIn: true, vpip: true, pfr: false });
    t.recordHandForUser("u1", { dealtIn: true, vpip: true, pfr: true });
    const stats = t.get("u1");
    expect(stats?.hands).toBe(3);
    expect(stats?.vpipPct).toBe(66.7); // 2/3
    expect(stats?.pfrPct).toBe(33.3); // 1/3
  });

  it("ignores dealtIn: false", () => {
    const t = new SessionPlayerStatsTracker();
    t.recordHandForUser("u1", { dealtIn: false, vpip: true, pfr: true });
    expect(t.get("u1")).toBeUndefined();
  });

  it("keeps users separate", () => {
    const t = new SessionPlayerStatsTracker();
    t.recordHandForUser("u1", { dealtIn: true, vpip: true, pfr: false });
    t.recordHandForUser("u2", { dealtIn: true, vpip: true, pfr: true });
    expect(t.get("u1")).toEqual({ hands: 1, vpipPct: 100, pfrPct: 0 });
    expect(t.get("u2")).toEqual({ hands: 1, vpipPct: 100, pfrPct: 100 });
  });
});
