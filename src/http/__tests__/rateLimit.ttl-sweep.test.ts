import { describe, expect, it, vi } from "vitest";
import { createIpRateLimit } from "../middleware/rateLimit.js";

type Limiter = ReturnType<typeof createIpRateLimit> & { getBucketCount?: () => number };

function mockReqRes(ip: string) {
  const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
  const req = { ip, socket: { remoteAddress: ip } };
  return { req, res, next: vi.fn() };
}

describe("createIpRateLimit TTL sweep", () => {
  it("removes stale buckets after window expires so map size stays bounded", async () => {
    const limiter = createIpRateLimit({ maxRequests: 10, windowMs: 50 }) as Limiter;
    const { req: r1, res: res1, next: next1 } = mockReqRes("1.2.3.4");
    const { req: r2, res: res2, next: next2 } = mockReqRes("5.6.7.8");

    limiter(r1 as never, res1 as never, next1);
    limiter(r2 as never, res2 as never, next2);
    expect(next1).toHaveBeenCalled();
    expect(next2).toHaveBeenCalled();
    expect(limiter.getBucketCount?.()).toBe(2);

    await new Promise((r) => setTimeout(r, 60));

    const { req: r3, res: res3, next: next3 } = mockReqRes("9.10.11.12");
    limiter(r3 as never, res3 as never, next3);
    expect(next3).toHaveBeenCalled();

    expect(limiter.getBucketCount?.()).toBe(1);
  });
});
