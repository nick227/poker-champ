import { afterEach, describe, expect, it } from "vitest";

import { PokerState } from "../../../state/PokerState.js";
import { PlayerState } from "../../../state/PlayerState.js";
import { PlayerLifecycleService } from "../hand/PlayerLifecycleService.js";
import { TurnAutomationService } from "./TurnAutomationService.js";
import { BotResolver } from "../../bots/BotResolver.js";

function makeHuman(input: {
  id: string;
  seat: number;
  connected: boolean;
  status?: PlayerState["status"];
}) {
  const player = new PlayerState();
  player.id = input.id;
  player.userId = input.id;
  player.name = input.id;
  player.kind = "HUMAN";
  player.seat = input.seat;
  player.connected = input.connected;
  player.status = input.status ?? "ACTIVE";
  player.stackCents = 5_000;
  player.roundBetCents = 0;
  player.committedCents = 0;
  player.needsAction = false;
  return player;
}

describe("auto action cap reconnect boundary", () => {
  const autoActionCapEnv = process.env.AUTO_ACTION_HAND_CAP;

  afterEach(() => {
    process.env.AUTO_ACTION_HAND_CAP = autoActionCapEnv;
  });

  it("reconnect clears prior cap progress and requires a fresh per-hand sequence before abandonment", async () => {
    process.env.AUTO_ACTION_HAND_CAP = "2";

    const state = new PokerState();
    state.tableId = "table_auto_action_cap_reconnect";
    state.maxSeats = 6;
    state.street = "WAITING";
    state.seats.push("u1", "u2", "", "", "", "");

    const autoActionsByUserId = new Map<string, number>();
    const currentHandAutoActedUserIds = new Set<string>();
    const hero = makeHuman({ id: "u1", seat: 0, connected: false });
    const opponent = makeHuman({ id: "u2", seat: 1, connected: true });
    state.playersById.set(hero.id, hero);
    state.playersById.set(opponent.id, opponent);

    const playerLifecycle = new PlayerLifecycleService({
      state,
      persistence: { enabled: false } as any,
      pendingSeatReleaseUserIds: new Set(),
      autoActionsByUserId,
      currentHandAutoActedUserIds,
      getHoleCardsByPlayerId: () => new Map(),
      ensurePlayerPersistence: async () => {},
    });

    const automation = new TurnAutomationService({
      state,
      botResolver: new BotResolver(),
      getHoleCardsByPlayerId: () => new Map(),
      autoActionsByUserId,
      currentHandAutoActedUserIds,
      getHeroActionOptions: () => undefined,
      enqueueAction: () => {},
      getBotDelayMs: () => 0,
    });

    hero.disconnectDeadlineTs = Date.now() + 60_000;
    currentHandAutoActedUserIds.add(hero.id);
    await automation.applyDisconnectedAutoActionCapForHand();

    expect(autoActionsByUserId.has(hero.id)).toBe(false);
    expect(hero.status).toBe("ACTIVE");

    playerLifecycle.markReconnected(hero.id);
    expect(hero.connected).toBe(true);
    expect(hero.disconnectDeadlineTs).toBe(0);
    expect(autoActionsByUserId.has(hero.id)).toBe(false);

    hero.connected = false;
    hero.disconnectDeadlineTs = Date.now() - 1;
    currentHandAutoActedUserIds.clear();
    currentHandAutoActedUserIds.add(hero.id);
    await automation.applyDisconnectedAutoActionCapForHand();

    expect(autoActionsByUserId.get(hero.id)).toBe(1);
    expect(hero.status).toBe("ACTIVE");

    currentHandAutoActedUserIds.clear();
    currentHandAutoActedUserIds.add(hero.id);
    await automation.applyDisconnectedAutoActionCapForHand();

    expect(autoActionsByUserId.get(hero.id)).toBe(2);
    expect(hero.status).toBe("ABANDONED");
  });
});
