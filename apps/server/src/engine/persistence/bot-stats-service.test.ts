import { describe, expect, it, vi } from "vitest";
import { BotStatsService } from "./BotStatsService.js";

describe("BotStatsService", () => {
  it("upserts one row per dealt bot with expected counters", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const service = new BotStatsService({ botStats: { upsert } } as any);

    await service.recordHandResult({
      handId: "hand_1",
      dealtBotIds: ["nash_nate", "loose_lucy"],
      deltaByBotId: {
        nash_nate: 250,
        loose_lucy: -100,
      },
    });

    expect(upsert).toHaveBeenCalledTimes(2);

    const first = upsert.mock.calls[0]?.[0];
    const second = upsert.mock.calls[1]?.[0];

    const calls = [first, second];
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          where: { botId: "nash_nate" },
          create: expect.objectContaining({
            handsPlayed: 1,
            netCents: BigInt(250),
            grossWonCents: BigInt(250),
            grossLostCents: BigInt(0),
          }),
          update: expect.objectContaining({
            handsPlayed: { increment: 1 },
            netCents: { increment: BigInt(250) },
            grossWonCents: { increment: BigInt(250) },
            grossLostCents: { increment: BigInt(0) },
          }),
        }),
        expect.objectContaining({
          where: { botId: "loose_lucy" },
          create: expect.objectContaining({
            handsPlayed: 1,
            netCents: BigInt(-100),
            grossWonCents: BigInt(0),
            grossLostCents: BigInt(100),
          }),
          update: expect.objectContaining({
            handsPlayed: { increment: 1 },
            netCents: { increment: BigInt(-100) },
            grossWonCents: { increment: BigInt(0) },
            grossLostCents: { increment: BigInt(100) },
          }),
        }),
      ]),
    );
  });

  it("deduplicates dealtBotIds and no-ops when empty", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const service = new BotStatsService({ botStats: { upsert } } as any);

    await service.recordHandResult({
      handId: "hand_2",
      dealtBotIds: ["nash_nate", "nash_nate"],
      deltaByBotId: { nash_nate: 0 },
    });
    expect(upsert).toHaveBeenCalledTimes(1);

    await service.recordHandResult({
      handId: "hand_3",
      dealtBotIds: [],
      deltaByBotId: {},
    });
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

