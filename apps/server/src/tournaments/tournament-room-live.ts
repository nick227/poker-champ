import { matchMaker } from "@colyseus/core";

type PokerRoomRef = { roomId?: string };

export async function loadLivePokerRoomIds(): Promise<Set<string>> {
  try {
    const rooms = (await matchMaker.query({ name: "poker" })) as PokerRoomRef[];
    return new Set(
      rooms.map((r) => r.roomId).filter((id): id is string => typeof id === "string" && id.length > 0),
    );
  } catch {
    return new Set();
  }
}

export function isTournamentRoomLive(roomId: string | null | undefined, liveRoomIds: Set<string>): boolean {
  return typeof roomId === "string" && roomId.length > 0 && liveRoomIds.has(roomId);
}
