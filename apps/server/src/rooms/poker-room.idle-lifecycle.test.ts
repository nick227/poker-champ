import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPrisma } from "@poker-champ/db";
import { TableSeatSessionService } from "../engine/seats/TableSeatSessionService.js";
import { CashierService } from "../engine/economy/CashierService.js";
import { PokerRoom } from "./PokerRoom.js";

describe("cash-table economic idle lifecycle", () => {
  const previousIdleMs = process.env.POKER_ROOM_IDLE_DISPOSE_MS;
  const previousPersistentSeats = process.env.FEATURE_PERSISTENT_SEATS;
  let reconnectableCount = 0;
  let activeBalanceCount = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.POKER_ROOM_IDLE_DISPOSE_MS = "1800000";
    process.env.FEATURE_PERSISTENT_SEATS = "false";
    reconnectableCount = 0;
    activeBalanceCount = 0;
    vi.spyOn(TableSeatSessionService, "countReconnectableSessionsForTable").mockImplementation(
      async () => reconnectableCount,
    );
    vi.spyOn((getPrisma() as any).playerBalance, "count").mockImplementation(
      async () => activeBalanceCount,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (previousIdleMs == null) delete process.env.POKER_ROOM_IDLE_DISPOSE_MS;
    else process.env.POKER_ROOM_IDLE_DISPOSE_MS = previousIdleMs;
    if (previousPersistentSeats == null) delete process.env.FEATURE_PERSISTENT_SEATS;
    else process.env.FEATURE_PERSISTENT_SEATS = previousPersistentSeats;
  });

  function buildRoom(id: string): PokerRoom {
    const room = new PokerRoom() as any;
    room.setMetadata = vi.fn().mockResolvedValue(undefined);
    room.roomId = `room_${id}`;
    room.onCreate({
      tableConfig: {
        tableId: id,
        name: id,
        maxSeats: 6,
        smallBlindCents: 100,
        bigBlindCents: 200,
        minBuyInCents: 2000,
        maxBuyInCents: 20000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });
    return room;
  }

  it("preserves a switched-away table with a seated human beyond 30 minutes", async () => {
    reconnectableCount = 1;
    activeBalanceCount = 1;
    const room = buildRoom("switch_preserved") as any;
    room.computeHumanCount = () => 1;
    const disconnect = vi.spyOn(room, "disconnect").mockImplementation(() => undefined as never);

    await room.reevaluateIdleLifecycleInternal();
    await vi.advanceTimersByTimeAsync(31 * 60_000);

    expect(disconnect).not.toHaveBeenCalled();
    expect(await room.canIdleDisposeInternal()).toBe(false);
    room.onDispose();
  });

  it("fails disposal when a durable balance remains without runtime players", async () => {
    activeBalanceCount = 1;
    const room = buildRoom("balance_preserved") as any;
    const disconnect = vi.spyOn(room, "disconnect").mockImplementation(() => undefined as never);

    await room.reevaluateIdleLifecycleInternal();
    await vi.advanceTimersByTimeAsync(31 * 60_000);

    expect(disconnect).not.toHaveBeenCalled();
    expect(await room.canIdleDisposeInternal()).toBe(false);
    room.onDispose();
  });

  it("starts a fresh 30-minute window only when economic emptiness begins", async () => {
    reconnectableCount = 1;
    const room = buildRoom("fresh_window") as any;
    const disconnect = vi.spyOn(room, "disconnect").mockImplementation(() => undefined as never);
    await room.reevaluateIdleLifecycleInternal();

    await vi.advanceTimersByTimeAsync(20 * 60_000);
    reconnectableCount = 0;
    await room.reevaluateIdleLifecycleInternal();
    await vi.advanceTimersByTimeAsync(29 * 60_000);
    expect(disconnect).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(disconnect).toHaveBeenCalledTimes(1);
    room.onDispose();
  });

  it("rechecks authoritative state so a stale timer cannot dispose an active table", async () => {
    const room = buildRoom("stale_timer") as any;
    const disconnect = vi.spyOn(room, "disconnect").mockImplementation(() => undefined as never);
    await room.reevaluateIdleLifecycleInternal();

    await vi.advanceTimersByTimeAsync(29 * 60_000);
    room.computeHumanCount = () => 1;
    await room.reevaluateIdleLifecycleInternal();
    await vi.advanceTimersByTimeAsync(2 * 60_000);

    expect(disconnect).not.toHaveBeenCalled();
    room.onDispose();
  });

  it("serializes final disposal against an economic admission", async () => {
    const room = buildRoom("disposal_admission_race") as any;
    const disconnect = vi.spyOn(room, "disconnect").mockImplementation(() => undefined as never);
    await Promise.resolve();
    await Promise.resolve();
    room.cancelIdleDispose();
    let releaseDurableCheck!: () => void;
    const durableCheckGate = new Promise<void>((resolve) => {
      releaseDurableCheck = resolve;
    });
    vi.mocked(TableSeatSessionService.countReconnectableSessionsForTable).mockImplementationOnce(async () => {
      await durableCheckGate;
      return 0;
    });
    room.idleTimerGeneration = 41;

    const disposal = room.handleIdleDisposeTimer(41);
    await Promise.resolve();
    const admission = room.beginEconomicAdmission("user_race", "buyin-race");
    releaseDurableCheck();

    await expect(disposal).resolves.toBeUndefined();
    await expect(admission).resolves.toEqual({ ok: false, reason: "TABLE_GONE" });
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(activeBalanceCount).toBe(0);
    room.onDispose();
  });

  it("aborts final disposal when the economic admission wins the lock", async () => {
    const room = buildRoom("admission_disposal_race") as any;
    const disconnect = vi.spyOn(room, "disconnect").mockImplementation(() => undefined as never);
    await Promise.resolve();
    room.cancelIdleDispose();
    room.idleTimerGeneration = 42;

    const admission = room.beginEconomicAdmission("user_wins", "buyin-wins");
    const disposal = room.handleIdleDisposeTimer(42);

    await expect(admission).resolves.toEqual({ ok: true });
    await expect(disposal).resolves.toBeUndefined();
    expect(disconnect).not.toHaveBeenCalled();

    // Model the ledger commit before releasing the admission reservation.
    activeBalanceCount = 1;
    await room.endEconomicAdmission("user_wins", "buyin-wins");
    expect(disconnect).not.toHaveBeenCalled();
    room.onDispose();
  });

  it("runs concurrent join/reconnect/admission readers without serializing behind each other", async () => {
    // Regression for the restore-loop performance regression: joins/reconnects/admissions are
    // "readers" that only need to exclude a concurrently in-flight disposal decision, not each
    // other. A single FIFO mutex here would make every join wait behind every other join,
    // turning a cheap per-join cost into an O(n) pileup across a long reconnect loop.
    const room = buildRoom("concurrent_readers") as any;
    const entryOrder: number[] = [];
    const releases: Array<() => void> = [];
    const gates = Array.from({ length: 5 }, () => new Promise<void>((resolve) => releases.push(resolve)));

    const calls = gates.map((gate, i) =>
      room.withTableLifecycleLockInternal(async () => {
        entryOrder.push(i);
        await gate;
      }),
    );

    await Promise.resolve();
    await Promise.resolve();
    // All five readers already entered their critical section concurrently, even though none
    // has released yet -- a FIFO mutex would only have admitted the first one at this point.
    expect(entryOrder.length).toBe(5);

    for (const release of releases) release();
    await Promise.all(calls);
    room.onDispose();
  });

  it("blocks new readers while a writer (disposal) is active, then admits them once it releases", async () => {
    const room = buildRoom("writer_preference") as any;
    const disconnect = vi.spyOn(room, "disconnect").mockImplementation(() => undefined as never);
    await Promise.resolve();
    room.cancelIdleDispose();
    room.idleTimerGeneration = 43;

    let releaseWriter!: () => void;
    const writerGate = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    vi.mocked(TableSeatSessionService.countReconnectableSessionsForTable).mockImplementationOnce(async () => {
      await writerGate;
      return 0;
    });

    const disposal = room.handleIdleDisposeTimer(43);
    await Promise.resolve();

    let readerEntered = false;
    const reader = room.withTableLifecycleLockInternal(async () => {
      readerEntered = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(readerEntered).toBe(false);

    releaseWriter();
    await disposal;
    await reader;
    expect(readerEntered).toBe(true);
    expect(disconnect).toHaveBeenCalledTimes(1);
    room.onDispose();
  });

  it("does not query durable state until runtime looks empty", async () => {
    const room = buildRoom("cheap_precondition") as any;
    await Promise.resolve();
    vi.mocked(TableSeatSessionService.countReconnectableSessionsForTable).mockClear();
    const balanceCount = vi.mocked((getPrisma() as any).playerBalance.count);
    balanceCount.mockClear();
    room.computeHumanCount = () => 1;

    expect(await room.canIdleDisposeInternal()).toBe(false);
    expect(TableSeatSessionService.countReconnectableSessionsForTable).not.toHaveBeenCalled();
    expect(balanceCount).not.toHaveBeenCalled();
    room.onDispose();
  });

  describe("disconnect sweep re-evaluates idle lifecycle", () => {
    it("starts a fresh 30-minute idle window when DisconnectManager's sweep finalizes the last player", async () => {
      // The last remaining player's reconnect window expires; DisconnectManager's periodic sweep
      // (not an explicit onLeave call) is what finalizes them. The room must still notice it has
      // become economically empty off the back of that removal, not wait for some unrelated
      // future event to re-check.
      vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({ success: true, newTableBalance: 5000 });
      vi.spyOn(CashierService, "processCashGameCashOut").mockResolvedValue({ success: true });
      const markLeftSpy = vi.spyOn(TableSeatSessionService, "markLeft").mockResolvedValue(true);

      const room = buildRoom("disconnect_sweep_idle") as any;
      const disconnect = vi.spyOn(room, "disconnect").mockImplementation(() => undefined as never);
      const userId = "user_sweep";

      await room.dealer.addPlayer(userId, "Sweep Player", 5000);
      expect(room.state.playersById.has(userId)).toBe(true);
      // Calling dealer.addPlayer directly (bypassing PokerRoomJoinService) skips the join flow's
      // own room.handleEmptyStateChangeInternal() call, which is what cancels a stale idle timer
      // from before this player was seated in real production joins. Do that explicitly here so
      // this test isn't measuring an artifact of the shortcut instead of the actual fix.
      room.handleEmptyStateChangeInternal();

      const deadline = Date.now() + 5_000;
      await room.dealer.markDisconnectedSerialized(userId, deadline);

      // Advance past the deadline and past DisconnectManager's next 10s sweep tick so it finalizes.
      await vi.advanceTimersByTimeAsync(15_000);

      expect(room.state.playersById.has(userId)).toBe(false);
      expect(CashierService.processCashGameCashOut).toHaveBeenCalledTimes(1);
      expect(markLeftSpy).toHaveBeenCalledTimes(1);

      // A fresh window starts at (approximately) the moment of removal -- the sweep tick that
      // finalized it, not the deadline or the start of this test. Compute the boundary from the
      // room's own recorded emptySinceTs rather than assuming exact sweep-tick timing.
      expect(room.emptySinceTs).not.toBeNull();
      const msSinceEmpty = Date.now() - (room.emptySinceTs as number);
      const remainingUntilDispose = 30 * 60_000 - msSinceEmpty;
      expect(remainingUntilDispose).toBeGreaterThan(0);

      await vi.advanceTimersByTimeAsync(remainingUntilDispose - 2_000);
      expect(disconnect).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(3_000);
      expect(disconnect).toHaveBeenCalledTimes(1);

      room.onDispose();
    });
  });

  describe("buy-in vs cash-out admission mutual exclusion (TOCTOU)", () => {
    it("rejects cash-out while a buy-in has committed DB funds but not yet synced room state", async () => {
      // Exact race: buy-in's DB commit has happened (modeled by beginEconomicAdmission having
      // already succeeded and not yet been released), applyRebuy has not yet run, and the user
      // is therefore not seated yet. isUserSeated() alone would read false here -- the admission
      // must still block cash-out.
      const room = buildRoom("toctou_buyin_first") as any;
      const userId = "user_toctou";

      const buyIn = await room.beginEconomicAdmission(userId, "buyin-ref-1");
      expect(buyIn).toEqual({ ok: true });
      expect(room.isUserSeated(userId)).toBe(false);

      const cashOut = await room.beginCashOutAdmission(userId);
      expect(cashOut).toEqual({ ok: false, reason: "ADMISSION_IN_PROGRESS" });

      // Once applyRebuy has synced (admission released), cash-out is allowed again.
      await room.endEconomicAdmission(userId, "buyin-ref-1");
      const cashOutAfter = await room.beginCashOutAdmission(userId);
      expect(cashOutAfter).toEqual({ ok: true });
      room.onDispose();
    });

    it("rejects a concurrent buy-in while a cash-out admission is in flight for the same user", async () => {
      const room = buildRoom("toctou_cashout_first") as any;
      const userId = "user_toctou_2";

      const cashOut = await room.beginCashOutAdmission(userId);
      expect(cashOut).toEqual({ ok: true });

      const buyIn = await room.beginEconomicAdmission(userId, "buyin-ref-2");
      expect(buyIn).toEqual({ ok: false, reason: "CASHOUT_IN_PROGRESS" });

      await room.endCashOutAdmission(userId);
      const buyInAfter = await room.beginEconomicAdmission(userId, "buyin-ref-2");
      expect(buyInAfter).toEqual({ ok: true });
      room.onDispose();
    });

    it("admissions for different users never block each other", async () => {
      const room = buildRoom("toctou_different_users") as any;

      const buyIn = await room.beginEconomicAdmission("user_a", "buyin-ref-a");
      const cashOut = await room.beginCashOutAdmission("user_b");

      expect(buyIn).toEqual({ ok: true });
      expect(cashOut).toEqual({ ok: true });
      room.onDispose();
    });
  });

  describe("reader/writer lock: writer starvation and error safety", () => {
    it("a continuous stream of new readers cannot starve a waiting writer", async () => {
      const room = buildRoom("writer_no_starvation") as any;
      const disconnect = vi.spyOn(room, "disconnect").mockImplementation(() => undefined as never);
      await Promise.resolve();
      room.cancelIdleDispose();
      room.idleTimerGeneration = 50;

      let releaseFirstReader!: () => void;
      const firstReaderGate = new Promise<void>((resolve) => {
        releaseFirstReader = resolve;
      });
      const firstReader = room.withTableLifecycleLockInternal(async () => {
        await firstReaderGate;
      });
      await Promise.resolve();

      // Writer queues while the first reader is still holding the lock.
      const disposal = room.handleIdleDisposeTimer(50);
      await Promise.resolve();

      // A steady stream of new readers arrives after the writer is already queued. None of them
      // may enter -- with the pre-fix implementation (checking only writerActive, never a queued
      // writer) these would keep readerCount above zero forever and the writer would never run.
      let anyLateReaderEntered = false;
      const lateReaders = Array.from({ length: 10 }, () =>
        room.withTableLifecycleLockInternal(async () => {
          anyLateReaderEntered = true;
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(anyLateReaderEntered).toBe(false);

      releaseFirstReader();
      await firstReader;
      await disposal;
      expect(disconnect).toHaveBeenCalledTimes(1);

      // Only after the writer finishes do the queued readers get to run.
      await Promise.all(lateReaders);
      expect(anyLateReaderEntered).toBe(true);
      room.onDispose();
    });

    it("multiple readers still run concurrently when no writer is waiting", async () => {
      const room = buildRoom("readers_concurrent_no_writer") as any;
      const entered: number[] = [];
      const releases: Array<() => void> = [];
      const gates = Array.from({ length: 4 }, () => new Promise<void>((resolve) => releases.push(resolve)));

      const calls = gates.map((gate, i) =>
        room.withTableLifecycleLockInternal(async () => {
          entered.push(i);
          await gate;
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(entered.length).toBe(4);

      for (const release of releases) release();
      await Promise.all(calls);
      room.onDispose();
    });

    it("releases the read lock when the wrapped operation throws", async () => {
      const room = buildRoom("read_lock_throw_safety") as any;

      await expect(
        room.withTableLifecycleLockInternal(async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");

      // The lock must not be stuck held: a subsequent reader can still acquire it.
      let secondEntered = false;
      await room.withTableLifecycleLockInternal(async () => {
        secondEntered = true;
      });
      expect(secondEntered).toBe(true);
      room.onDispose();
    });

    it("releases the write lock when the disposal decision rejects", async () => {
      const room = buildRoom("write_lock_throw_safety") as any;
      await Promise.resolve();
      room.cancelIdleDispose();
      room.idleTimerGeneration = 51;
      vi.mocked(TableSeatSessionService.countReconnectableSessionsForTable).mockRejectedValueOnce(
        new Error("db down"),
      );

      // canIdleDispose's own try/catch turns the rejection into a safe `false`, so
      // handleIdleDisposeTimer itself never throws -- but the lock must still be released.
      await expect(room.handleIdleDisposeTimer(51)).resolves.toBeUndefined();

      let readerEntered = false;
      await room.withTableLifecycleLockInternal(async () => {
        readerEntered = true;
      });
      expect(readerEntered).toBe(true);
      room.onDispose();
    });
  });
});
