import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PokerRoom } from "./PokerRoom.js";
import { CashierService } from "../engine/economy/CashierService.js";

vi.setConfig({ testTimeout: 20000 });

type FakeClient = {
  sessionId: string;
  send: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  auth?: { userId: string };
};

function makeClient(sessionId: string, userId: string): FakeClient {
  return {
    sessionId,
    send: vi.fn(),
    leave: vi.fn(),
    auth: { userId },
  };
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean, timeoutMs: number, label: string) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out waiting for: ${label}`);
    }
    await delay(20);
  }
}

function buildRoom(tableId: string, roomId: string) {
  const room = new PokerRoom() as any;
  room.setMetadata = vi.fn().mockResolvedValue(undefined);
  room.roomId = roomId;
  room.onCreate({
    tableConfig: {
      tableId,
      name: `Table ${tableId}`,
      maxSeats: 6,
      smallBlindCents: 50,
      bigBlindCents: 100,
      minBuyInCents: 2000,
      maxBuyInCents: 20000,
      visibility: "PUBLIC",
      createdAt: Date.now(),
    },
  });
  return room;
}

/** Tries the least committal legal action first, like a passive human clicking through their turn. */
async function actPassively(room: any, userId: string): Promise<void> {
  for (const action of ["CHECK", "CALL", "FOLD"] as const) {
    try {
      await room.dealer.handleAction(userId, { action });
      return;
    } catch {
      // Not legal in this spot (e.g. CHECK when facing a bet) — try the next option.
    }
  }
  throw new Error(`No legal action found for ${userId}`);
}

async function waitForUsersTurn(room: any, userId: string, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const seat = room.state.toActSeat;
    if (seat >= 0 && room.state.seats[seat] === userId) return true;
    await delay(50);
  }
  return false;
}

describe("multi-table: a human can be seated at several tables and switch between them", () => {
  const persistentSeatsEnv = process.env.FEATURE_PERSISTENT_SEATS;

  beforeEach(() => {
    process.env.FEATURE_PERSISTENT_SEATS = "false";
    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({
      success: true,
      newTableBalance: 5000,
    });
    vi.spyOn(CashierService, "processCashGameCashOut").mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.FEATURE_PERSISTENT_SEATS = persistentSeatsEnv;
  });

  it("requestUserLeaveBecauseJoiningAnotherTable sits the player out with seat/stack preserved instead of cashing them out", async () => {
    const roomA = buildRoom("table_switch_a1", "room_switch_a1");
    const userId = "user_switch_1";
    const clientA = makeClient("sess_switch_a1", userId);

    await roomA.onJoin(clientA, { buyInCents: 5000 }, { userId, username: "alice" });
    await roomA.onJoin(
      makeClient("sess_switch_partner1", "user_switch_partner"),
      { buyInCents: 5000 },
      { userId: "user_switch_partner", username: "bob" },
    );

    const stackBefore = roomA.state.playersById.get(userId)?.stackCents;
    expect(stackBefore).toBeGreaterThan(0);

    // This is what PokerRoomJoinService calls (via matchMaker.remoteRoomCall) on a player's other
    // tables the instant they join a new one.
    await roomA.requestUserLeaveBecauseJoiningAnotherTable(userId);

    // Still seated at table A: not removed, not cashed out — just sitting out.
    expect(roomA.dealer.hasPlayer(userId)).toBe(true);
    const after = roomA.state.playersById.get(userId);
    expect(after?.stackCents).toBe(stackBefore);
    expect(after?.sittingOutUntilNextHand).toBe(true);
    expect(after?.status).toBe("ABANDONED");
    expect(CashierService.processCashGameCashOut).not.toHaveBeenCalled();

    // The old session was kicked (SESSION_REPLACED) so it won't linger bound or reconnect.
    expect(clientA.send).toHaveBeenCalledWith(
      "ERROR",
      expect.objectContaining({ code: "SESSION_REPLACED", message: "You joined another table." }),
    );
    expect(clientA.leave).toHaveBeenCalledWith(4001);
    expect(roomA.dealer.getClient(userId)).toBeFalsy();
  });

  it("joins table A, switches to table B and keeps playing, then switches back to A and resumes with the same stack", async () => {
    const roomA = buildRoom("table_switch_a2", "room_switch_a2");
    const roomB = buildRoom("table_switch_b2", "room_switch_b2");
    const userId = "user_switch_2";

    // --- Seated at table A, hand is underway ---
    const clientA1 = makeClient("sess_switch_a2_1", userId);
    await roomA.onJoin(clientA1, { buyInCents: 5000 }, { userId, username: "alice" });
    await roomA.onJoin(
      makeClient("sess_switch_a2_partner", "user_switch_2_partner_a"),
      { buyInCents: 5000 },
      { userId: "user_switch_2_partner_a", username: "partner-a" },
    );
    await waitFor(() => Boolean(roomA.state.handId), 5000, "table A hand starts");
    const stackAtA = roomA.state.playersById.get(userId)?.stackCents;
    expect(stackAtA).toBeGreaterThan(0);

    // --- Switch to table B (separate tab / lobby navigation): table A seat sits out, seat/stack preserved ---
    await roomA.requestUserLeaveBecauseJoiningAnotherTable(userId);
    expect(roomA.dealer.hasPlayer(userId)).toBe(true);
    expect(roomA.state.playersById.get(userId)?.sittingOutUntilNextHand).toBe(true);
    expect(roomA.state.playersById.get(userId)?.stackCents).toBe(stackAtA);

    const clientB1 = makeClient("sess_switch_b2_1", userId);
    await roomB.onJoin(clientB1, { buyInCents: 5000 }, { userId, username: "alice" });
    roomB.onMessageEvents.emit("ADD_BOT", clientB1, { name: "Bot B", buyInCents: 5000, botId: "nash_nate" });
    await waitFor(
      () => roomB.state.playersById.size >= 2 && Boolean(roomB.state.handId),
      8000,
      "table B: bot seated and hand started",
    );

    // Seated and eligible to play at table B — not sitting out just because they're sitting out at A.
    const atB = roomB.state.playersById.get(userId);
    expect(atB?.sittingOutUntilNextHand).toBe(false);
    expect(atB?.status).not.toBe("ABANDONED");
    expect(atB?.status).not.toBe("OUT");

    // Prove it's genuinely playable: wait for a turn and take a real action against the bot.
    const gotTurnAtB = await waitForUsersTurn(roomB, userId, 15000);
    expect(gotTurnAtB).toBe(true);
    await expect(actPassively(roomB, userId)).resolves.toBeUndefined();

    // --- Switch back to table A: table B seat now sits out, table A seat restores with stack intact ---
    await roomB.requestUserLeaveBecauseJoiningAnotherTable(userId);
    expect(roomB.dealer.hasPlayer(userId)).toBe(true);
    expect(roomB.state.playersById.get(userId)?.sittingOutUntilNextHand).toBe(true);

    const buyInCallsBeforeRestore = (CashierService.processCashGameBuyIn as unknown as ReturnType<typeof vi.fn>).mock
      .calls.length;

    const clientA2 = makeClient("sess_switch_a2_2", userId);
    await roomA.onJoin(clientA2, { buyInCents: 5000 }, { userId, username: "alice" });

    expect(clientA2.send).toHaveBeenCalledWith(
      "SESSION_RESTORED",
      expect.objectContaining({ userId, joinMode: "RESTORE" }),
    );
    // It's a restore, not a fresh seat: no new buy-in was charged, and the stack carries forward
    // from table A rather than resetting to a full 5000 buy-in. (While the player was away, table
    // A's stalled hand resolved by last-player-standing and a fresh hand dealt them back in, so
    // the stack may be a bit lower than the moment they switched away — that's real gameplay
    // continuing, not a bug.)
    expect((CashierService.processCashGameBuyIn as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      buyInCallsBeforeRestore,
    );
    const restored = roomA.state.playersById.get(userId);
    expect(restored?.stackCents).toBeGreaterThan(0);
    expect(restored?.stackCents).toBeLessThanOrEqual(stackAtA);
    expect(restored?.stackCents).toBeLessThan(5000);
    expect(restored?.sittingOutUntilNextHand).toBe(false);
    expect(roomA.dealer.getClient(userId)).toBe(clientA2);
    expect(CashierService.processCashGameCashOut).not.toHaveBeenCalled();
  });
});
