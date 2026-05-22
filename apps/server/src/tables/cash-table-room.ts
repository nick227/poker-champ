import { matchMaker } from "@colyseus/core";
import { isTournamentTableMetadata } from "../tournaments/lobby-table-filter.js";

export type LiveCashRoomRef = {
  roomId: string;
  tableId: string;
  metadata: Record<string, unknown>;
};

export async function findLiveCashRoomByTableId(tableId: string): Promise<LiveCashRoomRef | null> {
  const rooms = (await matchMaker.query({ name: "poker" })) as Array<{
    roomId?: string;
    metadata?: Record<string, unknown>;
  }>;
  const match = rooms.find((r) => {
    const metadata = r.metadata ?? {};
    if (isTournamentTableMetadata(metadata)) return false;
    const resolvedTableId = typeof metadata.tableId === "string" ? metadata.tableId : r.roomId;
    return resolvedTableId === tableId;
  });
  if (!match?.roomId) return null;
  const metadata = match.metadata ?? {};
  const resolvedTableId =
    typeof metadata.tableId === "string" && metadata.tableId.length > 0 ? metadata.tableId : match.roomId;
  return {
    roomId: match.roomId,
    tableId: resolvedTableId,
    metadata,
  };
}
