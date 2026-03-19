import http from "node:http";
import { randomUUID } from "node:crypto";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { LobbyRoom } from "../apps/server/src/lobby/LobbyRoom.js";
import { PokerRoom } from "../apps/server/src/rooms/PokerRoom.js";
import { CashierService } from "../apps/server/src/engine/economy/CashierService.js";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean, timeoutMs: number, label: string) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out waiting for: ${label}`);
    }
    await delay(25);
  }
}

type UserId = "user_a" | "user_b" | "user_c";
type ClientLike = { sessionId: string; send: (type: string, payload: unknown) => void; leave: () => void };

async function main() {
  // Force in-memory persistence mode for deterministic harness runs.
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;

  const buyInSpy = CashierService.processCashGameBuyIn;
  const cashOutSpy = CashierService.processCashGameCashOut;

  // Harness mode: bypass DB wallet movement so script is deterministic.
  (CashierService as any).processCashGameBuyIn = async () => ({ success: true, newTableBalance: 5000 });
  (CashierService as any).processCashGameCashOut = async () => ({ success: true });

  const httpServer = http.createServer();
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
  });

  gameServer.define("lobby", LobbyRoom);
  gameServer.define("poker", PokerRoom);

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));

  const created = await matchMaker.createRoom("poker", {
    tableConfig: {
      tableId: "headless_table",
      name: "Headless Harness",
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
  // Harness drives onJoin/onLeave manually with fake clients; keep room alive even when clientCount remains 0.
  room.autoDispose = false;

  const roomDisposed = () => Boolean((room as any).disposed || (room as any)._disposed);

  const snapshots: Record<UserId, TableSnapshotPayload | null> = {
    user_a: null,
    user_b: null,
    user_c: null,
  };
  const sessionRestored: Record<UserId, boolean> = {
    user_a: false,
    user_b: false,
    user_c: false,
  };
  const lastHandResultsByHandId = new Map<string, NonNullable<TableSnapshotPayload["lastHandResult"]>>();

  const makeClient = (sessionId: string, userId: UserId): ClientLike => ({
    sessionId,
    send: (type: string, payload: unknown) => {
      if (type === "TABLE_SNAPSHOT") {
        const snap = payload as TableSnapshotPayload;
        snapshots[userId] = snap;
        if (snap.lastHandResult?.handId) {
          lastHandResultsByHandId.set(snap.lastHandResult.handId, snap.lastHandResult);
        }
      }
      if (type === "SESSION_RESTORED") sessionRestored[userId] = true;
    },
    leave: () => {},
  });

  const clients: Record<UserId, ClientLike> = {
    user_a: makeClient("sess_a", "user_a"),
    user_b: makeClient("sess_b", "user_b"),
    user_c: makeClient("sess_c", "user_c"),
  };

  const userNameById: Record<UserId, string> = {
    user_a: "alice",
    user_b: "bob",
    user_c: "charlie",
  };

  const emitAction = (userId: UserId, payload: { action: "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN"; amountCents?: number }) => {
    room.onMessageEvents.emit("ACTION", clients[userId], { actionId: randomUUID(), ...payload });
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

  const activeHand = () => snapshots.user_a?.hand;
  const roomStreet = () => room.state?.street as string;
  const roomHandId = () => room.state?.handId as string;
  const roomHandNumber = () => (room.state?.handNumber as number) ?? 0;
  const hasVisibleCurrentHand = (): boolean => {
    const handId = roomHandId();
    if (!handId) return false;
    return (["user_a", "user_b", "user_c"] as const).some(
      (userId) => snapshots[userId]?.hand?.handId === handId,
    );
  };
  const hasAnySeatedUserSnapshot = (): boolean =>
    (["user_a", "user_b", "user_c"] as const).some((userId) => Boolean(snapshots[userId]?.hero?.youAreSeated));
  const resolveReadyUsersForNextHand = (): UserId[] =>
    (["user_a", "user_b", "user_c"] as const).filter((userId) => {
      const player = room.state?.playersById.get(userId);
      return Boolean(
        player &&
        room.state?.seats?.includes(userId) &&
        player.status !== "OUT" &&
        player.status !== "ABANDONED" &&
        player.stackCents > 0 &&
        player.sittingOutUntilNextHand !== true,
      );
    });
  const canAct = (userId: UserId): boolean => {
    const opts = snapshots[userId]?.hero?.actionOptions;
    return Boolean(
      opts && (opts.canCheck || opts.canCall || opts.canFold || opts.canAllIn || opts.canBet || opts.canRaise),
    );
  };
  const resolveSnapshotActorUserId = (): UserId | undefined => {
    if (roomStreet() === "WAITING") return undefined;
    const handId = roomHandId();
    if (!handId) return undefined;

    const actors = (["user_a", "user_b", "user_c"] as const).filter(
      (userId) => snapshots[userId]?.hand?.handId === handId && canAct(userId),
    );
    if (actors.length === 1) return actors[0];

    // Fallback to server-authoritative toActSeat when snapshots are briefly out of sync.
    const toActSeat = room.state?.toActSeat;
    const toActStateUserId = room.state?.seats?.[toActSeat ?? -1];
    if (
      (toActStateUserId === "user_a" || toActStateUserId === "user_b" || toActStateUserId === "user_c") &&
      snapshots[toActStateUserId]?.hand?.handId === handId
    ) {
      return toActStateUserId;
    }
    return undefined;
  };

  const waitForHandAdvance = async (fromHandNumber: number) => {
    await waitFor(
      () => roomHandNumber() > fromHandNumber,
      15000,
      "next hand",
    );
  };

  const settleToWaitingState = async (): Promise<void> => {
    let guard = 0;
    while (roomStreet() !== "WAITING" && guard < 120) {
      guard += 1;
      const actingUserId = resolveSnapshotActorUserId();
      if (!actingUserId) {
        await delay(50);
        continue;
      }
      const options = snapshots[actingUserId]?.hero?.actionOptions;
      if (!options || snapshots[actingUserId]?.hand?.handId !== roomHandId()) {
        await delay(50);
        continue;
      }
      if (options.canCheck) emitActionOncePerTurn(actingUserId, { action: "CHECK" });
      else if (options.canCall) emitActionOncePerTurn(actingUserId, { action: "CALL" });
      else if (options.canFold) emitActionOncePerTurn(actingUserId, { action: "FOLD" });
      else if (options.canAllIn) emitActionOncePerTurn(actingUserId, { action: "ALL_IN" });
      else await delay(50);
      await delay(120);
    }
    try {
      await waitFor(() => roomStreet() === "WAITING", 20_000, "table waiting before persistence/rejoin check");
    } catch {
      // Best effort only: room persistence/rejoin checks below are valid even if we are mid-hand.
    }
  };

  try {
    await room.onJoin(clients.user_a as any, { buyInCents: 5000 }, { userId: "user_a", username: "alice" });
    await room.onJoin(clients.user_b as any, { buyInCents: 5000 }, { userId: "user_b", username: "bob" });

    await waitFor(() => Boolean(snapshots.user_a) && Boolean(snapshots.user_b), 5000, "initial snapshots");
    await waitFor(
      () =>
        Boolean(snapshots.user_a?.hero.youAreSeated) &&
        Boolean(snapshots.user_b?.hero.youAreSeated) &&
        (snapshots.user_a?.seats.filter((s) => s.occupied).length ?? 0) >= 2,
      5000,
      "both users seated",
    );
    await waitFor(() => Boolean(snapshots.user_a?.hand?.handId) && Boolean(snapshots.user_b?.hand?.handId), 5000, "active hand");

    const firstHandId = snapshots.user_a!.hand!.handId;
    const firstHandNumber = snapshots.user_a!.hand!.handNumber;
    const toActUserId = resolveSnapshotActorUserId();

    if (!toActUserId) throw new Error("No to-act user in snapshot");
    emitActionOncePerTurn(toActUserId, { action: "FOLD" });
    await waitForHandAdvance(firstHandNumber);

    await room.onJoin(clients.user_c as any, { buyInCents: 2000 }, { userId: "user_c", username: "charlie" });
    await waitFor(() => Boolean(snapshots.user_c?.hero.youAreSeated), 5000, "third player seated");

    const sidePotStartHand = activeHand()?.handNumber ?? 0;
    let seenShortAllIn = false;
    let seenLargeRaise = false;
    let seenCallAfterRaise = false;
    let seenFollowUpContest = false;

    const sidePotDeadlineMs = Date.now() + 25_000;
    let sidePotLastSnapshotId = snapshots.user_a?.snapshotId ?? "";
    while ((!seenShortAllIn || !seenLargeRaise || !seenCallAfterRaise) && Date.now() < sidePotDeadlineMs) {
      const hand = activeHand();
      if (!hand) {
        await delay(40);
        continue;
      }

      const actingUserId = resolveSnapshotActorUserId();
      if (!actingUserId) {
        await delay(60);
        continue;
      }
      if (hand.handId !== roomHandId()) {
        await delay(60);
        continue;
      }

      const heroOptions = snapshots[actingUserId]?.hero?.actionOptions;
      const actorHandId = snapshots[actingUserId]?.hand?.handId;
      if (!heroOptions || actorHandId !== roomHandId()) {
        await delay(60);
        continue;
      }

      if (actingUserId === "user_c" && !seenShortAllIn && heroOptions.canAllIn) {
        emitActionOncePerTurn(actingUserId, { action: "ALL_IN" });
        seenShortAllIn = true;
      } else if ((actingUserId === "user_a" || actingUserId === "user_b") && seenShortAllIn && !seenLargeRaise && heroOptions.canRaise) {
        const target = Math.max(heroOptions.minRaiseTo ?? 0, 1200);
        const amountCents = Math.min(target, heroOptions.maxRaiseTo ?? target);
        emitActionOncePerTurn(actingUserId, { action: "RAISE", amountCents });
        seenLargeRaise = true;
        seenFollowUpContest = true;
      } else if ((actingUserId === "user_a" || actingUserId === "user_b") && seenLargeRaise && !seenCallAfterRaise && heroOptions.canCall) {
        emitActionOncePerTurn(actingUserId, { action: "CALL" });
        seenCallAfterRaise = true;
        seenFollowUpContest = true;
      } else if ((actingUserId === "user_a" || actingUserId === "user_b") && seenShortAllIn && heroOptions.canCall) {
        emitActionOncePerTurn(actingUserId, { action: "CALL" });
        seenFollowUpContest = true;
      } else if ((actingUserId === "user_a" || actingUserId === "user_b") && seenShortAllIn && heroOptions.canAllIn) {
        emitActionOncePerTurn(actingUserId, { action: "ALL_IN" });
        seenFollowUpContest = true;
      } else if (heroOptions.canCheck) {
        emitActionOncePerTurn(actingUserId, { action: "CHECK" });
      } else if (heroOptions.canCall) {
        emitActionOncePerTurn(actingUserId, { action: "CALL" });
      } else if (heroOptions.canAllIn) {
        emitActionOncePerTurn(actingUserId, { action: "ALL_IN" });
      } else {
        emitActionOncePerTurn(actingUserId, { action: "FOLD" });
      }
      await delay(140);
      sidePotLastSnapshotId = snapshots.user_a?.snapshotId ?? sidePotLastSnapshotId;
    }

    if ((activeHand()?.handNumber ?? 0) <= sidePotStartHand) {
      await waitForHandAdvance(sidePotStartHand);
    }

    if (!seenShortAllIn || !seenFollowUpContest) {
      throw new Error(
        `Side-pot scenario incomplete: shortAllIn=${seenShortAllIn}, followUpContest=${seenFollowUpContest}, raise=${seenLargeRaise}, callAfterRaise=${seenCallAfterRaise}`,
      );
    }

    await waitFor(
      () =>
        !roomDisposed() &&
        (
          roomStreet() === "WAITING" ||
          (Boolean(roomHandId()) && hasVisibleCurrentHand()) ||
          hasAnySeatedUserSnapshot()
        ),
      20_000,
      "reconnect scenario hand or waiting table",
    );
    if (roomDisposed()) {
      throw new Error("Room disposed before reconnect scenario could begin");
    }

    let reconnectUserId = resolveSnapshotActorUserId();
    if (!reconnectUserId && roomStreet() === "WAITING") {
      reconnectUserId = resolveReadyUsersForNextHand()[0];
    }
    if (!reconnectUserId) {
      try {
        await waitFor(() => Boolean(resolveSnapshotActorUserId()), 6000, "reconnect target actor");
      } catch {}
      reconnectUserId =
        resolveSnapshotActorUserId() ??
        resolveReadyUsersForNextHand()[0] ??
        (snapshots.user_a?.hero.youAreSeated
          ? "user_a"
          : snapshots.user_b?.hero.youAreSeated
            ? "user_b"
            : snapshots.user_c?.hero.youAreSeated
              ? "user_c"
              : undefined);
    }
    if (!reconnectUserId) throw new Error("No reconnect target user");

    clients[reconnectUserId] = makeClient(`sess_${reconnectUserId}_restored`, reconnectUserId);
    await room.onJoin(
      clients[reconnectUserId] as any,
      { buyInCents: 5000 },
      { userId: reconnectUserId, username: userNameById[reconnectUserId] },
    );

    await waitFor(() => Boolean(sessionRestored[reconnectUserId]), 5000, "session restored");
    await waitFor(() => snapshots[reconnectUserId]?.snapshotId !== undefined, 5000, "restored snapshot");

    let emittedProgressAction = false;
    const reconnectProgressBaselineHandNo = roomHandNumber();
    const reconnectProgressBaselineSnapshotId = snapshots[reconnectUserId]?.snapshotId;

    for (let i = 0; i < 32; i += 1) {
      const hand = activeHand();
      if (!hand) break;
      const actingUserId = resolveSnapshotActorUserId();
      if (!actingUserId) {
        await delay(35);
        continue;
      }

      const options = snapshots[actingUserId]?.hero?.actionOptions;
      const actorHandId = snapshots[actingUserId]?.hand?.handId;
      if (!options || actorHandId !== roomHandId()) {
        await delay(35);
        continue;
      }

      if (options.canCheck) emitActionOncePerTurn(actingUserId, { action: "CHECK" });
      else if (options.canCall) emitActionOncePerTurn(actingUserId, { action: "CALL" });
      else if (options.canAllIn) emitActionOncePerTurn(actingUserId, { action: "ALL_IN" });
      else emitActionOncePerTurn(actingUserId, { action: "FOLD" });

      emittedProgressAction = true;
      break;
    }

    if (!emittedProgressAction && activeHand()) {
      await waitFor(
        () =>
          roomHandNumber() > reconnectProgressBaselineHandNo ||
          snapshots[reconnectUserId]?.snapshotId !== reconnectProgressBaselineSnapshotId,
        12000,
        "reconnect progress without direct action",
      );
    }

    // Strict reconnect path: simulate transport drop and room-level reconnection grace recovery.
    const graceUserId = resolveReadyUsersForNextHand().find((userId) => userId !== reconnectUserId);
    if (graceUserId) {
      const previousClient = clients[graceUserId];
      const restoredGraceClient = makeClient(`sess_${graceUserId}_grace_restore`, graceUserId);
      sessionRestored[graceUserId] = false;
      const previousSnapshotId = snapshots[graceUserId]?.snapshotId;

      const originalAllowReconnection = room.allowReconnection.bind(room);
      (room as any).allowReconnection = async () => restoredGraceClient as any;

      try {
        await room.onLeave(previousClient as any, 1006);
      } finally {
        (room as any).allowReconnection = originalAllowReconnection;
      }

      clients[graceUserId] = restoredGraceClient;

      await waitFor(() => Boolean(sessionRestored[graceUserId]), 5000, "grace reconnect SESSION_RESTORED");
      await waitFor(
        () =>
          Boolean(snapshots[graceUserId]?.snapshotId) &&
          snapshots[graceUserId]!.snapshotId !== previousSnapshotId,
        5000,
        "grace reconnect snapshot refresh",
      );

      const postGraceHand = activeHand();
      if (postGraceHand) {
        const actingUserId = resolveSnapshotActorUserId();
        const options = actingUserId ? snapshots[actingUserId]?.hero?.actionOptions : undefined;
        if (actingUserId && options && snapshots[actingUserId]?.hand?.handId === roomHandId()) {
          if (options.canCheck) emitActionOncePerTurn(actingUserId, { action: "CHECK" });
          else if (options.canCall) emitActionOncePerTurn(actingUserId, { action: "CALL" });
          else if (options.canAllIn) emitActionOncePerTurn(actingUserId, { action: "ALL_IN" });
          else emitActionOncePerTurn(actingUserId, { action: "FOLD" });
        }
      }
    }

    if (lastHandResultsByHandId.size === 0) {
      throw new Error("No lastHandResult snapshots captured; cannot validate pot settlement math.");
    }

    for (const [handId, result] of lastHandResultsByHandId.entries()) {
      const totalPayout = Object.values(result.payoutsByUserId ?? {}).reduce((sum, amt) => sum + amt, 0);
      if (totalPayout !== result.potCents) {
        throw new Error(
          `Payout mismatch for hand ${handId}: payouts=${totalPayout} pot=${result.potCents}`,
        );
      }
      if (result.reason === "LAST_PLAYER" && result.winnerId) {
        const winnerPaid = result.payoutsByUserId[result.winnerId] ?? 0;
        if (winnerPaid <= 0) {
          throw new Error(`LAST_PLAYER hand ${handId} has winnerId without payout`);
        }
      }
    }

    await settleToWaitingState();
    await room.onLeave(clients.user_a as any, 4000);
    await room.onLeave(clients.user_b as any, 4000);
    await room.onLeave(clients.user_c as any, 4000);

    const roomsAfterEmpty = await matchMaker.query({ name: "poker" });
    const persistedRoom = roomsAfterEmpty.find((r: any) => r.roomId === roomId);
    if (!persistedRoom) {
      throw new Error(`Room ${roomId} is missing after all players left; expected persistent cash-game room.`);
    }

    const localRoomAfterEmpty = (matchMaker as any).getLocalRoomById(roomId) as PokerRoom | undefined;
    if (!localRoomAfterEmpty) {
      throw new Error(`Room ${roomId} is not locally joinable after all players left.`);
    }

    clients.user_a = makeClient("sess_rejoin_a", "user_a");
    await localRoomAfterEmpty.onJoin(
      clients.user_a as any,
      { buyInCents: 5000 },
      { userId: "user_a", username: "alice" },
    );
    await waitFor(() => Boolean(snapshots.user_a?.hero.youAreSeated), 5000, "rejoin after empty room");

    // eslint-disable-next-line no-console
    console.log(
      `Headless harness OK: baseline=${firstHandId}; sidepotSignals=allIn:${seenShortAllIn},raise:${seenLargeRaise},call:${seenCallAfterRaise}; reconnectJoinUser=${reconnectUserId}; reconnectGraceUser=${graceUserId ?? "skipped"}; settlementChecks=${lastHandResultsByHandId.size}`,
    );
  } finally {
    try {
      await room.onLeave(clients.user_a as any, 4000);
    } catch {}
    try {
      await room.onLeave(clients.user_b as any, 4000);
    } catch {}
    try {
      await room.onLeave(clients.user_c as any, 4000);
    } catch {}
    try {
      await gameServer.gracefullyShutdown(false);
    } catch {}
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    (CashierService as any).processCashGameBuyIn = buyInSpy;
    (CashierService as any).processCashGameCashOut = cashOutSpy;
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Headless harness FAILED:", err);
  process.exit(1);
});
