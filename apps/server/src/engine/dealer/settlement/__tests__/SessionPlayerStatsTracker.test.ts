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

  it("getSessionId returns same id for user across hands, empty for unknown", () => {
    const t = new SessionPlayerStatsTracker();
    expect(t.getSessionId("u1")).toBe("");
    t.recordHandForUser("u1", { dealtIn: true, vpip: false, pfr: false });
    const id1 = t.getSessionId("u1");
    expect(id1).not.toBe("");
    t.recordHandForUser("u1", { dealtIn: true, vpip: true, pfr: false });
    expect(t.getSessionId("u1")).toBe(id1);
    expect(t.getSessionId("u2")).toBe("");
  });

  it("getSessionId is new after resetUser and next recordHandForUser", () => {
    const t = new SessionPlayerStatsTracker();
    t.recordHandForUser("u1", { dealtIn: true, vpip: false, pfr: false });
    const idBefore = t.getSessionId("u1");
    t.resetUser("u1");
    expect(t.getSessionId("u1")).toBe("");
    t.recordHandForUser("u1", { dealtIn: true, vpip: false, pfr: false });
    const idAfter = t.getSessionId("u1");
    expect(idAfter).not.toBe("");
    expect(idAfter).not.toBe(idBefore);
  });
});
