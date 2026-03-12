import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PokerRoom } from "./PokerRoom.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";
import { logger } from "../lib/logger.js";

function makeHuman(id: string, seat: number): PlayerState {
  const p = new PlayerState();
  p.id = id;
  p.userId = id;
  p.name = id;
  p.kind = "HUMAN";
  p.seat = seat;
  p.status = "ACTIVE";
  p.connected = true;
  p.stackCents = 10000;
  p.roundBetCents = 200;
  p.committedCents = 200;
  p.needsAction = true;
  return p;
}

describe("PokerRoom decision stall monitor BOT_OVERDUE grace", () => {
  const prevDecisionEnv = process.env.FEATURE_DECISION_STALL_DETECTION;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.FEATURE_DECISION_STALL_DETECTION = "true";
  });

  afterEach(() => {
    process.env.FEATURE_DECISION_STALL_DETECTION = prevDecisionEnv;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not emit TABLE_STALLED for BOT_OVERDUE when snapshot silence is below threshold", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    const room = new PokerRoom() as any;
    room.roomId = "room_bot_overdue_grace";
    room.getBoundClient = () => ({ sessionId: "stub" });

    const state = new PokerState();
    state.tableId = "table_bot_overdue_grace";
    state.street = "PREFLOP";
    state.roundState = "WAITING_FOR_ACTION";
    state.toActSeat = 1;
    state.maxSeats = 2;
    state.runoutMode = "NONE";
    state.seats.push("u1", "bot1");
    state.playersById.set("u1", makeHuman("u1", 0));
    const bot = new PlayerState();
    bot.id = "bot1";
    bot.userId = "bot1";
    bot.name = "bot1";
    bot.kind = "BOT";
    bot.seat = 1;
    bot.status = "ACTIVE";
    bot.connected = true;
    bot.stackCents = 10000;
    bot.roundBetCents = 100;
    bot.committedCents = 100;
    bot.needsAction = true;
    state.playersById.set("bot1", bot);

    room.state = state;
    room.lastSnapshotAt = Date.now() - 3_000; // < 15s threshold
    room.lastSnapshotSeq = 7;
    room.dealer = {
      logEngineDecisionPublic: vi.fn(),
      getQueueDepth: vi.fn(() => 0),
      getStallReasonPublic: vi.fn(() => "BOT_OVERDUE"),
      getLastDecisionTraceIdPublic: vi.fn(() => null),
      maybeActForBotPublic: vi.fn(),
      logTurnStalledIfNeeded: vi.fn(),
    };

    room.startStallMonitorInternal();
    vi.advanceTimersByTime(10_500);

    const stalled = warnSpy.mock.calls.filter((c) => c[1] === "TABLE_STALLED");
    const redrives = warnSpy.mock.calls.filter((c) => c[1] === "TABLE_STALLED_RECOVERY_REDRIVE");
    expect(stalled.length).toBe(0);
    expect(redrives.length).toBe(0);
    expect(room.dealer.maybeActForBotPublic).not.toHaveBeenCalled();

    if (room.stallCheckInterval) {
      clearInterval(room.stallCheckInterval);
      room.stallCheckInterval = null;
    }
  });
});
