import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  state,
  prismaMock,
  loggerErrorMock,
  loggerWarnMock,
} = vi.hoisted(() => {
  const state = {
    userAwards: [] as Array<{
      id: string;
      userId: string;
      awardId: string;
      count: number;
      earnedAt: Date;
      lastEarnedAt: Date;
      reason: string;
      contextType: string | null;
      contextId: string | null;
    }>,
    awardGrantEvents: new Set<string>(),
    userHandCounts: new Map<string, number>(),
    uniqueViolationForEvent: false,
    nextId: 1,
  };

  const prismaMock = {
    $transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(prismaMock)),
    $executeRawUnsafe: vi.fn(async (_query: string, _id: string, userId: string) => {
      state.userHandCounts.set(userId, (state.userHandCounts.get(userId) ?? 0) + 1);
      return 1;
    }),
    userAward: {
      findMany: vi.fn(async ({ where, select }: any) => {
        const rows = state.userAwards.filter((r) => r.userId === where.userId);
        return rows.map((r) => {
          if (select?.awardId && select?.id) return { awardId: r.awardId, id: r.id };
          if (select?.awardId) return { awardId: r.awardId };
          return r;
        });
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = {
          id: `ua_${state.nextId++}`,
          userId: data.userId,
          awardId: data.awardId,
          count: data.count,
          earnedAt: data.earnedAt,
          lastEarnedAt: data.lastEarnedAt,
          reason: data.reason,
          contextType: data.contextType,
          contextId: data.contextId,
        };
        state.userAwards.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = state.userAwards.find((r) => r.id === where.id);
        if (!row) throw new Error("missing row");
        if (data.count?.increment != null) row.count += data.count.increment;
        if (data.lastEarnedAt) row.lastEarnedAt = data.lastEarnedAt;
        if (data.reason) row.reason = data.reason;
        row.contextType = data.contextType ?? null;
        row.contextId = data.contextId ?? null;
        return row;
      }),
    },
    awardGrantEvent: {
      create: vi.fn(async ({ data }: any) => {
        if (state.uniqueViolationForEvent) {
          const err = { code: "P2002" };
          throw err;
        }
        const key = `${data.userId}|${data.awardId}|${data.triggerKey}`;
        if (state.awardGrantEvents.has(key)) {
          const err = { code: "P2002" };
          throw err;
        }
        state.awardGrantEvents.add(key);
        return data;
      }),
    },
    userHandCount: {
      findMany: vi.fn(async ({ where }: any) => {
        const ids = where.userId.in as string[];
        return ids
          .filter((id) => state.userHandCounts.has(id))
          .map((id) => ({ userId: id, handsDealt: state.userHandCounts.get(id) ?? 0 }));
      }),
    },
    user: {
      findMany: vi.fn(async ({ where }: any) => {
        const ids = where.id.in as string[];
        return ids.map((id) => ({ id }));
      }),
    },
  };

  return {
    state,
    prismaMock,
    loggerErrorMock: vi.fn(),
    loggerWarnMock: vi.fn(),
  };
});

vi.mock("../db/prisma.js", () => ({
  getPrisma: () => prismaMock,
}));

vi.mock("../lib/logger.js", () => ({
  logger: {
    error: loggerErrorMock,
    warn: loggerWarnMock,
  },
}));

import { AwardService } from "./AwardService.js";

type HandSummary = {
  handId: string;
  reason: "LAST_PLAYER" | "SHOWDOWN" | "DEFENSIVE_FALLBACK";
  potCents: number;
  bigBlindCents: number;
  payoutsByUserId: Record<string, number>;
  allInPlayerIds: string[];
};

function makeHandSummary(overrides: Partial<HandSummary> = {}): HandSummary {
  return {
    handId: "hand_1",
    reason: "SHOWDOWN",
    potCents: 5000,
    bigBlindCents: 100,
    payoutsByUserId: { u1: 5000 },
    allInPlayerIds: [],
    ...overrides,
  };
}

