import { describe, expect, it } from "vitest";
import { createPerClientRateLimiter } from "../perClientRateLimit.js";

describe("createPerClientRateLimiter", () => {
  it("allows up to maxPerWindow requests per window", () => {
    const limiter = createPerClientRateLimiter({ maxPerWindow: 3, windowMs: 1000 });
    expect(limiter.check("c1")).toBe(true);
    expect(limiter.check("c1")).toBe(true);
    expect(limiter.check("c1")).toBe(true);
    expect(limiter.check("c1")).toBe(false);
  });

  it("resets after window expires", async () => {
    const limiter = createPerClientRateLimiter({ maxPerWindow: 2, windowMs: 50 });
    expect(limiter.check("c1")).toBe(true);
    expect(limiter.check("c1")).toBe(true);
    expect(limiter.check("c1")).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(limiter.check("c1")).toBe(true);
  });

  it("tracks clients separately", () => {
    const limiter = createPerClientRateLimiter({ maxPerWindow: 1, windowMs: 1000 });
    expect(limiter.check("c1")).toBe(true);
    expect(limiter.check("c1")).toBe(false);
    expect(limiter.check("c2")).toBe(true);
    expect(limiter.check("c2")).toBe(false);
  });
});
