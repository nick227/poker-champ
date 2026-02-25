import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { LobbyRoom } from "../src/lobby/LobbyRoom.js";
import { PokerRoom } from "../src/rooms/PokerRoom.js";
import { CashierService } from "../src/engine/economy/CashierService.js";
import { assertStateInvariants } from "../src/engine/invariants/assertState.js";
import { buildSidePots } from "../src/engine/rules/SidePotManager.js";
import {
  getActionableToActSeatFindingFromSnapshot,
  getSnapshotMoneyFindings,
  isActionableStatePhase,
} from "../src/engine/invariants/churnInvariantContract.js";

type UserId = "u1" | "u2" | "u3" | "u4";
type ClientLike = { sessionId: string; send: (type: string, payload: unknown) => void; leave: () => void };

type RecorderEvent = {
  seq: number;
  t: number;
  kind:
    | "HANDLE_ACTION"
    | "MARK_DISCONNECTED"
    | "MARK_RECONNECTED"
    | "CONSENTED_LEAVE"
    | "HUMAN_JOIN"
    | "BOT_JOIN"
    | "FORCE_NEXT_HAND_TEST_HOOK";
  handId: string | null;
  street: string | null;
  toActSeat: number | null;
  actorUserId?: string;
  targetUserId?: string;
  payload?: Record<string, unknown>;
  digest?: Record<string, unknown>;
};

type ViolationMeta = { seed?: number; scenario?: string; invariantMode?: string };

type Failure = {
  seq: number;
  kind: string;
  message: string;
  handId: string | null;
  street: string | null;
};

type ReplaySummary = {
  source: string;
  totalEvents: number;
  appliedEvents: number;
  scenario: string | null;
  seed: number | null;
  firstInstantInvariantFailure: Failure | null;
  firstLatentFailure: Failure | null;
  firstPayoutMismatch: Failure | null;
  finalState: Record<string, unknown>;
};

type Args = {
  source: string;
  seed: number | null;
};

