export type LobbyTableRow = {
  id: string;
  tableId: string;
  roomId: string;
  name: string;
  blinds?: string;
  players: number;
  seats: number;
  minBuyInCents: number;
  maxBuyInCents: number;
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
  const blinds = sb != null && bb != null ? `${sb}/${bb}` : undefined;
  return {
    id,
    tableId,
    roomId,
    name: (t.name as string) ?? "Hold'em",
    blinds,
    players,
    seats,
    minBuyInCents: Number(t.minBuyInCents) || DEFAULT_MIN,
    maxBuyInCents: Number(t.maxBuyInCents) || DEFAULT_MAX,
  };
}
