export type LobbyTableRow = {
  id: string;
  tableId: string;
  roomId: string;
  name: string;
  blinds?: string;
  smallBlindCents: number;
  bigBlindCents: number;
  players: number;
  seats: number;
  minBuyInCents: number;
  maxBuyInCents: number;
  creatorId?: string;
  connectedHumanCount?: number;
};

const DEFAULT_MIN = 2000;
const DEFAULT_MAX = 200000;

export function normalizeTable(t: Record<string, unknown>): LobbyTableRow {
  const tableId = String(t.tableId ?? t.id ?? "unknown");
  const roomId = String(t.roomId ?? "");
  const id = tableId;
  const players = typeof t.players === "number" ? t.players : (t.playerCount as number) ?? 0;
  const seats = (t.maxSeats as number) ?? (t.seats as number) ?? 9;
  const sb = t.smallBlindCents as number | undefined;
  const bb = t.bigBlindCents as number | undefined;
  const smallBlindCents = sb != null ? sb : 100;
  const bigBlindCents = bb != null ? bb : 200;
  const blinds = sb != null && bb != null ? `${sb}/${bb}` : undefined;
  const connectedHumanCount = typeof t.connectedHumanCount === "number" ? t.connectedHumanCount : undefined;
  return {
    id,
    tableId,
    roomId,
    name: (t.name as string) ?? "Hold'em",
    blinds,
    smallBlindCents,
    bigBlindCents,
    players,
    seats,
    minBuyInCents: Number(t.minBuyInCents) || DEFAULT_MIN,
    maxBuyInCents: Number(t.maxBuyInCents) || DEFAULT_MAX,
    creatorId:
      typeof t.creatorId === "string" && t.creatorId.length > 0
        ? t.creatorId
        : typeof t.creatorId === "number"
          ? String(t.creatorId)
          : undefined,
    connectedHumanCount,
  };
}
