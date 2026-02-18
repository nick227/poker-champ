import { afterEach, describe, expect, it, vi } from "vitest";
import * as prismaDb from "../db/prisma.js";
import { LeaderboardAggregationService } from "../engine/persistence/LeaderboardAggregationService.js";

describe("LeaderboardAggregationService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("floors computedAt to top-of-hour UTC", () => {
    const date = new Date("2026-02-18T14:37:41.123Z");
    const bucket = LeaderboardAggregationService.floorToHourUtc(date);
    expect(bucket.toISOString()).toBe("2026-02-18T14:00:00.000Z");
  });

  it("writes snapshot rows in chunks", async () => {
    const userCount = 1200;
    const userIds = Array.from({ length: userCount }).map((_, i) => `u_${i}`);

    const groupBy = vi
      .fn()
      .mockResolvedValueOnce(
        userIds.map((userId) => ({
          userId,
          _sum: { amountCents: 100 },
        })),
      )
      .mockResolvedValueOnce(
        userIds.map((userId, i) => ({
          userId,
          handId: `h_${i}`,
          _sum: { amountCents: 100 },
        })),
      );

    const findManyUsers = vi.fn().mockResolvedValue(
      userIds.map((id, i) => ({
        id,
        displayName: `User ${i}`,
        username: null,
        email: `u${i}@test.local`,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      })),
    );

    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const createMany = vi.fn().mockResolvedValue({ count: 0 });
    const tx = { leaderboardSnapshot: { deleteMany, createMany } };

    const prismaMock = {
      balanceTransaction: { groupBy },
      user: { findMany: findManyUsers },
      $transaction: async (fn: (tx: typeof tx) => Promise<void>) => fn(tx),
    };

    vi.spyOn(prismaDb, "getPrisma").mockReturnValue(prismaMock as any);

    await LeaderboardAggregationService.recomputeSnapshot(
      "weekly",
      "biggest_winner",
      new Date("2026-02-18T14:00:00.000Z"),
    );

    expect(createMany).toHaveBeenCalledTimes(3);
    expect(createMany.mock.calls[0]?.[0]?.data?.length).toBe(500);
    expect(createMany.mock.calls[1]?.[0]?.data?.length).toBe(500);
    expect(createMany.mock.calls[2]?.[0]?.data?.length).toBe(200);
  });

  it("returns empty snapshot shape when no computedAt exists", async () => {
    const aggregate = vi.fn().mockResolvedValue({ _max: { computedAt: null } });
    const findMany = vi.fn();
    const count = vi.fn();
    vi.spyOn(prismaDb, "getPrisma").mockReturnValue({
      leaderboardSnapshot: { aggregate, findMany, count },
    } as any);

    const result = await LeaderboardAggregationService.readLatestSnapshot({
      period: "weekly",
      category: "biggest_winner",
      limit: 20,
    });

    expect(result).toEqual({ computedAt: null, entries: [], totalEntries: 0 });
    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });
});
