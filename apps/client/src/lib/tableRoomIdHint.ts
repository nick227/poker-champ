import { logTableLoadEvent } from "@/lib/tableLoadPhase";

/** Persist lobby/instant-game roomId as an initial connect hint (recovery may replace it). */
export function seedTableRoomIdHint(
  tableId: string,
  roomId: string | undefined | null,
  setRoomForTable: (tableId: string, roomId: string) => void,
): void {
  const trimmed = roomId?.trim();
  if (trimmed) setRoomForTable(tableId, trimmed);
}

/**
 * Prop/lobby roomId seeds the store only when empty.
 * WELCOME, ensure-table, and cash resume set authoritative ids — never downgrade them.
 */
export function syncTableRoomIdFromProp(params: {
  tableId: string;
  propRoomId?: string;
  currentRoomId?: string;
  setRoomForTable: (tableId: string, roomId: string) => void;
}): void {
  const propRoomId = params.propRoomId?.trim();
  if (!propRoomId) return;

  const existing = params.currentRoomId?.trim();
  if (!existing) {
    params.setRoomForTable(params.tableId, propRoomId);
    return;
  }
  if (existing === propRoomId) return;

  logTableLoadEvent("stale_prop_roomid_ignored", {
    tableId: params.tableId,
    existingRoomId: existing,
    propRoomId,
  });
}
