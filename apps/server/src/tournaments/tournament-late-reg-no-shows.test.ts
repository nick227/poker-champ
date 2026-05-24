import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@poker-champ/db", () => ({
  getPrisma: () => ({
    tournamentRegistration: {
      findMany: mocks.findMany,
      count: mocks.count,
      update: mocks.update,
    },
  }),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { eliminateLateRegistrationNoShows } from "./tournament-late-reg-no-shows.js";

describe("eliminateLateRegistrationNoShows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("eliminates registered humans not in the seated set", async () => {
    mocks.findMany.mockResolvedValue([
      { userId: "human_seated" },
      { userId: "human_absent" },
    ]);
    mocks.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    mocks.update.mockResolvedValue({});

    const eliminated = await eliminateLateRegistrationNoShows(
      "tourney_1",
      new Set(["human_seated"]),
      new Date("2026-06-01T19:00:00.000Z"),
    );

    expect(eliminated).toEqual(["human_absent"]);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { tournamentId_userId: { tournamentId: "tourney_1", userId: "human_absent" } },
      data: {
        finishPlace: 2,
        eliminatedAt: new Date("2026-06-01T19:00:00.000Z"),
      },
    });
  });

  it("skips rebuy-pending and already seated humans", async () => {
    mocks.findMany.mockResolvedValue([{ userId: "human_seated" }]);

    const eliminated = await eliminateLateRegistrationNoShows(
      "tourney_1",
      new Set(["human_seated", "human_rebuy_pending"]),
    );

    expect(eliminated).toEqual([]);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
