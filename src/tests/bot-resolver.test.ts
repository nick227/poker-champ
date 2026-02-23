import { afterEach, describe, expect, it, vi } from "vitest";
import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import { PlayerState } from "../state/PlayerState.js";
import { BotResolver } from "../engine/bots/BotResolver.js";
import { RandomBotBrain } from "../engine/bots/BotBrain.js";
import { TightAggressiveBrain } from "../engine/bots/brains/tight_aggressive/TightAggressiveBrain.js";
import { logger } from "../lib/logger.js";

function makeOptions(overrides: Partial<HeroActionOptions> = {}): HeroActionOptions {
  return {
    canFold: true,
    canCheck: false,
    canCall: false,
    canBet: false,
    canRaise: false,
    canAllIn: false,
    primaryWagerAction: "NONE",
    callAmount: 0,
    ...overrides,
  };
}

describe("BotResolver", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clamps illegal brain output before returning action", () => {
    const player = new PlayerState();
    player.id = "bot_runtime_1";
    player.kind = "BOT";
    player.botId = "chaos_carl";

    const brainSpy = vi.spyOn(RandomBotBrain.prototype, "pickAction").mockReturnValue({ action: "RAISE", amountCents: 50_000 });
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    const resolver = new BotResolver();
    const result = resolver.pickAction(player, {
      heroActionOptions: makeOptions({ canCheck: true }),
      handSnapshot: { street: "PREFLOP", potCents: 300, roundCurrentBetCents: 100, board: [] },
      seatSnapshot: { stackCents: 5_000, roundBetCents: 0, seat: 0 },
    });

    expect(result).toEqual({ action: "CHECK" });
    expect(brainSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls.some((call) => call.includes("BOT_ACTION_CLAMPED"))).toBe(true);
  });

  it("passes through legal brain output unchanged", () => {
    const player = new PlayerState();
    player.id = "bot_runtime_2";
    player.kind = "BOT";
    player.botId = "chaos_carl";

    vi.spyOn(RandomBotBrain.prototype, "pickAction").mockReturnValue({ action: "CALL" });
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    const resolver = new BotResolver();
    const result = resolver.pickAction(player, {
      heroActionOptions: makeOptions({ canCall: true }),
      handSnapshot: { street: "TURN", potCents: 2_000, roundCurrentBetCents: 400, board: ["As", "Kd", "7h", "2c"] },
      seatSnapshot: { stackCents: 10_000, roundBetCents: 0, seat: 2 },
    });

    expect(result).toEqual({ action: "CALL" });
    expect(warnSpy.mock.calls.some((call) => call.includes("BOT_ACTION_CLAMPED"))).toBe(false);
  });

  it("routes nash_nate to tight_aggressive_v1 brain path", () => {
    const player = new PlayerState();
    player.id = "bot_runtime_3";
    player.kind = "BOT";
    player.botId = "nash_nate";

    const taSpy = vi.spyOn(TightAggressiveBrain.prototype, "pickAction").mockReturnValue({ action: "CHECK" });

    const resolver = new BotResolver();
    const result = resolver.pickAction(player, {
      heroActionOptions: makeOptions({ canCheck: true }),
      handSnapshot: { street: "PREFLOP", potCents: 300, roundCurrentBetCents: 100, board: [] },
      seatSnapshot: { stackCents: 5_000, roundBetCents: 100, seat: 4 },
    });

    expect(result).toEqual({ action: "CHECK" });
    expect(taSpy).toHaveBeenCalledOnce();
  });
});
