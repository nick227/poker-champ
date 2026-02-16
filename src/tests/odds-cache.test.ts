import { describe, it, expect } from "vitest";
import { makeEquityCacheKey } from "../engine/odds/OddsService.js";

describe("makeEquityCacheKey", () => {
  it("is deterministic regardless of player array order", () => {
    const handId = "h1";
    const street = "FLOP";
    const board = ["Ah","Kd","2c"];
    const a = { id: "B", cards: ["Qs","Qd"] };
    const b = { id: "A", cards: ["Jh","Jc"] };

    const k1 = makeEquityCacheKey(handId, street, board, [a, b]);
    const k2 = makeEquityCacheKey(handId, street, board, [b, a]);

    expect(k1).toBe(k2);
  });
});
