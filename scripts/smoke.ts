import http from "node:http";
import { Server } from "@colyseus/core";
import { matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { LobbyRoom } from "../src/lobby/LobbyRoom.js";
import { PokerRoom } from "../src/rooms/PokerRoom.js";

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

async function main() {
  const httpServer = http.createServer();
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
  });

  gameServer.define("lobby", LobbyRoom);
  gameServer.define("poker", PokerRoom);

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
  const created = await matchMaker.createRoom("poker", {
    tableConfig: {
      tableId: "smoke_table",
      name: "Smoke",
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
  const room = (matchMaker as any).getLocalRoomById(roomId) as any;
  if (!room) {
    throw new Error("Failed to resolve created PokerRoom");
  }

  const messagesA: Array<{ type: string; payload: any }> = [];
  const messagesB: Array<{ type: string; payload: any }> = [];

  const clientA: any = {
    sessionId: "smoke_a",
    send: (type: string, payload: any) => messagesA.push({ type, payload }),
    leave: () => {},
  };
  const clientB: any = {
    sessionId: "smoke_b",
    send: (type: string, payload: any) => messagesB.push({ type, payload }),
    leave: () => {},
  };

  try {
    await room.onJoin(clientA, { name: "SmokeA", buyInCents: 5000 }, { userId: "smoke_a", sessionId: "t1", roles: ["USER"] });
    await room.onJoin(clientB, { name: "SmokeB", buyInCents: 5000 }, { userId: "smoke_b", sessionId: "t2", roles: ["USER"] });

    await waitFor(
      () => room.state?.street === "PREFLOP" && typeof room.state?.handId === "string" && room.state.handId.length > 0,
      5000,
      "first PREFLOP hand",
    );

    const firstHandId = String(room.state.handId);
    const toActSeat = Number(room.state.toActSeat);
    const toActPlayerId = String(room.state.seats[toActSeat] ?? "");
    if (!toActPlayerId) throw new Error("No player to act");
    room.dealer.handleAction(toActPlayerId, { action: "FOLD" });

    await waitFor(
      () => String(room.state.handId) !== firstHandId && room.state.street === "PREFLOP",
      8000,
      "next hand after fold",
    );

    // eslint-disable-next-line no-console
    console.log(`Smoke OK: hand rolled ${firstHandId} -> ${String(room.state.handId)}`);
  } finally {
    await room.onLeave(clientA, 4000);
    await room.onLeave(clientB, 4000);
    try {
      await gameServer.gracefullyShutdown(false);
    } catch {}
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Smoke FAILED:", err);
    process.exit(1);
  });
