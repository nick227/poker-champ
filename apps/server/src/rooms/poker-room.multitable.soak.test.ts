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

function recycleStacksIfNeeded(room: any): boolean {
  const street = String(room?.state?.street ?? "");
  if (street !== "WAITING") return false;
  const players = [...room.state.playersById.values()];
  const activeWithChips = players.filter((p: any) => p.status !== "OUT" && Number(p.stackCents ?? 0) > 0);
  if (activeWithChips.length >= 2) return false;
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

const configuredTables = Number(process.env.MULTI_TABLE_SOAK_TABLES ?? "");
const configuredHandsPerTable = Number(process.env.MULTI_TABLE_SOAK_HANDS_PER_TABLE ?? "");
const configuredProgressEvery = Number(process.env.MULTI_TABLE_SOAK_PROGRESS_EVERY ?? "");
const configuredMaxRecyclesPerTable = Number(process.env.MULTI_TABLE_SOAK_MAX_RECYCLES_PER_TABLE ?? "");
const soakTimeoutMs = (() => {
  const tables = Number.isFinite(configuredTables) && configuredTables > 0 ? Math.floor(configuredTables) : 4;
  const hands = Number.isFinite(configuredHandsPerTable) && configuredHandsPerTable > 0
    ? Math.floor(configuredHandsPerTable)
    : 20;
  return Math.max(300_000, tables * hands * 8_000);
})();

describe("poker room multi-table random walk soak", () => {
  const buyInSpy = CashierService.processCashGameBuyIn;
  const cashOutSpy = CashierService.processCashGameCashOut;

  afterEach(() => {
    vi.restoreAllMocks();
    (CashierService as any).processCashGameBuyIn = buyInSpy;
    (CashierService as any).processCashGameCashOut = cashOutSpy;
  });

  it(
    "runs concurrent tables without stalls",
    async () => {
      (CashierService as any).processCashGameBuyIn = async () => ({ success: true, newTableBalance: 5000 });
      (CashierService as any).processCashGameCashOut = async () => ({ success: true });

      const warnSpy = vi.spyOn(logger, "warn");
      const tableCount = Number.isFinite(configuredTables) && configuredTables > 0
        ? Math.floor(configuredTables)
        : 4;
      const handsPerTable = Number.isFinite(configuredHandsPerTable) && configuredHandsPerTable > 0
        ? Math.floor(configuredHandsPerTable)
        : 20;
      const progressEvery = Number.isFinite(configuredProgressEvery) && configuredProgressEvery > 0
        ? Math.floor(configuredProgressEvery)
        : Math.max(5, Math.floor(handsPerTable / 2));
      const maxRecyclesPerTable = Number.isFinite(configuredMaxRecyclesPerTable) && configuredMaxRecyclesPerTable > 0
        ? Math.floor(configuredMaxRecyclesPerTable)
        : Math.max(5, handsPerTable);

      const contexts: Array<{ room: any; client: FakeClient; tableId: string }> = [];
      for (let i = 0; i < tableCount; i += 1) {
        const room = new PokerRoom() as any;
        room.setMetadata = async () => {};
        room.roomId = `room_multitable_soak_${i}`;
        room.onCreate({
          tableConfig: {
            tableId: `table_multitable_soak_${i}`,
            name: `MultiTable Soak ${i}`,
            maxSeats: 6,
            smallBlindCents: 50,
            bigBlindCents: 100,
            minBuyInCents: 2000,
            maxBuyInCents: 20_000,
            visibility: "PUBLIC",
            createdAt: Date.now(),
          },
        });

        const client = makeClient(`sess_multitable_human_${i}`);
        await room.onJoin(client as any, { buyInCents: 5000 }, { userId: `human_${i}`, username: `human_${i}` });
        const botCatalogId = i % 2 === 0 ? "chaos_carl" : "nash_nate";
        room.onMessageEvents.emit("ADD_BOT", client as any, {
          name: `Bot ${i}`,
          buyInCents: 5000,
          botId: botCatalogId,
        });

        await waitFor(
          () =>
            Boolean(client.latestSnapshot?.hand?.handId) &&
            client.latestSnapshot!.seats.some((s) => s.isBot),
          12_000,
          `table ${i}: initial hand + bot seated`,
        );
        contexts.push({ room, client, tableId: `table_multitable_soak_${i}` });
      }

      let completedTotal = 0;
      let stopping = false;
      const workers = contexts.map(async ({ room, client, tableId }, idx) => {
        const targetHands = handsPerTable;
        let completedHands = 0;
        const completedHandIds = new Set<string>();
        let lastHandId = client.latestSnapshot?.hand?.handId ?? "";
        let lastProgressAt = Date.now();
        let lastRoomProgressAt = Date.now();
        let lastHandCompletedAt = Date.now();
        let lastRoomHandId = String(room.state.handId ?? "");
        let lastRoomStreet = String(room.state.street ?? "");
        let lastRoomActionSeq = Number(room.state.handActionSeq ?? 0);
        let lastCompletedRoomHandId = "";
        let lastSnapshotId = client.latestSnapshot?.snapshotId ?? "";
        let actionSeq = 0;
        let lastActionSnapshotId = "";
        let lastHumanActionAttemptAt = 0;
        let recycleCount = 0;

        while (completedHands < targetHands) {
          if (stopping) break;

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

          if (
            roomStreetNow === "WAITING" &&
            roomHandIdNow &&
            roomHandIdNow !== lastCompletedRoomHandId
          ) {
            lastCompletedRoomHandId = roomHandIdNow;
            lastHandCompletedAt = Date.now();
            lastProgressAt = Date.now();
          }

          if (recycleStacksIfNeeded(room)) {
            recycleCount += 1;
            if (recycleCount > maxRecyclesPerTable) {
              throw new Error(`Recycle limit exceeded table=${tableId} recycles=${recycleCount} max=${maxRecyclesPerTable}`);
            }
            if (typeof room.dealer.forceAdvanceToNextHandForTest !== "function") {
              throw new Error(`Recycle requested without forceAdvanceToNextHandForTest table=${tableId}`);
            }
            await room.dealer.forceAdvanceToNextHandForTest();
          }

          const snap = client.latestSnapshot;
          const hand = snap?.hand;
          if (!snap || !hand || !hand.handId) {
            const now = Date.now();
            const roomToActUserIdForBudget =
              room.state.toActSeat >= 0
                ? (room.state.seats[room.state.toActSeat] ?? "")
                : "";
            const roomTurnDeadlineMsForBudget = Number(room.state.turnDeadlineMs ?? 0);
            const roomHumanDeadlineActive =
              roomToActUserIdForBudget.startsWith("human_") &&
              roomStreetNow !== "WAITING" &&
              roomStreetNow !== "SHOWDOWN" &&
              roomTurnDeadlineMsForBudget > now;
            const roomProgressBudgetMs = roomStreetNow === "SHOWDOWN"
              ? 60_000
              : roomHumanDeadlineActive
              ? Math.min(45_000, Math.max(15_000, roomTurnDeadlineMsForBudget - now + 2_000))
              : roomStreetNow !== "WAITING"
              ? 30_000
              : 0;
            if (roomProgressBudgetMs > 0 && now - lastRoomProgressAt > roomProgressBudgetMs) {
              throw new Error(
                `No room progress >${roomProgressBudgetMs}ms table=${tableId} street=${roomStreetNow} hand=${roomHandIdNow} seq=${roomActionSeqNow}`,
              );
            }
            if (now - lastHandCompletedAt > 30_000) {
              throw new Error(`No hand completion >30s table=${tableId}`);
            }
            await delay(20);
            continue;
          }

          if (snap.snapshotId && snap.snapshotId !== lastSnapshotId) {
            lastSnapshotId = snap.snapshotId;
            lastProgressAt = Date.now();
            if (roomStreetNow === "SHOWDOWN" || hand.street === "SHOWDOWN") {
              lastRoomProgressAt = Date.now();
            }
          }

          const completedHandId = snap.lastHandResult?.handId;
          if (completedHandId && !completedHandIds.has(completedHandId)) {
            completedHandIds.add(completedHandId);
            completedHands += 1;
            completedTotal += 1;
            lastHandCompletedAt = Date.now();
            lastProgressAt = Date.now();
            if (completedHands % progressEvery === 0) {
              console.error(`[MULTI_TABLE_SOAK_PROGRESS] table=${idx} completed=${completedHands}/${targetHands} total=${completedTotal}`);
            }
          }

          if (lastHandId && hand.handId !== lastHandId) {
            if (!completedHandIds.has(lastHandId)) {
              completedHandIds.add(lastHandId);
              completedHands += 1;
              completedTotal += 1;
              lastHandCompletedAt = Date.now();
            }
            lastHandId = hand.handId;
            lastProgressAt = Date.now();
          } else {
            lastHandId = hand.handId;
          }

          const liveHandId = room.state.handId || "";
          const liveStreet = String(room.state.street || "");
          const liveStreetActionable = liveStreet !== "WAITING" && liveStreet !== "SHOWDOWN";
          const snapshotMatchesLiveStreet = hand.street === liveStreet;
          const snapshotMatchesLiveHand = hand.handId === liveHandId;
          const snapshotIsStaleForProgress =
            liveStreet === "WAITING" ||
            (Boolean(liveHandId) && !snapshotMatchesLiveHand) ||
            (liveStreet !== "WAITING" && !snapshotMatchesLiveStreet);

          if (snapshotIsStaleForProgress) {
            lastProgressAt = Math.max(lastProgressAt, lastRoomProgressAt);
          }

          const snapshotTracksLiveHand =
            liveStreet !== "WAITING" && liveStreet !== "SHOWDOWN" && liveHandId && hand.handId === liveHandId;
          const snapshotToActUserId = snap.seats.find((s) => s.seat === hand.toActSeat)?.userId;
          const liveToActUserId =
            room.state.toActSeat >= 0
              ? (room.state.seats[room.state.toActSeat] ?? "")
              : "";

          const humanRetryDue = Date.now() - lastHumanActionAttemptAt > 500;
          const humanToAct =
            snapshotTracksLiveHand &&
            liveToActUserId.startsWith("human_") &&
            (snapshotToActUserId === liveToActUserId || snapshotToActUserId === "" || snapshotToActUserId == null);
          if (
            humanToAct &&
            (snap.snapshotId !== lastActionSnapshotId || humanRetryDue)
          ) {
            const action = pickAction(snap);
            room.onMessageEvents.emit("ACTION", client as any, {
              ...action,
              actionId: `multi-table-soak-${Date.now()}-${actionSeq++}`,
            });
            lastActionSnapshotId = snap.snapshotId;
            lastHumanActionAttemptAt = Date.now();
            await delay(20);
            lastProgressAt = Date.now();
            continue;
          }

          const now = Date.now();
          const turnDeadlineMs = Number(room.state.turnDeadlineMs ?? 0);
          const humanDeadlineActive =
            liveToActUserId.startsWith("human_") &&
            liveStreetActionable &&
            turnDeadlineMs > now;
          const inShowdown = roomStreetNow === "SHOWDOWN" || hand.street === "SHOWDOWN";
          const progressBudgetMs = inShowdown
            ? 60_000
            : humanDeadlineActive
            ? Math.min(45_000, Math.max(15_000, turnDeadlineMs - now + 2_000))
            : liveStreetActionable
            ? 30_000
            : 15_000;
          if (now - lastProgressAt > progressBudgetMs || now - lastRoomProgressAt > progressBudgetMs) {
            throw new Error(
              `No table progress >${progressBudgetMs}ms table=${tableId} hand=${hand.handId} street=${hand.street} toAct=${hand.toActSeat} roomStreet=${roomStreetNow} roomSeq=${roomActionSeqNow}`,
            );
          }
          const handCompletionBudgetMs = Math.max(30_000, progressBudgetMs + 15_000);
          if (now - lastHandCompletedAt > handCompletionBudgetMs) {
            throw new Error(`No hand completion >${handCompletionBudgetMs}ms table=${tableId}`);
          }

          await delay(20);
        }
        console.error(`[MULTI_TABLE_SOAK_TABLE_DONE] table=${idx} completed=${completedHands}/${targetHands} recycles=${recycleCount}`);
      });

      try {
        await Promise.all(workers);
      } finally {
        stopping = true;
        for (const { room, client } of contexts) {
          try {
            await room.onLeave(client as any, 4000);
          } catch {
            // ignore cleanup errors in soak teardown
          }
        }
      }

      const stalledCalls = warnSpy.mock.calls.filter((call) => call[1] === "TABLE_STALLED");
      const redriveCalls = warnSpy.mock.calls.filter((call) => call[1] === "TABLE_STALLED_RECOVERY_REDRIVE");
      const parityMismatchCalls = warnSpy.mock.calls.filter((call) => call[1] === "ENGINE_PARITY_MISMATCH");
      expect(stalledCalls.length, "multi-table soak emitted TABLE_STALLED").toBe(0);
      expect(redriveCalls.length, "multi-table soak emitted TABLE_STALLED_RECOVERY_REDRIVE").toBe(0);
      expect(parityMismatchCalls.length, "multi-table soak emitted ENGINE_PARITY_MISMATCH").toBe(0);
      expect(completedTotal).toBeGreaterThanOrEqual(tableCount * handsPerTable);
      console.error(
        `[MULTI_TABLE_SOAK_DONE] tables=${tableCount} handsPerTable=${handsPerTable} completedTotal=${completedTotal}`,
      );
    },
    soakTimeoutMs,
  );
});
