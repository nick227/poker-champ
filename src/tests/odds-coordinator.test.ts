import { describe, it, expect } from "vitest";
import { OddsCoordinator } from "../engine/odds/OddsCoordinator.js";

describe("OddsCoordinator", () => {
  it("returns same key for same inputs and caches results", async () => {
    const oc = new OddsCoordinator(200);

    const params = {
      handId: "h1",
      street: "FLOP",
      board: ["Ah", "Kd", "2c"],
      players: [
        { id: "A", cards: ["Jh", "Jc"] },
        { id: "B", cards: ["Qs", "Qd"] }
      ]
    };

    const r1 = await oc.getEquity(params);
    const r2 = await oc.getEquity(params);

    expect(r1.key).toBe(r2.key);
    expect(r1.equity.equitiesPct.length).toBe(2);
    expect(r2.equity.equitiesPct.length).toBe(2);
  });

  it("supports synchronous cached equity lookup", () => {
    const oc = new OddsCoordinator(200);

    const params = {
      handId: "h_sync",
      street: "TURN",
      board: ["Ah", "Kd", "2c", "9s"],
      players: [
        { id: "A", cards: ["Jh", "Jc"] },
        { id: "B", cards: ["Qs", "Qd"] }
      ]
    };

    const r1 = oc.getEquitySync(params);
    const r2 = oc.getEquitySync(params);

    expect(r1.key).toBe(r2.key);
    expect(r1.equity.equitiesPct.length).toBe(2);
    expect(r2.equity.equitiesPct.length).toBe(2);
  });
});
