import { afterEach, afterAll, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { PokerRoom } from "./PokerRoom.js";
import { CashierService } from "../engine/economy/CashierService.js";
import { getPrisma } from "@poker-champ/db";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

/**
 * Router-level verification of the side-bet UX overhaul, against the REAL dev DB and a real
 * in-process PokerRoom (not the mocked-DB harness table-action-broadcast.test.ts uses) — this
 * exercises PokerRoomMessageRouter's PROPOSE/RESPOND/CANCEL_SIDE_BET and SEND_GIFT handlers
 * directly, which apps/server/src/engine/economy/__tests__/PlayerInteractionService.sidebet-ux
 * .integration.test.ts deliberately bypasses (it calls PlayerInteractionService directly).
 * Together they cover both the economic logic and the wiring that carries it to clients.
 */

vi.setConfig({ testTimeout: 20000 });

const userIds: string[] = [];
const tableIds: string[] = [];
const handIds: string[] = [];

/**
 * PersistenceFacade.enabled is deliberately false whenever NODE_ENV==="test" (see
 * PersistenceFacade.ts), so HandHistoryService.startHand() never runs in-process here and no
 * real Hand row gets created for the hand PokerRoom just dealt — even though the room's live
 * state.handId is real and in play. PlayerInteraction.handId is a real FK to Hand.id, so
 * PROPOSE_SIDE_BET would otherwise fail on a foreign key violation purely as a test-harness
 * artifact, not a product bug. This inserts the same row HandHistoryService.startHand would
 * have written, so the router is exercised against a live, real, in-progress hand exactly as
 * it would be in production.
 */
async function persistStubTable(tableId: string, name: string) {
  const prisma = getPrisma();
  await prisma.pokerTable.create({ data: { id: tableId, name } });
  tableIds.push(tableId);
}

async function persistStubHandRow(params: { tableId: string; handId: string; dealerSeat: number; bigBlindCents: number }) {
  const prisma = getPrisma();
  await prisma.hand.create({
    data: {
      id: params.handId,
      tableId: params.tableId,
      dealerSeat: params.dealerSeat,
      smallBlindCents: Math.max(1, Math.round(params.bigBlindCents / 2)),
      bigBlindCents: params.bigBlindCents,
    },
  });
  handIds.push(params.handId);
}

function flushAsync() {
  return new Promise<void>((r) => setTimeout(r, 0));
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean, timeoutMs: number, label: string) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for: ${label}`);
    await delay(20);
  }
}

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

function getSnapshots(client: FakeClient): TableSnapshotPayload[] {
  return (client.sentByType.TABLE_SNAPSHOT ?? []) as TableSnapshotPayload[];
}

async function fundUser(userId: string, bankrollCents: number) {
  const prisma = getPrisma();
  await prisma.user.create({
    data: { id: userId, email: `${userId}@sidebet-router.test`, passwordHash: "hash", displayName: userId, bankrollCents },
  });
  userIds.push(userId);
}

describe("side bet router wiring — real DB, real PokerRoom", () => {
  const buyInSpy = CashierService.processCashGameBuyIn;
  const cashOutSpy = CashierService.processCashGameCashOut;

  afterEach(() => {
    vi.restoreAllMocks();
    (CashierService as any).processCashGameBuyIn = buyInSpy;
    (CashierService as any).processCashGameCashOut = cashOutSpy;
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await prisma.playerInteraction.deleteMany({ where: { tableId: { in: tableIds } } });
    if (handIds.length) await prisma.hand.deleteMany({ where: { id: { in: handIds } } });
    await prisma.balanceTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.pokerPlayer.deleteMany({ where: { tableId: { in: tableIds } } });
    if (tableIds.length) await prisma.pokerTable.deleteMany({ where: { id: { in: tableIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function setupTwoHumanRoom(bigBlindCents: number) {
    (CashierService as any).processCashGameBuyIn = async () => ({ success: true, newTableBalance: 5000 });
    (CashierService as any).processCashGameCashOut = async () => ({ success: true });

    const tableId = `table_sidebet_router_${nanoid(6)}`;
    await persistStubTable(tableId, "Side Bet Router Test");
    const userA = `user_a_${nanoid(6)}`;
    const userB = `user_b_${nanoid(6)}`;
    await fundUser(userA, 100_000);
    await fundUser(userB, 100_000);

    const room = new PokerRoom() as any;
    room.setMetadata = async () => {};
    room.roomId = `room_sidebet_router_${nanoid(6)}`;
    room.onCreate({
      tableConfig: {
        tableId,
        name: "Side Bet Router Test",
        maxSeats: 6,
        smallBlindCents: Math.max(1, Math.round(bigBlindCents / 2)),
        bigBlindCents,
        minBuyInCents: 2000,
        maxBuyInCents: 20000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });
    (room.dealer as { scheduleHumanTurnTimeout?: (userId: string) => void }).scheduleHumanTurnTimeout = () => {};

    const clientA = makeClient(`sess_a_${nanoid(6)}`);
    const clientB = makeClient(`sess_b_${nanoid(6)}`);
    await room.onJoin(clientA as any, { buyInCents: 5000 }, { userId: userA, username: "alice" });
    await room.onJoin(clientB as any, { buyInCents: 5000 }, { userId: userB, username: "bob" });
    // room.clients is normally populated by Colyseus's own connection transport (_onJoin),
    // which this harness bypasses by calling the public onJoin hook directly — CHAT/SEND_GIFT/
    // PROPOSE_SIDE_BET's broadcasts (sendToUserId, room.clients.forEach) read this array, so it
    // has to be seeded manually here. table-action-broadcast.test.ts never needed this because
    // ACTION's targeted sends go through the dealer's own client tracking instead.
    room.clients.push(clientA as any, clientB as any);

    await waitFor(() => Boolean(clientA.latestSnapshot) && Boolean(clientB.latestSnapshot), 4000, "initial snapshots");
    await waitFor(
      () => Boolean(clientA.latestSnapshot?.hand?.handId) && Boolean(clientB.latestSnapshot?.hand?.handId),
      4000,
      "active hand",
    );
    await persistStubHandRow({ tableId, handId: room.state.handId, dealerSeat: room.state.dealerSeat ?? 0, bigBlindCents });

    return { room, clientA, clientB, userA, userB, tableId };
  }

  async function setupHumanVsBotRoom(bigBlindCents: number) {
    (CashierService as any).processCashGameBuyIn = async () => ({ success: true, newTableBalance: 5000 });
    (CashierService as any).processCashGameCashOut = async () => ({ success: true });

    const tableId = `table_sidebet_router_bot_${nanoid(6)}`;
    await persistStubTable(tableId, "Side Bet Router Bot Test");
    const userA = `user_a_bot_${nanoid(6)}`;
    await fundUser(userA, 100_000);

    const room = new PokerRoom() as any;
    room.setMetadata = async () => {};
    room.roomId = `room_sidebet_router_bot_${nanoid(6)}`;
    room.onCreate({
      tableConfig: {
        tableId,
        name: "Side Bet Router Bot Test",
        maxSeats: 6,
        smallBlindCents: Math.max(1, Math.round(bigBlindCents / 2)),
        bigBlindCents,
        minBuyInCents: 2000,
        maxBuyInCents: 20000,
        visibility: "PUBLIC",
        createdAt: Date.now(),
      },
    });
    room.state.dealerSeat = 0;
    (room.dealer as { scheduleHumanTurnTimeout?: (userId: string) => void }).scheduleHumanTurnTimeout = () => {};

    const clientA = makeClient(`sess_human_${nanoid(6)}`);
    await room.onJoin(clientA as any, { buyInCents: 5000 }, { userId: userA, username: "alice" });
    room.clients.push(clientA as any); // see the two-human setup's comment on why this is needed
    room.onMessageEvents.emit("ADD_BOT", clientA as any, { name: "Bot", buyInCents: 5000, botId: "chaos_carl" });
    await flushAsync();
    await waitFor(() => getSnapshots(clientA).some((s) => s.seats.some((seat) => seat.isBot)), 5000, "bot seated");
    await waitFor(() => getSnapshots(clientA).some((s) => Boolean(s.hand?.handId)), 5000, "active hand human vs bot");
    await persistStubHandRow({ tableId, handId: room.state.handId, dealerSeat: room.state.dealerSeat ?? 0, bigBlindCents });

    const botUserId = clientA.latestSnapshot!.seats.find((s) => s.isBot)!.userId!;
    return { room, clientA, userA, botUserId, tableId };
  }

  it("PROPOSE_SIDE_BET on a 2-cent-BB table: recipientName is threaded through, and the $1 ceiling floor is enforced live", async () => {
    const bigBlindCents = 2; // penny-stakes: raw 5xBB ceiling would be 10 cents without the floor
    const { room, clientA, clientB, userA, userB } = await setupTwoHumanRoom(bigBlindCents);

    room.onMessageEvents.emit("PROPOSE_SIDE_BET", clientA as any, {
      recipientUserId: userB,
      catalogKey: "sidebet.river_rat",
      stakeCents: 100, // the $1 floor — 50x the raw 2-cent BB ceiling
      clientRequestId: nanoid(8),
    });
    await flushAsync();
    await waitFor(() => (clientA.sentByType.SIDE_BET_OFFER?.length ?? 0) > 0, 2000, "offer sent to initiator");
    await waitFor(() => (clientB.sentByType.SIDE_BET_OFFER?.length ?? 0) > 0, 2000, "offer sent to recipient");

    const offerToInitiator = clientA.sentByType.SIDE_BET_OFFER![0] as any;
    const offerToRecipient = clientB.sentByType.SIDE_BET_OFFER![0] as any;
    expect(offerToInitiator.stakeCents).toBe(100);
    expect(offerToInitiator.initiatorName).toBe("alice");
    expect(offerToInitiator.recipientName).toBe("bob"); // the new field this UX pass added
    expect(offerToRecipient.recipientName).toBe("bob");

    // Over the floor must be rejected live too, not just at the service layer.
    room.onMessageEvents.emit("PROPOSE_SIDE_BET", clientA as any, {
      recipientUserId: userB,
      catalogKey: "sidebet.river_rat",
      stakeCents: 101,
      clientRequestId: nanoid(8),
    });
    await flushAsync();
    await waitFor(() => (clientA.sentByType.ERROR?.length ?? 0) > 0, 2000, "over-ceiling error");
    expect((clientA.sentByType.ERROR![clientA.sentByType.ERROR!.length - 1] as any).code).toBe("SIDE_BET_STAKE_OUT_OF_BOUNDS");

    // Accept -> both sides see ACTIVE.
    const interactionId = offerToRecipient.interactionId;
    room.onMessageEvents.emit("RESPOND_SIDE_BET", clientB as any, { interactionId, accept: true, clientRequestId: nanoid(8) });
    await flushAsync();
    await waitFor(
      () => (clientA.sentByType.SIDE_BET_UPDATE ?? []).some((u: any) => u.interactionId === interactionId && u.status === "ACTIVE"),
      2000,
      "initiator sees ACTIVE",
    );
    await waitFor(
      () => (clientB.sentByType.SIDE_BET_UPDATE ?? []).some((u: any) => u.interactionId === interactionId && u.status === "ACTIVE"),
      2000,
      "recipient sees ACTIVE",
    );

    // Cancellation on a second, still-pending offer reaches both sides.
    room.onMessageEvents.emit("PROPOSE_SIDE_BET", clientA as any, {
      recipientUserId: userB,
      catalogKey: "sidebet.river_rat",
      stakeCents: 50,
      clientRequestId: nanoid(8),
    });
    await flushAsync();
    await waitFor(() => (clientB.sentByType.SIDE_BET_OFFER?.length ?? 0) > 1, 2000, "second offer sent");
    const secondInteractionId = (clientB.sentByType.SIDE_BET_OFFER![1] as any).interactionId;

    room.onMessageEvents.emit("CANCEL_SIDE_BET", clientA as any, { interactionId: secondInteractionId, clientRequestId: nanoid(8) });
    await flushAsync();
    await waitFor(
      () =>
        (clientB.sentByType.SIDE_BET_UPDATE ?? []).some((u: any) => u.interactionId === secondInteractionId && u.status === "CANCELLED"),
      2000,
      "recipient sees CANCELLED",
    );
    expect(
      (clientA.sentByType.SIDE_BET_UPDATE ?? []).some((u: any) => u.interactionId === secondInteractionId && u.status === "CANCELLED"),
    ).toBe(true);
  });

  it("an insolvent bot recipient declines immediately — never sits PENDING waiting for the 30s TTL", async () => {
    const { room, clientA, userA, botUserId } = await setupHumanVsBotRoom(50);

    // Force the coin flip to land on "accept" so the ONLY thing that can produce a DECLINED
    // outcome here is the new affordability pre-check — proving the fix, not just the 50/50 luck.
    vi.spyOn(Math, "random").mockReturnValue(0);

    room.onMessageEvents.emit("PROPOSE_SIDE_BET", clientA as any, {
      recipientUserId: botUserId,
      catalogKey: "sidebet.river_rat",
      stakeCents: 100,
      clientRequestId: nanoid(8),
    });
    await flushAsync();
    await waitFor(() => (clientA.sentByType.SIDE_BET_OFFER?.length ?? 0) > 0, 2000, "offer sent");
    const offer = clientA.sentByType.SIDE_BET_OFFER![0] as any;

    // Must resolve almost immediately, not after a 30s TTL sweep.
    await waitFor(() => (clientA.sentByType.SIDE_BET_UPDATE ?? []).length > 0, 3000, "bot auto-response");
    const update = clientA.sentByType.SIDE_BET_UPDATE![0] as any;
    expect(update.interactionId).toBe(offer.interactionId);
    expect(update.status).toBe("DECLINED");
  });

  it("a bot recipient funded via a real SEND_GIFT can accept a side bet", async () => {
    const { room, clientA, userA, botUserId } = await setupHumanVsBotRoom(50);

    // gift.rose (100c) rather than a pricier gift: gifts and side-bet stakes share the same
    // daily per-pair cap (max(20 x BB, $5) = $10 at BB=50 here), and a $10 gift would eat the
    // whole cap, leaving no room for the side bet that follows — that's correct product
    // behavior, not something to work around, so size the fixture to actually leave headroom.
    room.onMessageEvents.emit("SEND_GIFT", clientA as any, {
      recipientUserId: botUserId,
      catalogKey: "gift.rose",
      clientRequestId: nanoid(8),
    });
    await flushAsync();
    await waitFor(() => (clientA.sentByType.GIFT_RECEIVED ?? []).length > 0, 2000, "gift delivered");

    vi.spyOn(Math, "random").mockReturnValue(0); // force the coin flip to "accept"
    room.onMessageEvents.emit("PROPOSE_SIDE_BET", clientA as any, {
      recipientUserId: botUserId,
      catalogKey: "sidebet.river_rat",
      stakeCents: 100,
      clientRequestId: nanoid(8),
    });
    await flushAsync();
    await waitFor(() => (clientA.sentByType.SIDE_BET_OFFER?.length ?? 0) > 0, 2000, "offer sent");
    const offer = clientA.sentByType.SIDE_BET_OFFER![0] as any;

    await waitFor(() => (clientA.sentByType.SIDE_BET_UPDATE ?? []).length > 0, 3000, "bot auto-response");
    const update = clientA.sentByType.SIDE_BET_UPDATE![0] as any;
    expect(update.interactionId).toBe(offer.interactionId);
    expect(update.status).toBe("ACTIVE"); // funded bot could actually afford it this time
  });
});
