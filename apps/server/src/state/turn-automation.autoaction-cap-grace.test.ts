import { afterEach, describe, expect, it } from "vitest";
import { PokerState } from "./PokerState.js";
import { PlayerState } from "./PlayerState.js";
import { TurnAutomationService } from "../engine/dealer/services/TurnAutomationService.js";
import { BotResolver } from "../engine/bots/BotResolver.js";

function buildService(state: PokerState, autoActionsByUserId: Map<string, number>, autoActed: Set<string>) {
  return new TurnAutomationService({
    state,
    botResolver: new BotResolver(),
    getHoleCardsByPlayerId: () => new Map(),
    autoActionsByUserId,
    currentHandAutoActedUserIds: autoActed,
    getHeroActionOptions: () => undefined,
    enqueueAction: () => undefined,
    getBotDelayMs: () => 0,
  });
}

describe("turn automation auto-action cap grace window", () => {
  const originalCap = process.env.AUTO_ACTION_HAND_CAP;

  afterEach(() => {
    process.env.AUTO_ACTION_HAND_CAP = originalCap;
  });

  it("does not abandon disconnected human while still inside reconnect grace window", async () => {
    process.env.AUTO_ACTION_HAND_CAP = "1";

    const state = new PokerState();
    const player = new PlayerState();
    player.id = "u1";
    player.userId = "u1";
    player.kind = "HUMAN";
    player.status = "ACTIVE";
    player.connected = false;
    player.disconnectDeadlineTs = Date.now() + 10 * 60_000;
    state.playersById.set(player.id, player);

    const autoActionsByUserId = new Map<string, number>();
    const autoActed = new Set<string>(["u1"]);
    const service = buildService(state, autoActionsByUserId, autoActed);

    await service.applyDisconnectedAutoActionCapForHand();

    expect(player.status).toBe("ACTIVE");
    expect(autoActionsByUserId.has("u1")).toBe(false);
  });

  it("abandons disconnected human after reconnect grace window expires", async () => {
    process.env.AUTO_ACTION_HAND_CAP = "1";

    const state = new PokerState();
    const player = new PlayerState();
    player.id = "u1";
    player.userId = "u1";
    player.kind = "HUMAN";
    player.status = "ACTIVE";
    player.connected = false;
    player.disconnectDeadlineTs = Date.now() - 1;
    state.playersById.set(player.id, player);

    const autoActionsByUserId = new Map<string, number>();
    const autoActed = new Set<string>(["u1"]);
    const service = buildService(state, autoActionsByUserId, autoActed);

    await service.applyDisconnectedAutoActionCapForHand();

    expect(player.status).toBe("ABANDONED");
    expect(autoActionsByUserId.get("u1")).toBe(1);
  });
});

