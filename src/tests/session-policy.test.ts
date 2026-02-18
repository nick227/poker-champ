import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PokerRoom } from "../rooms/PokerRoom.js";
import { AuthService } from "../engine/auth/AuthService.js";
import { Dealer } from "../engine/Dealer.js";
import { PokerState } from "../state/PokerState.js";
import { CashierService } from "../engine/economy/CashierService.js";

describe("session auth policy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects join auth without bearer token", async () => {
    const room = new PokerRoom();
    await expect(
      room.onAuth({} as any, {}, { headers: new Headers() } as any),
    ).rejects.toThrow(/Missing Authorization bearer token/);
  });

  it("rejects banned or expired session", async () => {
    const room = new PokerRoom();
    vi.spyOn(AuthService, "validateSession").mockResolvedValueOnce(null);

    await expect(
      room.onAuth({} as any, {}, { headers: new Headers({ authorization: "Bearer badtoken" }) } as any),
    ).rejects.toThrow(/Invalid or expired session/);
  });

  it("accepts valid session and returns auth context", async () => {
    const room = new PokerRoom();
    vi.spyOn(AuthService, "validateSession").mockResolvedValueOnce({
      id: "u1",
      role: "USER",
      username: "u1",
      displayName: "u1",
    } as any);

    const auth = await room.onAuth(
      {} as any,
      {},
      { headers: new Headers({ authorization: "Bearer goodtoken" }) } as any,
    );

    expect(auth).toEqual({
      userId: "u1",
      sessionId: "goodtoken",
      roles: ["USER"],
      username: "u1",
    });
  });
});

describe("disconnect policy", () => {
  beforeEach(() => {
    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({
      success: true,
      newTableBalance: 5000,
    });
    vi.spyOn(CashierService, "processCashGameCashOut").mockResolvedValue({ success: true });
  });

  it("drop + reconnect keeps same seat and stack", async () => {
    const state = new PokerState();
    const dealer = new Dealer(state);

    await dealer.addPlayer("u1", "A", 5000);
    await dealer.addPlayer("u2", "B", 5000);

    const p = state.playersById.get("u1")!;
    const seat = p.seat;
    const stack = p.stackCents;

    dealer.markDisconnected("u1", Date.now() + 60_000);
    expect(state.playersById.get("u1")?.connected).toBe(false);

    dealer.markReconnected("u1");
    expect(state.playersById.get("u1")?.connected).toBe(true);
    expect(state.playersById.get("u1")?.seat).toBe(seat);
    expect(state.playersById.get("u1")?.stackCents).toBe(stack);
  });

  it("drop timeout marks abandoned and releases seat at hand end", async () => {
    const state = new PokerState();
    const dealer = new Dealer(state);

    await dealer.addPlayer("u1", "A", 5000);
    await dealer.addPlayer("u2", "B", 5000);

    await dealer.markAbandoned("u1");
    await new Promise((r) => setTimeout(r, 10));

    expect(state.playersById.has("u1")).toBe(false);
  });

  it("reconnect during active hand keeps abandoned player out of current hand", async () => {
    const state = new PokerState();
    const dealer = new Dealer(state);

    await dealer.addPlayer("u1", "A", 5000);
    await dealer.addPlayer("u2", "B", 5000);

    const u1 = state.playersById.get("u1")!;
    const u2 = state.playersById.get("u2")!;
    state.street = "TURN";
    state.runoutMode = "NONE";
    state.roundCurrentBetCents = 100;
    u1.status = "ABANDONED";
    u1.connected = false;
    u1.needsAction = false;
    u1.roundBetCents = 0;
    u1.committedCents = 0;
    u2.status = "ALL_IN";
    u2.needsAction = false;
    u2.roundBetCents = 100;
    u2.committedCents = 100;

    expect(() => dealer.markReconnected("u1")).not.toThrow();
    expect(state.playersById.get("u1")?.status).toBe("ABANDONED");
    expect(state.playersById.get("u1")?.connected).toBe(true);
  });

  it("ban propagation handler kicks active seated user", async () => {
    const room = new PokerRoom() as any;
    const client = { send: vi.fn(), leave: vi.fn() };
    const kickUser = vi.fn().mockResolvedValue(undefined);

    room.dealer = {
      getClient: () => client,
      kickUser,
    };

    await room.kickUserByAdmin("u1", "BANNED");

    expect(client.leave).toHaveBeenCalled();
    expect(kickUser).toHaveBeenCalledWith("u1", "BANNED");
  });
});
