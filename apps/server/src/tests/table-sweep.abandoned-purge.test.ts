import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PokerRoom } from "../rooms/PokerRoom.js";
import { PlayerState } from "../state/PlayerState.js";
import { TableSeatSessionService } from "../engine/seats/TableSeatSessionService.js";
import { CashierService } from "../engine/economy/CashierService.js";

const MINUTE_MS = 60_000;

function makeHuman(params: { id: string; seat: number; status: "ACTIVE" | "ABANDONED" | "OUT"; stackCents: number; connected?: boolean }) {
  const p = new PlayerState();
  p.id = params.id;
  p.userId = params.id;
  p.kind = "HUMAN";
  p.name = params.id;
  p.seat = params.seat;
  p.status = params.status;
  p.stackCents = params.stackCents;
  p.connected = params.connected ?? false;
  p.disconnectDeadlineTs = 0;
  return p;
}

function makeBot(params: { id: string; seat: number; stackCents: number }) {
  const p = new PlayerState();
  p.id = params.id;
  p.userId = "";
  p.kind = "BOT";
  p.name = params.id;
  p.seat = params.seat;
  p.status = "ACTIVE";
  p.stackCents = params.stackCents;
  p.connected = true;
  return p;
}

function createRoom(tableId: string) {
  const room = new PokerRoom() as any;
  room.setMetadata = vi.fn().mockResolvedValue(undefined);
  room.roomId = `room_${tableId}`;
  room.onCreate({
    tableConfig: {
      tableId,
      name: "Sweep Test Table",
      maxSeats: 6,
      smallBlindCents: 50,
      bigBlindCents: 100,
      minBuyInCents: 2000,
      maxBuyInCents: 20000,
      visibility: "PUBLIC",
      createdAt: Date.now(),
    },
  });
  room.state.street = "WAITING";
  return room;
}

