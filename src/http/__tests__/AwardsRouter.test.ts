import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";

vi.mock("../../engine/auth/RequireAuth.js", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user_test_awards" };
    next();
  },
}));

const getUserAwardsMock = vi.fn(async () => ({
  items: [
    {
      awardId: "lesson_complete_L1",
      name: "Position Pin",
      graphic: "emoji:📍",
      tier: "UNCOMMON",
      tierWeight: 2,
      priorityWeight: 80,
      category: "PROGRESSION",
      reason: "Completed RFI Discipline By Position",
      earnedAt: new Date().toISOString(),
      lastEarnedAt: new Date().toISOString(),
      count: 1,
      contextType: "LESSON",
      contextId: "L01_open_raise_position_6max",
    },
  ],
  nextCursor: null,
}));

vi.mock("../../awards/AwardService.js", () => ({
  awardService: {
    getUserAwards: getUserAwardsMock,
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
});

