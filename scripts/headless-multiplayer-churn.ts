import http from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { LobbyRoom } from "../src/lobby/LobbyRoom.js";
import { PokerRoom } from "../src/rooms/PokerRoom.js";
import { CashierService } from "../src/engine/economy/CashierService.js";
import type { DealerDiagnosticEvent, DealerDiagnosticType } from "../src/engine/Dealer.js";
import {
  getActionableToActSeatFindingFromSnapshot,
  getSnapshotMoneyFindings,
  isActionableStatePhase,
} from "../src/engine/invariants/churnInvariantContract.js";

// Headless churn should run with deterministic immediate bot turns.
process.env.POKER_BOT_DELAY_MS = "0";

type UserId = "u1" | "u2" | "u3" | "u4";
type ScenarioName = "fold-storm" | "allin-ladder" | "join-leave-thrash" | "endurance";
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
  digest: Record<string, unknown>;
};

type DiagnosticRecord = {
  seq: number;
  t: number;
  type: DealerDiagnosticType;
  level: "warn" | "error" | "info";
  code: string | null;
  message: string;
  context?: Record<string, unknown>;
};

type Args = {
  scenario: ScenarioName;
  seed: number;
  hands: number;
  iterations: number;
  invariantMode: "strict" | "collect";
};

function isManagedHumanUserId(value: unknown): value is UserId {
  return value === "u1" || value === "u2" || value === "u3" || value === "u4";
}

const DIAGNOSTIC_DENYLIST: DealerDiagnosticType[] = [
  "QUEUED_AUTO_ACTION_FAILED",
  "QUEUE_RECOVERY_AFTER_FAILURE",
  "ACTION_FAILED",
];

function parseArgs(): Args {
  const defaults: Args = {
    scenario: "endurance",
    seed: 20260225,
    hands: 12,
    iterations: 1,
    invariantMode: "strict",
  };

  for (const raw of process.argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, "").split("=");
    if (!value) continue;
    if (key === "scenario" && ["fold-storm", "allin-ladder", "join-leave-thrash", "endurance"].includes(value)) {
      defaults.scenario = value as ScenarioName;
    } else if (key === "seed") {
      defaults.seed = Number(value);
    } else if (key === "hands") {
      defaults.hands = Number(value);
    } else if (key === "iterations") {
      defaults.iterations = Number(value);
    } else if (key === "invariant-mode" && (value === "strict" || value === "collect")) {
      defaults.invariantMode = value;
    }
  }

  return defaults;
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

