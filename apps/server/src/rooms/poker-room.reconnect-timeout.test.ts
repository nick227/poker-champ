import { describe, expect, it } from "vitest";
import { resolveReconnectTimeoutMs } from "./PokerRoom.js";

describe("PokerRoom reconnect timeout resolution", () => {
  it("defaults to 20 minutes when value is missing/invalid", () => {
    expect(resolveReconnectTimeoutMs(undefined)).toBe(20 * 60_000);
    expect(resolveReconnectTimeoutMs("")).toBe(20 * 60_000);
    expect(resolveReconnectTimeoutMs("abc")).toBe(20 * 60_000);
    expect(resolveReconnectTimeoutMs(0)).toBe(20 * 60_000);
    expect(resolveReconnectTimeoutMs(-1)).toBe(20 * 60_000);
  });

  it("clamps configured timeout to at least 20 minutes", () => {
    expect(resolveReconnectTimeoutMs(45_000)).toBe(20 * 60_000);
    expect(resolveReconnectTimeoutMs(60_000)).toBe(20 * 60_000);
    expect(resolveReconnectTimeoutMs(1_200_000)).toBe(1_200_000);
    expect(resolveReconnectTimeoutMs(1_800_000)).toBe(1_800_000);
  });
});

