import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";

type UserAwardServiceRow = {
  awardId: string;
  earnedAt: string;
  lastEarnedAt: string;
  count: number;
  reason: string;
  contextType: string | null;
  contextId: string | null;
};

type UserAwardsServiceResult = {
  items: UserAwardServiceRow[];
  nextCursor: string | null;
};

function makeServiceResult(items: UserAwardServiceRow[], nextCursor: string | null = null): UserAwardsServiceResult {
  return { items, nextCursor };
}

const { getUserAwardsMock, loggerWarnMock } = vi.hoisted(() => ({
  getUserAwardsMock: vi.fn(async () =>
    makeServiceResult([
      {
        awardId: "lesson_complete_L1",
        reason: "Completed RFI Discipline By Position",
        earnedAt: new Date().toISOString(),
        lastEarnedAt: new Date().toISOString(),
        count: 1,
        contextType: "LESSON",
        contextId: "L01_open_raise_position_6max",
      },
    ])),
  loggerWarnMock: vi.fn(),
}));

vi.mock("../../engine/auth/RequireAuth.js", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user_test_awards" };
    next();
  },
}));

vi.mock("../../awards/AwardService.js", () => ({
  awardService: {
    getUserAwards: getUserAwardsMock,
  },
}));

vi.mock("../../lib/logger.js", () => ({
  logger: {
    warn: loggerWarnMock,
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { awardsRouter } from "../AwardsRouter.js";

const app = express();
app.use(express.json());
app.use("/api/awards", awardsRouter);

describe("AwardsRouter", () => {
  let server: http.Server;
  let baseUrl: string;

  async function get(path: string) {
    return fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: { Authorization: "Bearer test" },
    });
  }

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  beforeEach(() => {
    getUserAwardsMock.mockClear();
    loggerWarnMock.mockClear();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("serves GET /api/awards/me with joined award items", async () => {
    const res = await get("/api/awards/me");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items[0]?.awardId).toBe("lesson_complete_L1");
    expect(body.items[0]?.name).toBe("Position Pin");
    expect(body.items[0]?.tier).toBe("UNCOMMON");
  });

  it("passes cursor to service and returns nextCursor", async () => {
    getUserAwardsMock.mockResolvedValueOnce(
      makeServiceResult(
        [
        {
          awardId: "lesson_complete_L1",
          earnedAt: new Date().toISOString(),
          lastEarnedAt: new Date().toISOString(),
          count: 1,
          reason: "Completed RFI Discipline By Position",
          contextType: "LESSON",
          contextId: "L01_open_raise_position_6max",
        },
      ],
      "cursor_next_1",
      ),
    );

    const res = await get("/api/awards/me?limit=1&cursor=cursor_in_1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nextCursor).toBe("cursor_next_1");
    expect(getUserAwardsMock).toHaveBeenCalledWith("user_test_awards", { limit: 1, cursor: "cursor_in_1" });
  });

  it("skips unknown awards, warns, and sorts by tier then priority", async () => {
    getUserAwardsMock.mockResolvedValueOnce(
      makeServiceResult([
        {
          awardId: "missing_award",
          earnedAt: new Date("2026-03-04T12:00:00.000Z").toISOString(),
          lastEarnedAt: new Date("2026-03-04T12:00:00.000Z").toISOString(),
          count: 1,
          reason: "Missing",
          contextType: null,
          contextId: null,
        },
        {
          awardId: "first_lesson_ever",
          earnedAt: new Date("2026-03-01T12:00:00.000Z").toISOString(),
          lastEarnedAt: new Date("2026-03-01T12:00:00.000Z").toISOString(),
          count: 1,
          reason: "First",
          contextType: "LESSON",
          contextId: "L01",
        },
        {
          awardId: "curriculum_done",
          earnedAt: new Date("2026-03-02T12:00:00.000Z").toISOString(),
          lastEarnedAt: new Date("2026-03-02T12:00:00.000Z").toISOString(),
          count: 1,
          reason: "Curriculum",
          contextType: "LESSON",
          contextId: "L12",
        },
      ]),
    );

    const res = await get("/api/awards/me");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.items).toHaveLength(2);
    expect(body.items[0].awardId).toBe("curriculum_done");
    expect(body.items[1].awardId).toBe("first_lesson_ever");
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock.mock.calls[0]?.[0]).toMatchObject({
      userId: "user_test_awards",
      awardId: "missing_award",
    });
  });
});