function randomInt(rng: () => number, min: number, max: number): number {
  if (max <= min) return min;
  return Math.floor(rng() * (max - min + 1)) + min;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out waiting for: ${label}`);
    }
    await delay(25);
  }
}

function sumPayouts(payoutsByUserId: Record<string, number> | undefined): number {
  return Object.values(payoutsByUserId ?? {}).reduce((sum, amount) => sum + amount, 0);
}

async function runSingleScenario(args: Args, iteration: number): Promise<void> {
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;

  const rng = mulberry32(args.seed + iteration * 9973);
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
      tableId: `churn_${args.scenario}_${Date.now()}_${iteration}`,
      name: `Headless Churn ${args.scenario}`,
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
  if (!room) throw new Error("Failed to resolve local room");

  const snapshots: Record<UserId, TableSnapshotPayload | null> = {
    u1: null,
    u2: null,
    u3: null,
    u4: null,
  };
  const sessionRestored: Record<UserId, boolean> = {
    u1: false,
    u2: false,
    u3: false,
    u4: false,
  };
  const seenSeqByUser = new Map<UserId, number>();
  const resultByHandId = new Map<string, NonNullable<TableSnapshotPayload["lastHandResult"]>>();
  const seenCompletedHandIds = new Set<string>();
  const completedAtByHandId = new Map<string, number>();
  const invariantFindings: string[] = [];
  const nonActionableNullBySnapshotSeq = new Map<UserId, number>();
  const stallStartByUser = new Map<UserId, number>();
  let noActorStallStartedAt: number | null = null;
  let botToActStallStartedAt: number | null = null;
  let botToActStallKey: string | null = null;
  let strictInvariantFailure: string | null = null;
  let recorderSeq = 0;
  const startedAt = Date.now();
  const recorderEvents: RecorderEvent[] = [];
  const diagnosticsLog: DiagnosticRecord[] = [];

  const recordFinding = (message: string): void => {
    invariantFindings.push(message);
    if (args.invariantMode === "strict" && !strictInvariantFailure) {
      strictInvariantFailure = message;
    }
  };

  const buildServerStateDump = (): string => {
    const seats = (room.state?.seats ?? []).map((userId: string, seat: number) => {
      const player = userId ? room.state?.playersById?.get?.(userId) : undefined;
      return {
        seat,
        userId: userId || null,
        occupied: Boolean(userId),
        status: player?.status ?? null,
        needsAction: player?.needsAction ?? null,
        stackCents: player?.stackCents ?? null,
        committedCents: player?.committedCents ?? null,
        roundBetCents: player?.roundBetCents ?? null,
        pendingLeave: player?.pendingLeave ?? null,
        pendingRemovalReason: player?.pendingRemovalReason ?? null,
      };
    });
    return JSON.stringify({
      handId: room.state?.handId ?? null,
      street: room.state?.street ?? null,
      toActSeat: room.state?.toActSeat ?? null,
      potCents: room.state?.potCents ?? null,
      roundCurrentBetCents: room.state?.roundCurrentBetCents ?? null,
      seats,
    });
  };

  const buildStateDigest = (): Record<string, unknown> => {
    const players = Array.from(room.state?.playersById?.values?.() ?? []);
    const eligibleActors = players.filter((p: any) => p?.status === "ACTIVE").length;
    const needsAction = players.filter((p: any) => p?.status === "ACTIVE" && p?.needsAction).length;
    const contenders = players.filter((p: any) => p?.status === "ACTIVE" || p?.status === "ALL_IN").length;
    const toActUserId = room.state?.seats?.[room.state?.toActSeat ?? -1] ?? null;
    const toActPlayer = toActUserId ? room.state?.playersById?.get?.(toActUserId) : undefined;
    return {
      actionable: isActionableStatePhase(room.state),
      eligibleActors,
      needsAction,
      contenders,
      potCents: room.state?.potCents ?? 0,
      totalCommittedCents: players.reduce((sum: number, p: any) => sum + (p?.committedCents ?? 0), 0),
      toActSeat: room.state?.toActSeat ?? -1,
      toActUserId,
      toActStatus: toActPlayer?.status ?? null,
      toActNeedsAction: toActPlayer?.needsAction ?? null,
    };
  };

  const recordEvent = (
    kind: RecorderEvent["kind"],
    input: { actorUserId?: string; targetUserId?: string; payload?: Record<string, unknown> },
  ): void => {
    recorderSeq += 1;
    recorderEvents.push({
      seq: recorderSeq,
      t: Date.now() - startedAt,
      kind,
      handId: room.state?.handId ?? null,
      street: room.state?.street ?? null,
      toActSeat: room.state?.toActSeat ?? null,
      actorUserId: input.actorUserId,
      targetUserId: input.targetUserId,
      payload: input.payload,
      digest: buildStateDigest(),
    });
  };

  const persistReproArtifact = async (cause: string): Promise<void> => {
    try {
      const tableId = room.state?.tableId ?? `unknown_${Date.now()}`;
      const folder = path.join(process.cwd(), "artifacts", "churn-repro", `${tableId}_${Date.now()}`);
      await mkdir(folder, { recursive: true });

      const eventsJsonl = recorderEvents.map((event) => JSON.stringify(event)).join("\n");
      const diagnosticsJsonl = diagnosticsLog.map((d) => JSON.stringify(d)).join("\n");
      const primaryCause = strictInvariantFailure ?? cause;
      const actionableInvalid = recorderEvents.find(
        (event) =>
          Boolean(event.digest?.actionable) &&
          (event.digest?.toActStatus !== "ACTIVE" || event.digest?.toActNeedsAction !== true),
      );
      const lastEvent = recorderEvents[recorderEvents.length - 1];
      const previousDigest = recorderEvents[recorderEvents.length - 2]?.digest ?? null;
      const currentDigest = buildStateDigest();
      const digestDelta: Record<string, { from: unknown; to: unknown }> = {};
      if (previousDigest && typeof previousDigest === "object") {
        for (const [key, nextValue] of Object.entries(currentDigest)) {
          const prevValue = (previousDigest as Record<string, unknown>)[key];
          if (prevValue !== nextValue) digestDelta[key] = { from: prevValue, to: nextValue };
        }
      }
      const violation = {
        cause: primaryCause,
        originalError: cause,
        scenario: args.scenario,
        seed: args.seed,
        hands: args.hands,
        iterations: args.iterations,
        invariantMode: args.invariantMode,
        strictInvariantFailure,
        completedHands: seenCompletedHandIds.size,
        completedAtMs: Array.from(completedAtByHandId.entries()),
        stateDump: JSON.parse(buildServerStateDump()),
        stateDigest: currentDigest,
        digestDeltaFromPrevious: digestDelta,
        firstActionableInvalid: actionableInvalid
          ? {
              seq: actionableInvalid.seq,
              kind: actionableInvalid.kind,
              handId: actionableInvalid.handId,
              street: actionableInvalid.street,
              digest: actionableInvalid.digest,
            }
          : null,
        lastEvents: recorderEvents.slice(-200),
        lastDiagnostics: diagnosticsLog.slice(-200),
      };

      await writeFile(path.join(folder, "events.jsonl"), `${eventsJsonl}\n`, "utf8");
      await writeFile(path.join(folder, "diagnostics.jsonl"), `${diagnosticsJsonl}\n`, "utf8");
      await writeFile(path.join(folder, "violation.json"), `${JSON.stringify(violation, null, 2)}\n`, "utf8");
      // eslint-disable-next-line no-console
      console.error(`churn repro artifact written: ${folder}`);
      // eslint-disable-next-line no-console
      console.error(
        [
          `STRICT FAILURE: ${primaryCause}`,
          `first actionable invalid seq=${actionableInvalid?.seq ?? "none"}`,
          `lastEvent=${lastEvent?.kind ?? "none"} actor=${lastEvent?.actorUserId ?? "none"} target=${lastEvent?.targetUserId ?? "none"}`,
          `digest=${JSON.stringify(currentDigest)}`,
          `delta=${JSON.stringify(digestDelta)}`,
        ].join("\n"),
      );
    } catch (artifactError) {
      // eslint-disable-next-line no-console
      console.error("failed to persist churn repro artifact", artifactError);
    }
  };

  const removeDiagnosticListener = typeof room.dealer?.addDiagnosticListener === "function"
    ? room.dealer.addDiagnosticListener((event: DealerDiagnosticEvent) => {
        recorderSeq += 1;
        diagnosticsLog.push({
          seq: recorderSeq,
          t: Date.now() - startedAt,
          type: event.type,
          level: event.level,
          code: event.code ?? null,
          message: event.message,
          context: event.context,
        });
        if (DIAGNOSTIC_DENYLIST.includes(event.type)) {
          recordFinding(
            `diagnostic denylist match: type=${event.type} level=${event.level} code=${event.code ?? "none"}`,
          );
        }
      })
    : undefined;

  const makeClient = (sessionId: string, userId: UserId): ClientLike => ({
    sessionId,
    leave: () => {},
    send: (type: string, payload: unknown) => {
      const activeClient = clients[userId];
      if (!activeClient || activeClient.sessionId !== sessionId) return;
      if (type === "SESSION_RESTORED") sessionRestored[userId] = true;
      if (type !== "TABLE_SNAPSHOT") return;

      const snap = payload as TableSnapshotPayload;
      const prev = seenSeqByUser.get(userId);
      if (typeof prev === "number" && snap.snapshotSeq <= prev) {
        recordFinding(`snapshotSeq non-monotonic user=${userId} prev=${prev} next=${snap.snapshotSeq}`);
      }
      seenSeqByUser.set(userId, snap.snapshotSeq);
      snapshots[userId] = snap;

      if (snap.lastHandResult?.handId) {
        if (!seenCompletedHandIds.has(snap.lastHandResult.handId)) {
          seenCompletedHandIds.add(snap.lastHandResult.handId);
          completedAtByHandId.set(snap.lastHandResult.handId, Date.now() - startedAt);
        }
        resultByHandId.set(snap.lastHandResult.handId, snap.lastHandResult);
      }

      const toActFinding = getActionableToActSeatFindingFromSnapshot(snap);
      if (toActFinding) {
        recordFinding(toActFinding);
      }

      for (const finding of getSnapshotMoneyFindings(snap)) {
        recordFinding(finding);
      }
    },
  });

  const clients: Partial<Record<UserId, ClientLike>> = {
    u1: makeClient(`sess_u1_${iteration}`, "u1"),
    u2: makeClient(`sess_u2_${iteration}`, "u2"),
  };
  const joinedUsers = new Set<UserId>(["u1", "u2"]);
  const usernames: Record<UserId, string> = { u1: "alice", u2: "bob", u3: "charlie", u4: "dana" };

  async function joinUser(userId: UserId, buyInCents = 5000): Promise<void> {
    if (joinedUsers.has(userId)) return;
    const client = makeClient(`sess_${userId}_${Date.now()}`, userId);
    clients[userId] = client;
    recordEvent("HUMAN_JOIN", { targetUserId: userId, payload: { buyInCents } });
    await room.onJoin(client as any, { buyInCents }, { userId, username: usernames[userId] });
    joinedUsers.add(userId);
  }

  async function leaveUser(userId: UserId): Promise<void> {
    if (!joinedUsers.has(userId)) return;
    const client = clients[userId];
    if (!client) return;
    recordEvent("CONSENTED_LEAVE", { targetUserId: userId });
    await room.onLeave(client as any, 4000);
    joinedUsers.delete(userId);
  }

  const emitAction = (userId: UserId, payload: { action: "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN"; amountCents?: number }) => {
    const client = clients[userId];
    if (!client) return;
    recordEvent("HANDLE_ACTION", { actorUserId: userId, payload });
    room.onMessageEvents.emit("ACTION", client, { actionId: randomUUID(), ...payload });
  };
  const seenTurnActionKeys = new Set<string>();
  const emitActionOncePerTurn = (
    userId: UserId,
    payload: { action: "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN"; amountCents?: number },
  ): boolean => {
    const handId = room.state?.handId ?? "";
    const street = room.state?.street ?? "";
    const handActionSeq = room.state?.handActionSeq ?? -1;
    const toActSeat = room.state?.toActSeat ?? -1;
    const toActStateUserId = room.state?.seats?.[toActSeat];
    if (toActStateUserId !== userId) return false;
    const key = `${handId}|${street}|${handActionSeq}|${toActSeat}|${userId}`;
    if (seenTurnActionKeys.has(key)) return false;
    seenTurnActionKeys.add(key);
    emitAction(userId, payload);
    return true;
  };

  const resolveActor = (): UserId | undefined => {
    if (!isActionableStatePhase(room.state)) return undefined;
    const toActSeat = room.state?.toActSeat;
    const toActUserId = room.state?.seats?.[toActSeat ?? -1];
    if (!isManagedHumanUserId(toActUserId)) {
      return undefined;
    }
    const player = room.state?.playersById?.get?.(toActUserId);
    if (!player || player.status !== "ACTIVE" || !player.needsAction) return undefined;
    return toActUserId;
  };

  const ensureCorePlayersBankrolled = async (): Promise<void> => {
    for (const userId of ["u1", "u2"] as UserId[]) {
      const player = room.state?.playersById?.get?.(userId);
      if (!joinedUsers.has(userId)) {
        await joinUser(userId, 5000);
        continue;
      }
      if (!player || (player.stackCents ?? 0) <= 0 || player.status === "OUT") {
        await leaveUser(userId);
        await joinUser(userId, 5000);
      }
    }
  };

  const chooseAction = (userId: UserId): { action: "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN"; amountCents?: number } | null => {
    const snap = snapshots[userId];
    if (!snap || snap.hand?.handId !== room.state?.handId) return null;
    const options = snap.hero?.actionOptions;
    if (!options) return null;

    if (args.scenario === "fold-storm") {
      if (options.canFold) return { action: "FOLD" };
      if (options.canCheck) return { action: "CHECK" };
      if (options.canCall) return { action: "CALL" };
      if (options.canAllIn) return { action: "ALL_IN" };
      return null;
    }

    if (args.scenario === "allin-ladder") {
      if (userId === "u3" && options.canAllIn) return { action: "ALL_IN" };
      if ((userId === "u1" || userId === "u2") && options.canRaise) {
        const min = options.minRaiseTo ?? options.maxRaiseTo ?? 100;
        const max = options.maxRaiseTo ?? min;
        return { action: "RAISE", amountCents: Math.min(max, Math.max(min, 1200)) };
      }
      if (options.canCall) return { action: "CALL" };
      if (options.canCheck) return { action: "CHECK" };
      if (options.canAllIn) return { action: "ALL_IN" };
      if (options.canFold) return { action: "FOLD" };
      return null;
    }

    // join-leave-thrash + endurance share randomized legal fallback.
    const legal: Array<{ action: "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN"; amountCents?: number }> = [];
    if (options.canFold) legal.push({ action: "FOLD" });
    if (options.canCheck) legal.push({ action: "CHECK" });
    if (options.canCall) legal.push({ action: "CALL" });
    if (options.canAllIn) legal.push({ action: "ALL_IN" });
    if (options.canBet) {
      const min = options.minRaiseTo ?? options.maxRaiseTo ?? 100;
      const max = options.maxRaiseTo ?? min;
      legal.push({ action: "BET", amountCents: randomInt(rng, min, max) });
    }
    if (options.canRaise) {
      const min = options.minRaiseTo ?? options.maxRaiseTo ?? 100;
      const max = options.maxRaiseTo ?? min;
      legal.push({ action: "RAISE", amountCents: randomInt(rng, min, max) });
    }

    if (legal.length === 0) return null;
    return legal[randomInt(rng, 0, legal.length - 1)]!;
  };

  try {
    recordEvent("HUMAN_JOIN", { targetUserId: "u1", payload: { buyInCents: 5000 } });
    await room.onJoin(clients.u1 as any, { buyInCents: 5000 }, { userId: "u1", username: usernames.u1 });
    recordEvent("HUMAN_JOIN", { targetUserId: "u2", payload: { buyInCents: 5000 } });
    await room.onJoin(clients.u2 as any, { buyInCents: 5000 }, { userId: "u2", username: usernames.u2 });

    await waitFor(() => Boolean(snapshots.u1?.hand?.handId) && Boolean(snapshots.u2?.hand?.handId), 7000, "initial active hand");

    if (args.scenario === "allin-ladder") {
      await joinUser("u3", 2000);
      recordEvent("BOT_JOIN", { actorUserId: "u1", payload: { botId: "chaos_carl", buyInCents: 5000 } });
      room.onMessageEvents.emit("ADD_BOT", clients.u1 as any, { botId: "chaos_carl", buyInCents: 5000 });
    } else if (args.scenario === "join-leave-thrash") {
      await joinUser("u3", 4000);
      recordEvent("BOT_JOIN", { actorUserId: "u1", payload: { botId: "nash_nate", buyInCents: 5000 } });
      room.onMessageEvents.emit("ADD_BOT", clients.u1 as any, { botId: "nash_nate", buyInCents: 5000 });
    } else if (args.scenario === "endurance") {
      await joinUser("u3", 4000);
      await joinUser("u4", 4000);
      recordEvent("BOT_JOIN", { actorUserId: "u1", payload: { botId: "chaos_carl", buyInCents: 5000 } });
      room.onMessageEvents.emit("ADD_BOT", clients.u1 as any, { botId: "chaos_carl", buyInCents: 5000 });
      recordEvent("BOT_JOIN", { actorUserId: "u1", payload: { botId: "nash_nate", buyInCents: 5000 } });
      room.onMessageEvents.emit("ADD_BOT", clients.u1 as any, { botId: "nash_nate", buyInCents: 5000 });
    }

    let completedHands = 0;
    let lastAppliedCompletedHands = 0;
    let thrashToggle = false;
    const timeoutBudgetMs = Math.max(90_000, args.hands * 15_000);
    const deadline = Date.now() + timeoutBudgetMs;

    while (completedHands < args.hands) {
      if (strictInvariantFailure) {
        throw new Error(`strict invariant failure: ${strictInvariantFailure}`);
      }
      if (Date.now() > deadline) {
        const snapshotSummary = (["u1", "u2", "u3", "u4"] as UserId[])
          .map((id) => `${id}:${snapshots[id]?.reason ?? "none"}#${snapshots[id]?.snapshotSeq ?? 0}`)
          .join(",");
        throw new Error(
          `scenario timeout ${args.scenario}; completedHands=${completedHands}; handId=${room.state?.handId ?? "none"}; street=${room.state?.street ?? "none"}; toActSeat=${room.state?.toActSeat ?? -1}; snapshots=${snapshotSummary}`,
        );
      }

      completedHands = seenCompletedHandIds.size;
      if (completedHands > lastAppliedCompletedHands) {
        for (let handCount = lastAppliedCompletedHands + 1; handCount <= completedHands; handCount += 1) {
          if (args.scenario === "join-leave-thrash" && handCount % 2 === 0) {
            thrashToggle = !thrashToggle;
            if (thrashToggle) await leaveUser("u3");
            else await joinUser("u3", 4000);
          }

          if (args.scenario === "endurance" && handCount % 3 === 0) {
            const target: UserId = rng() < 0.5 ? "u3" : "u4";
            if (joinedUsers.has(target)) {
              await leaveUser(target);
            } else {
              await joinUser(target, 4000);
            }
          }
        }
        lastAppliedCompletedHands = completedHands;
      }

      if (room.state?.street === "WAITING" && completedHands < args.hands) {
        await ensureCorePlayersBankrolled();
      }

      const isActionableState = isActionableStatePhase(room.state);
      const actor = resolveActor();
      const toActSeat = room.state?.toActSeat ?? -1;
      const toActUserId = room.state?.seats?.[toActSeat];
      const toActIsManagedHuman = isManagedHumanUserId(toActUserId);
      const toActPlayer = toActUserId ? room.state?.playersById?.get?.(toActUserId) : undefined;
      if (!actor || !joinedUsers.has(actor)) {
        if (
          isActionableState &&
          toActPlayer?.kind === "BOT" &&
          toActPlayer.status === "ACTIVE" &&
          toActPlayer.needsAction
        ) {
          const currentBotStallKey = [
            room.state?.handId ?? "unknown",
            room.state?.street ?? "unknown",
            String(room.state?.handActionSeq ?? -1),
            String(toActSeat),
            String(toActUserId),
          ].join("|");
          if (botToActStallKey !== currentBotStallKey) {
            botToActStallKey = currentBotStallKey;
            botToActStallStartedAt = Date.now();
          } else if (botToActStallStartedAt && Date.now() - botToActStallStartedAt > 1800) {
            const snapshotSummary = (["u1", "u2", "u3", "u4"] as UserId[])
              .map((id) => `${id}:${snapshots[id]?.reason ?? "none"}#${snapshots[id]?.snapshotSeq ?? 0}`)
              .join(",");
            recordFinding(
              [
                "STALL_BOT_TO_ACT_NO_PROGRESS",
                `handId=${room.state?.handId ?? "unknown"}`,
                `street=${room.state?.street ?? "unknown"}`,
                `toActSeat=${toActSeat}`,
                `toActUserId=${String(toActUserId ?? "none")}`,
                `handActionSeq=${room.state?.handActionSeq ?? -1}`,
                `snapshots=${snapshotSummary}`,
                `state=${buildServerStateDump()}`,
              ].join(" "),
            );
            botToActStallStartedAt = Date.now();
          }
        } else {
          botToActStallStartedAt = null;
          botToActStallKey = null;
        }
        if (isActionableState && toActIsManagedHuman) {
          const startedAt = noActorStallStartedAt ?? Date.now();
          noActorStallStartedAt = startedAt;
          if (Date.now() - startedAt > 1800) {
            const snapshotSummary = (["u1", "u2", "u3", "u4"] as UserId[])
              .map((id) => `${id}:${snapshots[id]?.reason ?? "none"}#${snapshots[id]?.snapshotSeq ?? 0}`)
              .join(",");
            recordFinding(
              [
                "STALL_NO_ELIGIBLE_ACTOR user=none",
                `handId=${room.state?.handId ?? "unknown"}`,
                `street=${room.state?.street ?? "unknown"}`,
                `toActSeat=${toActSeat}`,
                `toActUserId=${String(toActUserId ?? "none")}`,
                `snapshots=${snapshotSummary}`,
                `state=${buildServerStateDump()}`,
              ].join(" "),
            );
            noActorStallStartedAt = Date.now();
          }
        } else {
          noActorStallStartedAt = null;
        }
        await delay(40);
        continue;
      }
      noActorStallStartedAt = null;
      botToActStallStartedAt = null;
      botToActStallKey = null;
      if (!isActionableState) {
        stallStartByUser.delete(actor);
        await delay(40);
        continue;
      }
      const actorState = room.state?.playersById?.get?.(actor);
      const actorSnapshot = snapshots[actor];
      const hasActorActionableSnapshot =
        Boolean(actorSnapshot?.hero?.actionOptions) &&
        actorSnapshot?.hand?.handId === room.state?.handId &&
        !actorSnapshot?.lastHandResult?.handId;
      if (actorState?.needsAction && !hasActorActionableSnapshot) {
        const startedAt = stallStartByUser.get(actor) ?? Date.now();
        stallStartByUser.set(actor, startedAt);
        if (Date.now() - startedAt > 1800) {
          const snapshotSummary = (["u1", "u2", "u3", "u4"] as UserId[])
            .map((id) => `${id}:${snapshots[id]?.reason ?? "none"}#${snapshots[id]?.snapshotSeq ?? 0}`)
            .join(",");
          recordFinding(
            [
              `STALL_NO_ELIGIBLE_ACTOR user=${actor}`,
              `handId=${room.state?.handId ?? "unknown"}`,
              `street=${room.state?.street ?? "unknown"}`,
              `toActSeat=${room.state?.toActSeat ?? -1}`,
              `status=${actorState.status}`,
              `snapshots=${snapshotSummary}`,
              `state=${buildServerStateDump()}`,
            ].join(" "),
          );
          stallStartByUser.set(actor, Date.now());
        }
      } else {
        stallStartByUser.delete(actor);
      }

      const action = chooseAction(actor);
      if (!action) {
        const actorState = room.state?.playersById?.get?.(actor);
        if (actorState?.needsAction) {
          const actorSnapshot = snapshots[actor];
          const hasSameHandSnapshot = actorSnapshot?.hand?.handId === room.state?.handId;
          const hasActionableSnapshotContext =
            hasSameHandSnapshot &&
            Boolean(actorSnapshot?.hero?.actionOptions) &&
            !actorSnapshot?.lastHandResult?.handId;
          const seq = actorSnapshot?.snapshotSeq ?? -1;
          if (hasActionableSnapshotContext) {
            const priorLoggedSeq = nonActionableNullBySnapshotSeq.get(actor);
            if (priorLoggedSeq !== seq) {
              const context = [
                `needsAction-without-action user=${actor}`,
                `handId=${room.state?.handId ?? "unknown"}`,
                `street=${room.state?.street ?? "unknown"}`,
                `toActSeat=${room.state?.toActSeat ?? -1}`,
                `reason=${actorSnapshot?.reason ?? "unknown"}`,
              ].join(" ");
              recordFinding(context);
              nonActionableNullBySnapshotSeq.set(actor, seq);
            }
          }
          const baselineSeq = seq;
          await waitFor(
            () => (snapshots[actor]?.snapshotSeq ?? baselineSeq) > baselineSeq,
            1200,
            `next snapshot for ${actor} after null action resolution`,
          ).catch(() => {});
        } else {
          await delay(40);
        }
        continue;
      }

      emitActionOncePerTurn(actor, action);
      await delay(80);
    }

    for (const [handId, result] of resultByHandId.entries()) {
      const totalPayout = sumPayouts(result.payoutsByUserId);
      if (totalPayout !== result.potCents) {
        throw new Error(`payout mismatch hand=${handId} payouts=${totalPayout} pot=${result.potCents}`);
      }
    }
    if (invariantFindings.length > 0) {
      throw new Error(`snapshot invariants failed (${invariantFindings.length}): ${invariantFindings.slice(0, 5).join(" | ")}`);
    }

    // eslint-disable-next-line no-console
    console.log(
      `headless churn OK scenario=${args.scenario} iteration=${iteration + 1}/${args.iterations} hands=${completedHands} results=${resultByHandId.size} completedAtMs=${JSON.stringify(Array.from(completedAtByHandId.entries()))}`,
    );
  } catch (error) {
    await persistReproArtifact(error instanceof Error ? error.message : String(error));
    throw error;
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
    try {
      removeDiagnosticListener?.();
    } catch {}
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  for (let i = 0; i < args.iterations; i += 1) {
    await runSingleScenario(args, i);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("headless churn FAILED", err);
  process.exit(1);
});