describe("table sitting-out abandoned purge sweep", () => {
  const prevPersistentSeats = process.env.FEATURE_PERSISTENT_SEATS;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.FEATURE_PERSISTENT_SEATS = "true";
    vi.spyOn(CashierService, "processCashGameCashOut").mockResolvedValue({ success: true } as any);
    vi.spyOn(TableSeatSessionService, "listRestorableSessionsForTable").mockResolvedValue([]);
    vi.spyOn(TableSeatSessionService, "reapExpiredSessionsForTable").mockResolvedValue({
      softExpired: [],
      hardDeletedCount: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.env.FEATURE_PERSISTENT_SEATS = prevPersistentSeats;
  });

  it("purges abandoned seats when no connected humans exist", async () => {
    const startTs = Date.parse("2026-02-26T10:00:00.000Z");
    vi.setSystemTime(startTs);

    const room = createRoom("table_sweep_purge");
    const human = makeHuman({ id: "user_abandoned", seat: 0, status: "ABANDONED", stackCents: 5000, connected: false });
    const botA = makeBot({ id: "bot_a", seat: 1, stackCents: 5000 });
    const botB = makeBot({ id: "bot_b", seat: 2, stackCents: 5000 });
    room.state.playersById.set(human.id, human);
    room.state.playersById.set(botA.id, botA);
    room.state.playersById.set(botB.id, botB);
    room.state.seats[0] = human.id;
    room.state.seats[1] = botA.id;
    room.state.seats[2] = botB.id;

    const removePlayerSpy = vi.spyOn(room.dealer, "removePlayer");
    const markLeftSpy = vi.spyOn(TableSeatSessionService, "markLeft").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "listSittingOutDisconnectTimesForUsers").mockResolvedValue([
      { userId: human.id, disconnectAt: new Date(startTs) },
    ]);

    vi.setSystemTime(startTs + 31 * MINUTE_MS);
    const result = await room.runSittingOutSweep({ nowTs: Date.now(), abandonedPurgeMs: 30 * MINUTE_MS });

    expect(result.purgedUserIds).toEqual([human.id]);
    expect(removePlayerSpy).toHaveBeenCalledWith(human.id);
    expect(markLeftSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: "table_sweep_purge",
        userId: human.id,
        reason: "ABANDONED_TIMEOUT",
      }),
    );
    expect(room.state.playersById.has(human.id)).toBe(false);
    const botCount = [...room.state.playersById.values()].filter((p: PlayerState) => p.kind === "BOT").length;
    expect(botCount).toBe(0);
    expect(room.setMetadata).toHaveBeenCalledWith(expect.objectContaining({ humanCount: 0, connectedHumanCount: 0 }));
  });

  it("does not purge when any connected human exists (presence gate)", async () => {
    const startTs = Date.parse("2026-02-26T10:00:00.000Z");
    vi.setSystemTime(startTs);

    const room = createRoom("table_sweep_presence_gate");
    const abandoned = makeHuman({ id: "user_abandoned", seat: 0, status: "ABANDONED", stackCents: 5000, connected: false });
    const connected = makeHuman({ id: "user_connected", seat: 1, status: "ACTIVE", stackCents: 5000, connected: true });
    const bot = makeBot({ id: "bot_a", seat: 2, stackCents: 5000 });
    room.state.playersById.set(abandoned.id, abandoned);
    room.state.playersById.set(connected.id, connected);
    room.state.playersById.set(bot.id, bot);
    room.state.seats[0] = abandoned.id;
    room.state.seats[1] = connected.id;
    room.state.seats[2] = bot.id;
    room.dealer.bindClient(connected.id, { sessionId: "sess_connected" } as any);

    const removePlayerSpy = vi.spyOn(room.dealer, "removePlayer");
    const markLeftSpy = vi.spyOn(TableSeatSessionService, "markLeft").mockResolvedValue();
    const listSpy = vi.spyOn(TableSeatSessionService, "listSittingOutDisconnectTimesForUsers").mockResolvedValue([
      { userId: abandoned.id, disconnectAt: new Date(startTs) },
    ]);

    vi.setSystemTime(startTs + 31 * MINUTE_MS);
    const result = await room.runSittingOutSweep({ nowTs: Date.now(), abandonedPurgeMs: 30 * MINUTE_MS });

    expect(result.purgedUserIds).toEqual([]);
    expect(removePlayerSpy).not.toHaveBeenCalled();
    expect(markLeftSpy).not.toHaveBeenCalled();
    expect(listSpy).not.toHaveBeenCalled();
    expect(room.state.playersById.has(bot.id)).toBe(true);
  });

  it("does not purge before threshold (29 minutes)", async () => {
    const startTs = Date.parse("2026-02-26T10:00:00.000Z");
    vi.setSystemTime(startTs);

    const room = createRoom("table_sweep_threshold");
    const human = makeHuman({ id: "user_abandoned", seat: 0, status: "ABANDONED", stackCents: 5000, connected: false });
    room.state.playersById.set(human.id, human);
    room.state.seats[0] = human.id;

    const removePlayerSpy = vi.spyOn(room.dealer, "removePlayer");
    const markLeftSpy = vi.spyOn(TableSeatSessionService, "markLeft").mockResolvedValue();
    vi.spyOn(TableSeatSessionService, "listSittingOutDisconnectTimesForUsers").mockResolvedValue([
      { userId: human.id, disconnectAt: new Date(startTs) },
    ]);

    vi.setSystemTime(startTs + 29 * MINUTE_MS);
    const result = await room.runSittingOutSweep({ nowTs: Date.now(), abandonedPurgeMs: 30 * MINUTE_MS });

    expect(result.purgedUserIds).toEqual([]);
    expect(removePlayerSpy).not.toHaveBeenCalled();
    expect(markLeftSpy).not.toHaveBeenCalled();
    expect(room.state.playersById.has(human.id)).toBe(true);
  });

  it("purges only ABANDONED and ignores disconnected-in-grace players", async () => {
    const startTs = Date.parse("2026-02-26T10:00:00.000Z");
    vi.setSystemTime(startTs);

    const room = createRoom("table_sweep_grace");
    const inGrace = makeHuman({ id: "user_grace", seat: 0, status: "ACTIVE", stackCents: 5000, connected: false });
    inGrace.disconnectDeadlineTs = startTs + 5 * MINUTE_MS;
    room.state.playersById.set(inGrace.id, inGrace);
    room.state.seats[0] = inGrace.id;

    const removePlayerSpy = vi.spyOn(room.dealer, "removePlayer");
    const listSpy = vi.spyOn(TableSeatSessionService, "listSittingOutDisconnectTimesForUsers").mockResolvedValue([]);

    vi.setSystemTime(startTs + 2 * MINUTE_MS);
    const result = await room.runSittingOutSweep({ nowTs: Date.now(), abandonedPurgeMs: 30 * MINUTE_MS });

    expect(result.purgedUserIds).toEqual([]);
    expect(removePlayerSpy).not.toHaveBeenCalled();
    expect(listSpy).not.toHaveBeenCalled();
    expect(room.state.playersById.has(inGrace.id)).toBe(true);
  });

  it("skips sweep when room is deleting", async () => {
    const startTs = Date.parse("2026-02-26T10:00:00.000Z");
    vi.setSystemTime(startTs);

    const room = createRoom("table_sweep_deleting");
    const human = makeHuman({ id: "user_abandoned", seat: 0, status: "ABANDONED", stackCents: 5000, connected: false });
    room.state.playersById.set(human.id, human);
    room.state.seats[0] = human.id;
    const lock = room.beginDeleteIfNoConnectedHumans();
    expect(lock.ok).toBe(true);

    const removePlayerSpy = vi.spyOn(room.dealer, "removePlayer");
    const listSpy = vi.spyOn(TableSeatSessionService, "listSittingOutDisconnectTimesForUsers").mockResolvedValue([
      { userId: human.id, disconnectAt: new Date(startTs) },
    ]);

    vi.setSystemTime(startTs + 31 * MINUTE_MS);
    const result = await room.runSittingOutSweep({ nowTs: Date.now(), abandonedPurgeMs: 30 * MINUTE_MS });

    expect(result.purgedUserIds).toEqual([]);
    expect(removePlayerSpy).not.toHaveBeenCalled();
    expect(listSpy).not.toHaveBeenCalled();
    expect(room.state.playersById.has(human.id)).toBe(true);
  });

  it("does not purge abandoned player while reconnect grace is still active in-memory", async () => {
    const startTs = Date.parse("2026-02-26T10:00:00.000Z");
    vi.setSystemTime(startTs);

    const room = createRoom("table_sweep_inmemory_grace_guard");
    const human = makeHuman({ id: "user_abandoned", seat: 0, status: "ABANDONED", stackCents: 5000, connected: false });
    // Simulate restored disconnected seat with active in-memory grace deadline.
    human.disconnectDeadlineTs = startTs + 10 * MINUTE_MS;
    room.state.playersById.set(human.id, human);
    room.state.seats[0] = human.id;

    const removePlayerSpy = vi.spyOn(room.dealer, "removePlayer");
    const markLeftSpy = vi.spyOn(TableSeatSessionService, "markLeft").mockResolvedValue();
    // Persisted disconnect time is old enough to purge, but in-memory grace should block it.
    vi.spyOn(TableSeatSessionService, "listSittingOutDisconnectTimesForUsers").mockResolvedValue([
      { userId: human.id, disconnectAt: new Date(startTs - 31 * MINUTE_MS) },
    ]);

    const result = await room.runSittingOutSweep({ nowTs: Date.now(), abandonedPurgeMs: 30 * MINUTE_MS });

    expect(result.purgedUserIds).toEqual([]);
    expect(removePlayerSpy).not.toHaveBeenCalled();
    expect(markLeftSpy).not.toHaveBeenCalled();
    expect(room.state.playersById.has(human.id)).toBe(true);
  });
});