beforeEach(() => {
  state.userAwards.length = 0;
  state.awardGrantEvents.clear();
  state.userHandCounts.clear();
  state.uniqueViolationForEvent = false;
  state.nextId = 1;

  prismaMock.$transaction.mockClear();
  prismaMock.$executeRawUnsafe.mockClear();
  prismaMock.userAward.findMany.mockClear();
  prismaMock.userAward.create.mockClear();
  prismaMock.userAward.update.mockClear();
  prismaMock.awardGrantEvent.create.mockClear();
  prismaMock.user.findMany.mockClear();
  prismaMock.userHandCount.findMany.mockClear();

  loggerErrorMock.mockClear();
  loggerWarnMock.mockClear();
});

describe("AwardService.bulkGrant", () => {
  it("creates ONE_TIME award rows and returns full granted payload", async () => {
    const service = new AwardService();
    const out = await service.bulkGrant("u1", [
      { awardId: "first_win", reason: "Won your first hand", contextType: "HAND", contextId: "h1" },
    ]);

    expect(out.skipped).toEqual([]);
    expect(out.granted).toHaveLength(1);
    expect(out.granted[0]?.awardId).toBe("first_win");
    expect(out.granted[0]?.name).toBe("First Win");
    expect(out.granted[0]?.tier).toBe("COMMON");
    expect(state.userAwards[0]?.count).toBe(1);
  });

  it("skips duplicate ONE_TIME awards already earned", async () => {
    state.userAwards.push({
      id: "ua_existing",
      userId: "u1",
      awardId: "first_win",
      count: 1,
      earnedAt: new Date(),
      lastEarnedAt: new Date(),
      reason: "Won your first hand",
      contextType: "HAND",
      contextId: "h0",
    });

    const service = new AwardService();
    const out = await service.bulkGrant("u1", [
      { awardId: "first_win", reason: "Won your first hand", contextType: "HAND", contextId: "h1" },
    ]);

    expect(out.granted).toHaveLength(0);
    expect(out.skipped).toEqual([]);
    expect(prismaMock.userAward.create).not.toHaveBeenCalled();
  });

  it("skips REPEATABLE trigger awards when idempotency event already exists", async () => {
    state.uniqueViolationForEvent = true;
    const service = new AwardService();
    const out = await service.bulkGrant("u1", [
      { awardId: "win_streak_2", reason: "Won 2 hands in a row", contextType: "HAND", contextId: "h1", triggerKey: "h1" },
    ]);

    expect(out.granted).toHaveLength(0);
    expect(out.skipped).toEqual(["win_streak_2"]);
    expect(prismaMock.userAward.update).not.toHaveBeenCalled();
    expect(prismaMock.userAward.create).not.toHaveBeenCalled();
  });

  it("caps bulk grants to 10 and logs error context", async () => {
    const service = new AwardService();
    const candidates = Array.from({ length: 11 }, (_, i) => ({
      awardId: i % 2 === 0 ? "win_streak_2" : "showdown_win",
      reason: "repeatable",
      contextType: "HAND" as const,
      contextId: `h${i}`,
      triggerKey: `h${i}`,
    }));
    const out = await service.bulkGrant("u1", candidates, { handId: "hand_cap" });

    expect(out.granted).toHaveLength(10);
    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
    expect(loggerErrorMock.mock.calls[0]?.[0]).toMatchObject({
      userId: "u1",
      handId: "hand_cap",
      originalCount: 11,
      cappedTo: 10,
    });
  });

  it("increments existing REPEATABLE rows atomically", async () => {
    state.userAwards.push({
      id: "ua_repeat",
      userId: "u1",
      awardId: "showdown_win",
      count: 2,
      earnedAt: new Date(),
      lastEarnedAt: new Date(),
      reason: "Won at showdown",
      contextType: "HAND",
      contextId: "old",
    });

    const service = new AwardService();
    const out = await service.bulkGrant("u1", [
      { awardId: "showdown_win", reason: "Won at showdown", contextType: "HAND", contextId: "h_new", triggerKey: "h_new" },
    ]);

    expect(out.granted).toHaveLength(1);
    expect(state.userAwards[0]?.count).toBe(3);
    expect(state.userAwards[0]?.contextId).toBe("h_new");
    expect(prismaMock.userAward.update).toHaveBeenCalledTimes(1);
  });
});

