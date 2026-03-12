import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionPayload, TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { PokerRoom } from "./PokerRoom.js";
import { CashierService } from "../engine/economy/CashierService.js";
import { logger } from "../lib/logger.js";

type FakeClient = {
  sessionId: string;
  leave: () => void;
  send: (type: string, payload: unknown) => void;
  sentByType: Record<string, unknown[]>;
  latestSnapshot: TableSnapshotPayload | null;
};

function makeClient(sessionId: string): FakeClient {
  const sentByType: Record<string, unknown[]> = {};
  const client: FakeClient = {
    sessionId,
    sentByType,
    latestSnapshot: null,
    leave: () => {},
    send: (type: string, payload: unknown) => {
      if (!sentByType[type]) sentByType[type] = [];
      sentByType[type].push(payload);
      if (type === "TABLE_SNAPSHOT") client.latestSnapshot = payload as TableSnapshotPayload;
    },
  };
  return client;
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

function pickAction(snapshot: TableSnapshotPayload): ActionPayload {
  const opts = snapshot.hero.actionOptions;
  if (!opts) return { action: "FOLD" };
  if (opts.canCheck) return { action: "CHECK" };
  if (opts.canCall) return { action: "CALL" };
  if (opts.canAllIn) return { action: "ALL_IN" };
  if (opts.canRaise) {
    return { action: "RAISE", amountCents: opts.minRaiseTo ?? opts.maxRaiseTo ?? 1 };
  }
  if (opts.canBet) {
    return { action: "BET", amountCents: opts.minRaiseTo ?? opts.maxRaiseTo ?? 1 };
  }
  return { action: "FOLD" };
}

function computeChipMass(room: any): number {
  const disbursed = typeof room?.dealer?.settlementService?.getCurrentHandPotDisbursedCents === "function"
    ? Number(room.dealer.settlementService.getCurrentHandPotDisbursedCents() ?? 0)
    : 0;
  const stacks = [...room.state.playersById.values()].reduce((sum: number, p: any) => sum + Number(p.stackCents ?? 0), 0);
  return stacks + Number(room.state.potCents ?? 0) - disbursed;
}

function recycleStacksIfNeeded(room: any): boolean {
  const street = String(room?.state?.street ?? "");
  if (street !== "WAITING") return false;

  const players = [...room.state.playersById.values()];
  const playable = players.filter((p: any) => Number(p.stackCents ?? 0) > 0 && p.status !== "OUT");
  if (playable.length >= 2) return false;

  for (const p of players as any[]) {
    p.stackCents = 5000;
    p.status = "ACTIVE";
    p.sittingOut = false;
    p.needsAction = false;
    p.roundBetCents = 0;
    p.committedCents = 0;
  }
  return true;
}

const configuredHands = Number(process.env.ROOM_SOAK_HANDS ?? "");
const configuredProgressEvery = Number(process.env.ROOM_SOAK_PROGRESS_EVERY ?? "");
const soakTimeoutMs = (() => {
  const hands = Number.isFinite(configuredHands) && configuredHands > 0 ? Math.floor(configuredHands) : 60;
  return Math.max(240_000, hands * 8_000);
})();

describe("poker room random walk soak", () => {
  const buyInSpy = CashierService.processCashGameBuyIn;
  const cashOutSpy = CashierService.processCashGameCashOut;

  afterEach(() => {
    vi.restoreAllMocks();
    (CashierService as any).processCashGameBuyIn = buyInSpy;
    (CashierService as any).processCashGameCashOut = cashOutSpy;
  });

  it("plays many hands without room-level stalls", async () => {
    (CashierService as any).processCashGameBuyIn = async () => ({ success: true, newTableBalance: 5000 });
    (CashierService as any).processCashGameCashOut = async () => ({ success: true });

    const warnSpy = vi.spyOn(logger, "warn");

    const room = new PokerRoom() as any;
    room.setMetadata = async () => {};
    room.roomId = "room_random_walk_soak";
    room.onCreate({
      tableConfig: {
        tableId: "table_room_random_walk_soak",
        name: "Room Random Walk Soak",
        maxSeats: 6,
        smallBlindCents: 50,
        bigBlindCents: 100,
        minBuyInCents: 2000,
        maxBuyInCents: 20_000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });

    const client = makeClient("sess_room_soak_human");
    await room.onJoin(client as any, { buyInCents: 5000 }, { userId: "user_human", username: "human" });
    room.onMessageEvents.emit("ADD_BOT", client as any, { name: "Bot", buyInCents: 5000, botId: "chaos_carl" });

    await waitFor(
      () =>
        Boolean(client.latestSnapshot?.hand?.handId) &&
        client.latestSnapshot!.seats.some((s) => s.isBot),
      12_000,
      "initial hand + bot seated",
    );
    const expectedChipMass = computeChipMass(room);

    const targetHands = Number.isFinite(configuredHands) && configuredHands > 0 ? Math.floor(configuredHands) : 60;
    const progressEvery = Number.isFinite(configuredProgressEvery) && configuredProgressEvery > 0
      ? Math.floor(configuredProgressEvery)
      : 25;
    let completedHands = 0;
    const completedHandIds = new Set<string>();
    let lastHandCompletedAt = Date.now();
    let lastHandId = client.latestSnapshot?.hand?.handId ?? "";
    let lastProgressAt = Date.now();
    let lastRoomProgressAt = Date.now();
    let lastRoomHandId = String(room.state.handId ?? "");
    let lastRoomStreet = String(room.state.street ?? "");
    let lastRoomActionSeq = Number(room.state.handActionSeq ?? 0);
    let actionSeq = 0;
    let lastActionSnapshotId = "";
    let lastHumanActionAttemptAt = 0;
    const handStartAtMsById = new Map<string, number>();
    const handDurationsMs: number[] = [];

    try {
      while (completedHands < targetHands) {
        const roomHandIdNow = String(room.state.handId ?? "");
        const roomStreetNow = String(room.state.street ?? "");
        const roomActionSeqNow = Number(room.state.handActionSeq ?? 0);
        if (
          roomHandIdNow !== lastRoomHandId ||
          roomStreetNow !== lastRoomStreet ||
          roomActionSeqNow !== lastRoomActionSeq
        ) {
          lastRoomProgressAt = Date.now();
          lastRoomHandId = roomHandIdNow;
          lastRoomStreet = roomStreetNow;
          lastRoomActionSeq = roomActionSeqNow;
        }

        if (recycleStacksIfNeeded(room)) {
          await room.dealer.forceAdvanceToNextHandForTest();
        }

        const snap = client.latestSnapshot;
        const hand = snap?.hand;
        if (!snap || !hand || !hand.handId) {
          if (Date.now() - lastRoomProgressAt > 15_000) {
            throw new Error(
              `No room state progress for >15s (street=${roomStreetNow} hand=${roomHandIdNow} handActionSeq=${roomActionSeqNow})`,
            );
          }
          if (Date.now() - lastHandCompletedAt > 30_000) {
            throw new Error(
              `Room soak stalled: no hand completed in 30s (street=${roomStreetNow} hand=${roomHandIdNow})`,
            );
          }
          await delay(20);
          continue;
        }

        if (!handStartAtMsById.has(hand.handId)) {
          handStartAtMsById.set(hand.handId, Date.now());
        }

        const completedHandId = snap.lastHandResult?.handId;
        if (completedHandId && !completedHandIds.has(completedHandId)) {
          completedHandIds.add(completedHandId);
          completedHands += 1;
          lastHandCompletedAt = Date.now();
          const startedAt = handStartAtMsById.get(completedHandId);
          if (typeof startedAt === "number") {
            handDurationsMs.push(Date.now() - startedAt);
            handStartAtMsById.delete(completedHandId);
          }
          lastProgressAt = Date.now();
          if (completedHands % progressEvery === 0) {
            console.error(`[ROOM_SOAK_PROGRESS] completed=${completedHands}/${targetHands}`);
          }
        }

        if (lastHandId && hand.handId !== lastHandId) {
          if (!completedHandIds.has(lastHandId)) {
            completedHandIds.add(lastHandId);
            completedHands += 1;
            lastHandCompletedAt = Date.now();
            const startedAt = handStartAtMsById.get(lastHandId);
            if (typeof startedAt === "number") {
              handDurationsMs.push(Date.now() - startedAt);
              handStartAtMsById.delete(lastHandId);
            }
            if (completedHands % progressEvery === 0) {
              console.error(`[ROOM_SOAK_PROGRESS] completed=${completedHands}/${targetHands}`);
            }
          }
          lastHandId = hand.handId;
          lastProgressAt = Date.now();
        } else {
          lastHandId = hand.handId;
        }

        const liveHandId = room.state.handId || "";
        const liveStreet = String(room.state.street || "");
        const snapshotTracksLiveHand = liveStreet !== "WAITING" && liveStreet !== "SHOWDOWN" && liveHandId && hand.handId === liveHandId;
        const snapshotToActUserId = snap.seats.find((s) => s.seat === hand.toActSeat)?.userId;
        const liveToActUserId =
          room.state.toActSeat >= 0
            ? (room.state.seats[room.state.toActSeat] ?? "")
            : "";

        // Invariant: total chip mass must be conserved across the full room runtime.
        expect(computeChipMass(room), "chip mass drift in PokerRoom soak").toBe(expectedChipMass);
        // Invariant: when room is in WAITING, the entire pot must be fully disbursed.
        if (liveStreet === "WAITING") {
          const disbursed =
            typeof room?.dealer?.settlementService?.getCurrentHandPotDisbursedCents === "function"
              ? Number(room.dealer.settlementService.getCurrentHandPotDisbursedCents() ?? 0)
              : 0;
          expect(disbursed, "undisbursed pot while WAITING").toBe(Number(room.state.potCents ?? 0));
        }

        const humanRetryDue = Date.now() - lastHumanActionAttemptAt > 500;
        const humanToAct =
          snapshotTracksLiveHand &&
          liveToActUserId === "user_human" &&
          (snapshotToActUserId === "user_human" || snapshotToActUserId === "" || snapshotToActUserId == null);
        if (
          humanToAct &&
          (snap.snapshotId !== lastActionSnapshotId || humanRetryDue)
        ) {
          const action = pickAction(snap);
          room.onMessageEvents.emit("ACTION", client as any, {
            ...action,
            actionId: `room-soak-${Date.now()}-${actionSeq++}`,
          });
          lastActionSnapshotId = snap.snapshotId;
          lastHumanActionAttemptAt = Date.now();
          await delay(20);
          lastProgressAt = Date.now();
          continue;
        }

        if (Date.now() - lastProgressAt > 15_000 || Date.now() - lastRoomProgressAt > 15_000) {
          throw new Error(
            `No table progress for >15s at hand=${hand.handId} street=${hand.street} toActSeat=${hand.toActSeat} roomStreet=${roomStreetNow} roomHand=${roomHandIdNow} roomHandActionSeq=${roomActionSeqNow}`,
          );
        }
        if (Date.now() - lastHandCompletedAt > 30_000) {
          throw new Error(
            `Room soak stalled: no hand completed in 30s (activeHand=${hand.handId} street=${hand.street})`,
          );
        }

        await delay(20);
      }

      const stalledCalls = warnSpy.mock.calls.filter((call) => call[1] === "TABLE_STALLED");
      const redriveCalls = warnSpy.mock.calls.filter((call) => call[1] === "TABLE_STALLED_RECOVERY_REDRIVE");
      const parityMismatchCalls = warnSpy.mock.calls.filter((call) => call[1] === "ENGINE_PARITY_MISMATCH");
      expect(stalledCalls.length, "room soak emitted TABLE_STALLED").toBe(0);
      expect(redriveCalls.length, "room soak emitted TABLE_STALLED_RECOVERY_REDRIVE").toBe(0);
      expect(parityMismatchCalls.length, "room soak emitted ENGINE_PARITY_MISMATCH").toBe(0);
      expect(completedHands).toBeGreaterThanOrEqual(targetHands);
      const avgHandMs =
        handDurationsMs.length > 0
          ? Math.round(handDurationsMs.reduce((sum, ms) => sum + ms, 0) / handDurationsMs.length)
          : 0;
      const maxHandMs = handDurationsMs.length > 0 ? Math.max(...handDurationsMs) : 0;
      console.error(
        `[ROOM_SOAK_DONE] completed=${completedHands}/${targetHands} avgHandMs=${avgHandMs} maxHandMs=${maxHandMs}`,
      );
    } finally {
      try {
        await room.onLeave(client as any, 4000);
      } catch {
        // ignore teardown issues in soak cleanup
      }
    }
  }, soakTimeoutMs);
});