function parseArgs(): Args {
  const source = process.argv[2];
  if (!source) {
    throw new Error("Usage: pnpm repro:run <events.jsonl|repro-folder> [--seed=20260225]");
  }
  let seed: number | null = null;
  for (const raw of process.argv.slice(3)) {
    const [key, value] = raw.replace(/^--/, "").split("=");
    if (key === "seed" && value) seed = Number(value);
  }
  return { source, seed };
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isManagedUserId(value: unknown): value is UserId {
  return value === "u1" || value === "u2" || value === "u3" || value === "u4";
}

function sumPayouts(payoutsByUserId: Record<string, number> | undefined): number {
  return Object.values(payoutsByUserId ?? {}).reduce((sum, amount) => sum + amount, 0);
}

function parseJsonl<T>(raw: string): T[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

async function resolveInput(source: string): Promise<{ eventsPath: string; violationMeta: ViolationMeta }> {
  const normalized = path.resolve(source);
  const eventsPath = normalized.endsWith(".jsonl") ? normalized : path.join(normalized, "events.jsonl");
  const violationPath = normalized.endsWith(".jsonl") ? path.join(path.dirname(normalized), "violation.json") : path.join(normalized, "violation.json");

  let violationMeta: ViolationMeta = {};
  try {
    const violationRaw = await readFile(violationPath, "utf8");
    const parsed = JSON.parse(violationRaw) as Record<string, unknown>;
    violationMeta = {
      seed: typeof parsed.seed === "number" ? parsed.seed : undefined,
      scenario: typeof parsed.scenario === "string" ? parsed.scenario : undefined,
      invariantMode: typeof parsed.invariantMode === "string" ? parsed.invariantMode : undefined,
    };
  } catch {}

  return { eventsPath, violationMeta };
}

async function main(): Promise<void> {
  const args = parseArgs();
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;
  const { eventsPath, violationMeta } = await resolveInput(args.source);
  const eventsRaw = await readFile(eventsPath, "utf8");
  const events = parseJsonl<RecorderEvent>(eventsRaw);
  if (events.length === 0) throw new Error("No events found in input file");

  const seed = args.seed ?? violationMeta.seed ?? 20260225;
  const random = mulberry32(seed);
  const originalRandom = Math.random;
  Math.random = random;

  const buyInSpy = CashierService.processCashGameBuyIn;
  const cashOutSpy = CashierService.processCashGameCashOut;
  (CashierService as any).processCashGameBuyIn = async () => ({ success: true, newTableBalance: 5000 });
  (CashierService as any).processCashGameCashOut = async () => ({ success: true });

  const httpServer = http.createServer();
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  gameServer.define("lobby", LobbyRoom);
  gameServer.define("poker", PokerRoom);

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));

  const created = await matchMaker.createRoom("poker", {
    tableConfig: {
      tableId: `repro_${Date.now()}`,
      name: "Churn Repro Replay",
      maxSeats: 6,
      smallBlindCents: 50,
      bigBlindCents: 100,
      minBuyInCents: 2000,
      maxBuyInCents: 20000,
      visibility: "PUBLIC",
      createdAt: Date.now(),
    },
  });
  const roomId = typeof created === "string" ? created : (created as any).roomId;
  const room = (matchMaker as any).getLocalRoomById(roomId) as PokerRoom & any;
  if (!room) throw new Error("Failed to resolve local replay room");

  const snapshots: Record<UserId, TableSnapshotPayload | null> = { u1: null, u2: null, u3: null, u4: null };
  const seenSeqByUser = new Map<UserId, number>();
  const latestResultsByHandId = new Map<string, NonNullable<TableSnapshotPayload["lastHandResult"]>>();
  const joinedUsers = new Set<UserId>();
  const clients: Partial<Record<UserId, ClientLike>> = {};
  const names: Record<UserId, string> = { u1: "alice", u2: "bob", u3: "charlie", u4: "dana" };

  const snapshotFindings: string[] = [];
  let firstInstantInvariantFailure: Failure | null = null;
  let firstLatentFailure: Failure | null = null;
  let firstPayoutMismatch: Failure | null = null;

  const buildDigest = (): Record<string, unknown> => {
    const players = Array.from(room.state?.playersById?.values?.() ?? []);
    const toActUserId = room.state?.seats?.[room.state?.toActSeat ?? -1] ?? null;
    const toActPlayer = toActUserId ? room.state?.playersById?.get?.(toActUserId) : undefined;
    return {
      handId: room.state?.handId ?? null,
      street: room.state?.street ?? null,
      actionable: isActionableStatePhase(room.state),
      potCents: room.state?.potCents ?? 0,
      toActSeat: room.state?.toActSeat ?? -1,
      toActUserId,
      toActStatus: toActPlayer?.status ?? null,
      toActNeedsAction: toActPlayer?.needsAction ?? null,
      eligibleActors: players.filter((p: any) => p?.status === "ACTIVE").length,
      needsAction: players.filter((p: any) => p?.status === "ACTIVE" && p?.needsAction).length,
      contenders: players.filter((p: any) => p?.status === "ACTIVE" || p?.status === "ALL_IN").length,
      totalCommittedCents: players.reduce((sum: number, p: any) => sum + (p?.committedCents ?? 0), 0),
    };
  };

  const maybeRecordInstantFailure = (event: RecorderEvent): void => {
    if (firstInstantInvariantFailure) return;
    try {
      assertStateInvariants(room.state);
    } catch (err) {
      firstInstantInvariantFailure = {
        seq: event.seq,
        kind: event.kind,
        message: err instanceof Error ? err.message : String(err),
        handId: room.state?.handId ?? null,
        street: room.state?.street ?? null,
      };
    }
  };

  const maybeRecordLatentFailure = (event: RecorderEvent): void => {
    if (firstLatentFailure) return;
    if (!room.state?.handId || room.state?.street === "WAITING") return;
    const players = Array.from(room.state?.playersById?.values?.() ?? []);
    const potCents = room.state?.potCents ?? 0;
    const eligibleAtShowdown = players.filter((p: any) => p?.status === "ACTIVE" || p?.status === "ALL_IN");
    if (potCents > 0 && eligibleAtShowdown.length === 0) {
      firstLatentFailure = {
        seq: event.seq,
        kind: event.kind,
        message: "DOOMED_SETTLEMENT:no_eligible_players_with_pot",
        handId: room.state?.handId ?? null,
        street: room.state?.street ?? null,
      };
      return;
    }
    if (potCents > 0 && players.length > 0) {
      try {
        const pots = buildSidePots(players as any, eligibleAtShowdown as any);
        const orphan = pots.find((pot) => pot.amountCents > 0 && pot.eligiblePlayerIds.length === 0);
        if (orphan) {
          firstLatentFailure = {
            seq: event.seq,
            kind: event.kind,
            message: `DOOMED_SETTLEMENT:orphan_side_pot level=${orphan.levelCents} amount=${orphan.amountCents}`,
            handId: room.state?.handId ?? null,
            street: room.state?.street ?? null,
          };
        }
      } catch (err) {
        firstLatentFailure = {
          seq: event.seq,
          kind: event.kind,
          message: `DOOMED_SETTLEMENT:sidepot_build_error ${(err as Error).message}`,
          handId: room.state?.handId ?? null,
          street: room.state?.street ?? null,
        };
      }
    }
  };

  const waitForAlignment = async (event: RecorderEvent): Promise<void> => {
    if (!event.handId && !event.street && event.toActSeat == null) return;
    const shouldAlign =
      event.kind === "HANDLE_ACTION" ||
      event.kind === "CONSENTED_LEAVE" ||
      event.kind === "MARK_DISCONNECTED" ||
      event.kind === "MARK_RECONNECTED";
    if (!shouldAlign) return;

    const started = Date.now();
    while (Date.now() - started < 1800) {
      const handOk = !event.handId || room.state?.handId === event.handId;
      const streetOk = !event.street || room.state?.street === event.street;
      const toActOk = event.toActSeat == null || room.state?.toActSeat === event.toActSeat;
      if (handOk && streetOk && toActOk) return;
      await delay(20);
    }
  };

  const makeClient = (sessionId: string, userId: UserId): ClientLike => ({
    sessionId,
    leave: () => {},
    send: (type: string, payload: unknown) => {
      if (type !== "TABLE_SNAPSHOT") return;
      const snap = payload as TableSnapshotPayload;
      const prev = seenSeqByUser.get(userId);
      if (typeof prev === "number" && snap.snapshotSeq <= prev) {
        snapshotFindings.push(`snapshotSeq non-monotonic user=${userId} prev=${prev} next=${snap.snapshotSeq}`);
      }
      seenSeqByUser.set(userId, snap.snapshotSeq);
      snapshots[userId] = snap;

      const toActFinding = getActionableToActSeatFindingFromSnapshot(snap);
      if (toActFinding) snapshotFindings.push(toActFinding);
      for (const finding of getSnapshotMoneyFindings(snap)) snapshotFindings.push(finding);

      if (snap.lastHandResult?.handId) {
        latestResultsByHandId.set(snap.lastHandResult.handId, snap.lastHandResult);
        if (!firstPayoutMismatch) {
          const payout = sumPayouts(snap.lastHandResult.payoutsByUserId);
          if (payout !== snap.lastHandResult.potCents) {
            firstPayoutMismatch = {
              seq: -1,
              kind: "HAND_END",
              message: `payout mismatch hand=${snap.lastHandResult.handId} payouts=${payout} pot=${snap.lastHandResult.potCents}`,
              handId: snap.lastHandResult.handId,
              street: room.state?.street ?? null,
            };
          }
        }
      }
    },
  });

  const applyEvent = async (event: RecorderEvent): Promise<void> => {
    switch (event.kind) {
      case "HUMAN_JOIN": {
        const target = event.targetUserId;
        if (!isManagedUserId(target) || joinedUsers.has(target)) return;
        const client = makeClient(`repro_${target}_${event.seq}`, target);
        clients[target] = client;
        await room.onJoin(client as any, { buyInCents: Number(event.payload?.buyInCents ?? 5000) }, { userId: target, username: names[target] });
        joinedUsers.add(target);
        return;
      }
      case "BOT_JOIN": {
        const actor = isManagedUserId(event.actorUserId) ? event.actorUserId : "u1";
        const actorClient = clients[actor];
        if (!actorClient) return;
        room.onMessageEvents.emit("ADD_BOT", actorClient as any, {
          botId: String(event.payload?.botId ?? `replay_bot_${event.seq}`),
          buyInCents: Number(event.payload?.buyInCents ?? 5000),
        });
        return;
      }
      case "CONSENTED_LEAVE": {
        const target = event.targetUserId;
        if (!isManagedUserId(target)) return;
        const client = clients[target];
        if (!client) return;
        await room.onLeave(client as any, 4000);
        joinedUsers.delete(target);
        return;
      }
      case "MARK_DISCONNECTED": {
        const target = event.targetUserId;
        if (!target) return;
        if (typeof room.dealer?.markDisconnectedSerialized === "function") {
          await room.dealer.markDisconnectedSerialized(target, Date.now() + 60_000);
        } else if (typeof room.dealer?.markDisconnected === "function") {
          room.dealer.markDisconnected(target, Date.now() + 60_000);
        }
        return;
      }
      case "MARK_RECONNECTED": {
        const target = event.targetUserId;
        if (!target) return;
        if (typeof room.dealer?.markReconnectedSerialized === "function") {
          await room.dealer.markReconnectedSerialized(target);
        } else if (typeof room.dealer?.markReconnected === "function") {
          room.dealer.markReconnected(target);
        }
        return;
      }
      case "HANDLE_ACTION": {
        const actor = event.actorUserId;
        if (!isManagedUserId(actor)) return;
        const client = clients[actor];
        if (!client || !event.payload) return;
        room.onMessageEvents.emit("ACTION", client as any, { actionId: `repro_${event.seq}`, ...event.payload });
        return;
      }
      case "FORCE_NEXT_HAND_TEST_HOOK": {
        if (room.state?.street === "WAITING" && typeof room.dealer?.forceAdvanceToNextHandForTest === "function") {
          room.dealer.forceAdvanceToNextHandForTest();
        }
        return;
      }
      default:
        return;
    }
  };

  let appliedEvents = 0;
  try {
    let prevT = 0;
    for (const event of events) {
      const nextDelay = Math.max(0, Math.min(350, event.t - prevT));
      prevT = event.t;
      if (nextDelay > 0) await delay(nextDelay);
      await waitForAlignment(event);
      await applyEvent(event);
      await delay(90);
      appliedEvents += 1;
      maybeRecordInstantFailure(event);
      maybeRecordLatentFailure(event);
      if (firstPayoutMismatch && firstPayoutMismatch.seq < 0) firstPayoutMismatch.seq = event.seq;
    }

    const summary: ReplaySummary = {
      source: path.resolve(args.source),
      totalEvents: events.length,
      appliedEvents,
      scenario: violationMeta.scenario ?? null,
      seed,
      firstInstantInvariantFailure,
      firstLatentFailure,
      firstPayoutMismatch,
      finalState: buildDigest(),
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2));
    if (snapshotFindings.length > 0) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ snapshotFindings: snapshotFindings.slice(0, 20) }, null, 2));
    }

    if (firstInstantInvariantFailure || firstLatentFailure || firstPayoutMismatch) {
      process.exitCode = 1;
    }
  } finally {
    for (const userId of ["u1", "u2", "u3", "u4"] as UserId[]) {
      const client = clients[userId];
      if (!client) continue;
      try {
        await room.onLeave(client as any, 4000);
      } catch {}
    }
    try {
      await gameServer.gracefullyShutdown(false);
    } catch {}
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    (CashierService as any).processCashGameBuyIn = buyInSpy;
    (CashierService as any).processCashGameCashOut = cashOutSpy;
    Math.random = originalRandom;
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("repro run failed", err);
  process.exit(1);
});