describe("AwardService.processHandEndAwards", () => {
  it("returns immediately when no dealt users", async () => {
    const service = new AwardService();

    await service.processHandEndAwards(makeHandSummary(), [], () => ({
      sessionId: "s1",
      sessionHands: 1,
      consecutiveWins: 0,
    }));

    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("processes only existing users and calls bulkGrant with hand context", async () => {
    const service = new AwardService();
    prismaMock.user.findMany.mockResolvedValueOnce([{ id: "u1" }]);
    vi.spyOn(service, "getEarnedAwardIdsAndHandCounts").mockResolvedValueOnce({
      earnedByUserId: new Map([["u1", new Set<string>()]]),
      handsDealtByUserId: new Map([["u1", 0]]),
    });
    const bulkSpy = vi.spyOn(service, "bulkGrant").mockResolvedValue({ granted: [], skipped: [] });

    const getSessionState = vi.fn(() => ({
      sessionId: "session_1",
      sessionHands: 10,
      consecutiveWins: 2,
    }));

    await service.processHandEndAwards(makeHandSummary({ handId: "h99" }), ["u1", "u2"], getSessionState);

    expect(service.getEarnedAwardIdsAndHandCounts).toHaveBeenCalledWith(["u1"]);
    expect(getSessionState).toHaveBeenCalledWith("u1");
    expect(bulkSpy).toHaveBeenCalledTimes(1);
    expect(bulkSpy.mock.calls[0]?.[0]).toBe("u1");
    expect(bulkSpy.mock.calls[0]?.[2]).toEqual({ handId: "h99", incrementHandCount: true });
  });

  it("swallows known prisma missing-table/user errors and warns", async () => {
    const service = new AwardService();
    vi.spyOn(service, "getEarnedAwardIdsAndHandCounts").mockRejectedValueOnce({ code: "P2021" });

    await expect(
      service.processHandEndAwards(makeHandSummary(), ["u1"], () => ({
        sessionId: "s1",
        sessionHands: 1,
        consecutiveWins: 0,
      })),
    ).resolves.toBeUndefined();

    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
  });

  it("rethrows unknown errors", async () => {
    const service = new AwardService();
    vi.spyOn(service, "getEarnedAwardIdsAndHandCounts").mockRejectedValueOnce(new Error("boom"));

    await expect(
      service.processHandEndAwards(makeHandSummary(), ["u1"], () => ({
        sessionId: "s1",
        sessionHands: 1,
        consecutiveWins: 0,
      })),
    ).rejects.toThrow("boom");
  });
});

describe("AwardService.getUserAwards", () => {
  it("applies cursor pagination and returns nextCursor", async () => {
    const service = new AwardService();
    const now = new Date();
    prismaMock.userAward.findMany.mockResolvedValueOnce([
      {
        id: "ua_1",
        awardId: "first_win",
        earnedAt: now,
        lastEarnedAt: now,
        count: 1,
        reason: "r1",
        contextType: "HAND",
        contextId: "h1",
      },
      {
        id: "ua_2",
        awardId: "showdown_win",
        earnedAt: now,
        lastEarnedAt: now,
        count: 1,
        reason: "r2",
        contextType: "HAND",
        contextId: "h2",
      },
    ]);

    const out = await service.getUserAwards("u1", { limit: 1, cursor: "ua_prev" });

    expect(out.items).toHaveLength(1);
    expect(out.items[0].id).toBe("ua_1");
    expect(out.nextCursor).toBe("ua_1");
    expect(prismaMock.userAward.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
        take: 2,
        skip: 1,
        cursor: { id: "ua_prev" },
      }),
    );
  });

  it("caps limit at 100", async () => {
    const service = new AwardService();
    prismaMock.userAward.findMany.mockResolvedValueOnce([]);

    await service.getUserAwards("u1", { limit: 500 });

    expect(prismaMock.userAward.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
        take: 101,
      }),
    );
  });
});
