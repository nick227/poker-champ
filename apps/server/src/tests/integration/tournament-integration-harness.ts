import { nanoid } from "nanoid";
import { vi } from "vitest";
import { PokerRoom } from "../../rooms/PokerRoom.js";
import type { TableConfig } from "../../lobby/types.js";

export function createTournamentPokerRoomsRegistry(): Map<string, PokerRoom> {
  return new Map<string, PokerRoom>();
}

export function queryLivePokerRooms(pokerRooms: Map<string, PokerRoom>) {
  return [...pokerRooms.entries()].map(([roomId, room]) => ({
    roomId,
    name: "poker",
    clients: 0,
    maxClients: 9,
    metadata: {
      tableId: room.state.tableId,
      name: room.state.tableName,
      tournamentId: room.getTournamentIdInternal(),
    },
  }));
}

export function buildTournamentMatchMakerMock(pokerRooms: Map<string, PokerRoom>) {
  return {
    createRoom: async (_name: string, options: { tableConfig?: TableConfig }) => {
      const room = new PokerRoom() as PokerRoom & { roomId: string; setMetadata: () => Promise<void> };
      room.roomId = `room_${nanoid(8)}`;
      room.setMetadata = vi.fn().mockResolvedValue(undefined);
      await room.onCreate({ tableConfig: options.tableConfig });
      pokerRooms.set(room.roomId, room);
      return { roomId: room.roomId };
    },
    remoteRoomCall: async (roomId: string, method: string, args: unknown[]) => {
      const room = pokerRooms.get(roomId) as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
      if (!room || typeof room[method] !== "function") {
        throw new Error(`Room method not found: ${method}`);
      }
      return room[method](...(args as unknown[]));
    },
    query: vi.fn(async () => queryLivePokerRooms(pokerRooms)),
  };
}
