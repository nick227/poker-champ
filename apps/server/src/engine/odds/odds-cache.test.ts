import { describe, it, expect } from "vitest";
import { makeEquityCacheKey } from "./OddsService.js";
import { OddsCache } from "./OddsCache.js";

describe("OddsCache", () => {
  it("evicts oldest entry when exceeding maxEntries", () => {
    const cache = new OddsCache<number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    cache.set("d", 4);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
  });

  it("respects maxEntries of 1", () => {
    const cache = new OddsCache<number>(1);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
  });
});

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
