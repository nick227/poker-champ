import { describe, it, expect, vi } from "vitest";
import { Dealer } from "../engine/Dealer.js";
import { PokerRoom } from "./PokerRoom.js";
import { PlayerState } from "../state/PlayerState.js";
import { PokerState } from "../state/PokerState.js";

/**
 * Covers the SITTING_OUT_AND_TABLE_COUNT_PROPOSAL.md contract:
 *  - connectedHumanCount reflects the binding map (client<->userId), not PlayerState.connected.
 *  - It is refreshed on join/leave/disconnect/reconnect via updateMetadataCountsInternal().
 *  - Table delete is gated on connectedHumanCount === 0, so tables with only sitting-out
 *    (seated-but-disconnected) humans can still be deleted.
 *  - Bots are cleared once humanCount === 0 (zero seated humans), for every removal path
 *    (consented leave, abandon/removePlayer, admin kick) — but never merely because a human
 *    is temporarily disconnected while still seated.
 */

function makeHuman(params: { id: string; seat: number; status?: "ACTIVE" | "ABANDONED" | "OUT"; stackCents?: number }) {
  const p = new PlayerState();
  p.id = params.id;
  p.userId = params.id;
  p.kind = "HUMAN";
  p.name = params.id;
  p.seat = params.seat;
  p.status = params.status ?? "ACTIVE";
  p.stackCents = params.stackCents ?? 5000;
  return p;
}

function makeBot(params: { id: string; seat: number }) {
  const p = new PlayerState();
  p.id = params.id;
  p.userId = "";
  p.kind = "BOT";
  p.name = params.id;
  p.seat = params.seat;
  p.status = "ACTIVE";
  p.stackCents = 5000;
  p.connected = true;
  return p;
}

/** Test harness surface — avoids intersecting PokerRoom (private members become `never`). */
type TestRoom = {
  state: PokerState;
  dealer: Dealer;
  setMetadata: ReturnType<typeof vi.fn>;
  roomId: string;
  setState(state: PokerState): void;
  updateMetadataCountsInternal(): void;
  maybeRemoveBotsIfNoHumansInternal(): Promise<void>;
  beginDeleteIfNoConnectedHumans(): { ok: boolean; connectedHumanCount: number; reason?: string };
  kickUserByAdmin(userId: string, reason?: string): Promise<void>;
  controller?: { session: { getBoundClient: (userId: string) => unknown } };
};

/** Lightweight room harness (mirrors table-sweep.abandoned-purge.test.ts's pattern). */
function buildTestRoom(tableId: string) {
  const boundClients = new Map<string, { sessionId: string; send: ReturnType<typeof vi.fn>; leave: ReturnType<typeof vi.fn> }>();
  const room = new PokerRoom() as unknown as TestRoom;
  room.setMetadata = vi.fn().mockResolvedValue(undefined);
  room.roomId = `room_${tableId}`;

  const state = new PokerState();
  state.tableId = tableId;
  state.tableName = "Presence Test Table";
  state.maxSeats = 6;
  state.smallBlindCents = 50;
  state.bigBlindCents = 100;
  state.minBuyInCents = 2000;
  state.maxBuyInCents = 20000;
  state.street = "WAITING";
  room.setState(state);

  const removeFromState = (playerId: string) => {
    room.state.playersById.delete(playerId);
    const seatIdx = room.state.seats.indexOf(playerId);
    if (seatIdx >= 0) room.state.seats[seatIdx] = "";
  };

  const removedBotIds: string[] = [];
  const kickUser = vi.fn(async (userId: string) => {
    // Mirrors the real dealer: on kick, drop the binding and fully remove the seat so
    // humanCount can reach zero once the kicked user was the last human.
    boundClients.delete(userId);
    removeFromState(userId);
  });

  room.dealer = {
    removePlayer: vi.fn(async (userId: string) => {
      removeFromState(userId);
    }),
    removeBot: vi.fn(async (botId: string) => {
      removedBotIds.push(botId);
      removeFromState(botId);
    }),
    kickUser,
    getClient: (userId: string) => boundClients.get(userId),
  } as unknown as Dealer;

  (room as unknown as { controller?: { session: { getBoundClient: (userId: string) => unknown } } }).controller = {
    session: {
      getBoundClient: (userId: string) => boundClients.get(userId),
    },
  };

  return {
    room,
    boundClients,
    removedBotIds,
    kickUser,
    bind(userId: string) {
      const client = { sessionId: `sess_${userId}`, send: vi.fn(), leave: vi.fn() };
      boundClients.set(userId, client);
      return client;
    },
    unbind(userId: string) {
      boundClients.delete(userId);
    },
    lastMetadata() {
      const calls = room.setMetadata.mock.calls;
      return calls.length > 0 ? calls[calls.length - 1][0] : undefined;
    },
  };
}

