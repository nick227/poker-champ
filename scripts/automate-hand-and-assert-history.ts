/**
 * Automate one hand as test@example.com with persistence ON, then assert history.
 * - Ensures NODE_ENV !== "test" and DATABASE_URL is set so hand history is saved.
 * - Joins table, adds bot, plays one hand (human folds), then queries DB and asserts.
 *
 * Usage: npx tsx scripts/automate-hand-and-assert-history.ts [email]
 */
import "dotenv/config";
import http from "node:http";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { LobbyRoom } from "../apps/server/src/lobby/LobbyRoom.js";
import { PokerRoom } from "../apps/server/src/rooms/PokerRoom.js";
import { getPrisma } from "../apps/server/src/db/prisma.js";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

const email = process.argv[2] ?? "test@example.com";

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function waitFor(condition: () => boolean, timeoutMs: number, label: string) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timeout: ${label}`);
    await delay(30);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required for persistence. Set it in .env");
    process.exit(1);
  }
  process.env.NODE_ENV = process.env.NODE_ENV ?? "development";
  if (process.env.NODE_ENV === "test") {
    console.error("Do not run this script with NODE_ENV=test (persistence is disabled). Use NODE_ENV=development");
    process.exit(1);
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, username: true },
  });
  if (!user) {
    console.error(`User not found: ${email}. Create the user first.`);
    process.exit(1);
  }
  const userId = user.id;
  const username = user.username ?? user.email;

  await prisma.user.update({
    where: { id: userId },
    data: { bankrollCents: 100_000 },
  });

  const httpServer = http.createServer();
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
  });
  gameServer.define("lobby", LobbyRoom);
  gameServer.define("poker", PokerRoom);

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));

  const tableId = `table_auto_${Date.now()}`;
  const created = await matchMaker.createRoom("poker", {
    tableConfig: {
      tableId,
      name: "Automate Hand Test",
      maxSeats: 6,
      smallBlindCents: 50,
      bigBlindCents: 100,
      minBuyInCents: 2000,
      maxBuyInCents: 20000,
      visibility: "PUBLIC",
      createdAt: Date.now(),
    },
  });

  const roomId = typeof created === "string" ? created : (created as { roomId: string }).roomId;
  const room = (matchMaker as any).getLocalRoomById(roomId) as PokerRoom & { onMessageEvents: { emit: (type: string, client: unknown, payload: unknown) => void }; state: { street: string; handId: string } };
  if (!room) throw new Error("Room not found");

  let snapshot: TableSnapshotPayload | null = null;
  const client = {
    sessionId: "automate_sess_1",
    send: (type: string, payload: unknown) => {
      if (type === "TABLE_SNAPSHOT") snapshot = payload as TableSnapshotPayload;
    },
    leave: () => {},
  };

  await room.onJoin(client as any, { buyInCents: 5000 }, { userId, username });
  await waitFor(() => snapshot?.hero?.youAreSeated === true, 8000, "user seated");

  room.onMessageEvents.emit("ADD_BOT", client, { name: "Bot", buyInCents: 5000 });
  await waitFor(() => Boolean(snapshot?.hand?.handId), 8000, "hand started");

  const canAct = () => {
    const opts = snapshot?.hero?.actionOptions;
    return Boolean(opts && (opts.canCheck || opts.canCall || opts.canFold || opts.canBet || opts.canRaise || opts.canAllIn));
  };
  await waitFor(canAct, 15000, "hero can act");

  room.onMessageEvents.emit("ACTION", client, { action: "FOLD" });
  await waitFor(() => room.state?.street === "WAITING", 10000, "hand ended (WAITING)");


  const hands = await prisma.hand.findMany({
    where: {
      endedAt: { not: null },
      players: { some: { player: { userId } } },
    },
    select: { id: true, endedAt: true, reason: true },
  });

  console.log(`\n--- Results for ${email} ---`);
  console.log("Completed hands found (user participated):", hands.length);
  if (hands.length > 0) {
    console.log("Latest hand:", hands[0]!.id, hands[0]!.reason, hands[0]!.endedAt);
  }

  if (hands.length < 1) {
    console.error("FAIL: Expected at least 1 completed hand after playing one hand.");
    process.exit(1);
  }
  console.log("PASS: Hand was persisted and is queryable by userId.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