describe("connectedHumanCount", () => {
  it("is 0 when all humans are disconnected; bots and unbound seats do not count", () => {
    const { room } = buildTestRoom("table_cc_1");
    room.state.playersById.set("bot1", makeBot({ id: "bot1", seat: 0 }));
    room.state.playersById.set("human1", makeHuman({ id: "human1", seat: 1 }));
    // human1 is seated but not bound to any client (disconnected/sitting out).

    room.updateMetadataCountsInternal();

    const meta = room.setMetadata.mock.calls.at(-1)?.[0];
    expect(meta.humanCount).toBe(1);
    expect(meta.connectedHumanCount).toBe(0);
  });

  it("increments on join/reconnect and decrements on leave/disconnect", () => {
    const harness = buildTestRoom("table_cc_2");
    const { room } = harness;
    room.state.playersById.set("human1", makeHuman({ id: "human1", seat: 0 }));
    room.state.playersById.set("human2", makeHuman({ id: "human2", seat: 1 }));

    // Neither bound yet.
    room.updateMetadataCountsInternal();
    expect(harness.lastMetadata()?.connectedHumanCount).toBe(0);

    // human1 joins (binds).
    harness.bind("human1");
    room.updateMetadataCountsInternal();
    expect(harness.lastMetadata()?.connectedHumanCount).toBe(1);

    // human2 joins too.
    harness.bind("human2");
    room.updateMetadataCountsInternal();
    expect(harness.lastMetadata()?.connectedHumanCount).toBe(2);

    // human1 disconnects (unbind, still seated).
    harness.unbind("human1");
    room.updateMetadataCountsInternal();
    expect(harness.lastMetadata()?.connectedHumanCount).toBe(1);
    expect(harness.lastMetadata()?.humanCount).toBe(2);

    // human1 reconnects (rebind).
    harness.bind("human1");
    room.updateMetadataCountsInternal();
    expect(harness.lastMetadata()?.connectedHumanCount).toBe(2);

    // human2 leaves for good (fully removed from state, e.g. consented leave).
    room.state.playersById.delete("human2");
    room.updateMetadataCountsInternal();
    expect(harness.lastMetadata()?.connectedHumanCount).toBe(1);
    expect(harness.lastMetadata()?.humanCount).toBe(1);
  });
});

describe("table delete gating (beginDeleteIfNoConnectedHumans)", () => {
  it("allows delete when the only humans are disconnected (sitting out)", () => {
    const { room } = buildTestRoom("table_del_1");
    room.state.playersById.set("human1", makeHuman({ id: "human1", seat: 0, status: "ABANDONED" }));
    // human1 stays in playersById (humanCount === 1) but has no bound client.

    const lock = room.beginDeleteIfNoConnectedHumans();
    expect(lock.ok).toBe(true);
    expect(lock.connectedHumanCount).toBe(0);
  });

  it("denies delete while a human is actively connected", () => {
    const harness = buildTestRoom("table_del_2");
    const { room } = harness;
    room.state.playersById.set("human1", makeHuman({ id: "human1", seat: 0 }));
    harness.bind("human1");

    const lock = room.beginDeleteIfNoConnectedHumans();
    expect(lock.ok).toBe(false);
    expect(lock.reason).toBe("CONNECTED_HUMANS_PRESENT");
    expect(lock.connectedHumanCount).toBe(1);
  });
});

describe("bot clearing on last-human removal", () => {
  it("clears bots when the last human is fully removed (leave/abandon path)", async () => {
    const harness = buildTestRoom("table_bot_1");
    const { room } = harness;
    room.state.playersById.set("bot1", makeBot({ id: "bot1", seat: 0 }));
    room.state.playersById.set("bot2", makeBot({ id: "bot2", seat: 1 }));
    room.state.playersById.set("human1", makeHuman({ id: "human1", seat: 2 }));

    // Simulate the seat actually being released (consented leave / abandon-release path).
    room.state.playersById.delete("human1");

    await room.maybeRemoveBotsIfNoHumansInternal();

    expect(harness.removedBotIds.sort()).toEqual(["bot1", "bot2"]);
    expect(room.state.playersById.has("bot1")).toBe(false);
    expect(room.state.playersById.has("bot2")).toBe(false);
  });

  it("does NOT clear bots when a human merely disconnects but remains seated", async () => {
    const harness = buildTestRoom("table_bot_2");
    const { room } = harness;
    room.state.playersById.set("bot1", makeBot({ id: "bot1", seat: 0 }));
    room.state.playersById.set("human1", makeHuman({ id: "human1", seat: 1 }));
    harness.bind("human1");

    // Disconnect: unbind but the seat/player stays in state (sitting out), matching the
    // proposal's rule that bot-clearing keys off humanCount, not connectedHumanCount.
    harness.unbind("human1");
    room.updateMetadataCountsInternal();

    await room.maybeRemoveBotsIfNoHumansInternal();

    expect(harness.removedBotIds).toEqual([]);
    expect(room.state.playersById.has("bot1")).toBe(true);
  });

  it("clears bots via the admin kick path once the kicked user was the last human", async () => {
    const harness = buildTestRoom("table_bot_3");
    const { room, kickUser } = harness;
    room.state.playersById.set("bot1", makeBot({ id: "bot1", seat: 0 }));
    room.state.playersById.set("human1", makeHuman({ id: "human1", seat: 1 }));
    harness.bind("human1");

    await room.kickUserByAdmin("human1", "BANNED");

    expect(kickUser).toHaveBeenCalledWith("human1", "BANNED");
    expect(harness.removedBotIds).toEqual(["bot1"]);
    expect(room.state.playersById.has("bot1")).toBe(false);
    expect(harness.lastMetadata()?.connectedHumanCount).toBe(0);
    expect(harness.lastMetadata()?.humanCount).toBe(0);
  });

  it("does NOT clear bots via kick when another human remains seated", async () => {
    const harness = buildTestRoom("table_bot_4");
    const { room } = harness;
    room.state.playersById.set("bot1", makeBot({ id: "bot1", seat: 0 }));
    room.state.playersById.set("human1", makeHuman({ id: "human1", seat: 1 }));
    room.state.playersById.set("human2", makeHuman({ id: "human2", seat: 2 }));
    harness.bind("human1");
    harness.bind("human2");

    await room.kickUserByAdmin("human1", "BANNED");

    expect(harness.removedBotIds).toEqual([]);
    expect(room.state.playersById.has("bot1")).toBe(true);
    expect(harness.lastMetadata()?.humanCount).toBe(1);
  });
});
