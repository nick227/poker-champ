import { isPersistentSeatsEnabled } from "../config/features.js";
import { getSeatHardDeleteHours, getSeatRetentionHours } from "../config/seats.js";
import { getPrisma } from "@poker-champ/db";
import { TableSeatSessionService } from "../engine/seats/TableSeatSessionService.js";
import { logger } from "../lib/logger.js";
import { isTournamentTableMetadata } from "../tournaments/lobby-table-filter.js";
import { loadLivePokerRoomIds } from "../tournaments/tournament-room-live.js";
import { findLiveCashRoomByTableId } from "./cash-table-room.js";

export type CashTableResumeStatus =
  | "READY"
  | "ROOM_RECOVERED"
  | "NEEDS_BUY_IN"
  | "NOT_SEATED"
  | "ENDED"
  | "FAILED";

export type CashTableResumeResult = {
  tableId: string;
  roomId: string | null;
  tableLive: boolean;
  resumeStatus: CashTableResumeStatus;
  playerStatus: "SEATED" | "NOT_SEATED";
  seatSessionState?: "SEATED_ACTIVE" | "SEATED_SITTING_OUT" | "LEFT" | null;
  stackCentsSnapshot?: number | null;
  minBuyInCents?: number;
  maxBuyInCents?: number;
  recoveryReason?: string;
};

type SeatRow = {
  state: "SEATED_ACTIVE" | "SEATED_SITTING_OUT" | "LEFT";
  stackCentsSnapshot: number;
  buyInCents: number;
  disconnectAt: Date | null;
};

function metadataCents(metadata: Record<string, unknown>, key: string, fallback: number): number {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isSeatWithinRetention(session: SeatRow, retentionHours: number): boolean {
  if (session.state === "SEATED_ACTIVE") return true;
  if (session.disconnectAt == null) return true;
  const softCutoff = Date.now() - retentionHours * 60 * 60 * 1000;
  return session.disconnectAt.getTime() >= softCutoff;
}

async function loadSeatSessionWithDisconnect(tableId: string, userId: string): Promise<SeatRow | null> {
  const prisma = getPrisma() as {
    tableSeatSession?: {
      findUnique: (args: unknown) => Promise<SeatRow | null>;
    };
  };
  if (!prisma.tableSeatSession?.findUnique) {
    const persisted = await TableSeatSessionService.findRejoinableSession({ tableId, userId });
    if (!persisted) return null;
    return {
      state: persisted.state,
      stackCentsSnapshot: persisted.stackCentsSnapshot,
      buyInCents: persisted.buyInCents,
      disconnectAt: null,
    };
  }
  const row = await prisma.tableSeatSession.findUnique({
    where: { tableId_userId: { tableId, userId } },
    select: {
      state: true,
      stackCentsSnapshot: true,
      buyInCents: true,
      disconnectAt: true,
    },
  });
  if (!row || row.state === "LEFT") return null;
  return row;
}

export async function resumeCashTableForUser(params: {
  tableId: string;
  userId: string;
  previousRoomId?: string | null;
}): Promise<CashTableResumeResult> {
  const { tableId, userId, previousRoomId } = params;
  const logBase = { tableId, userId, previousRoomId: previousRoomId ?? null };

  const liveRoom = await findLiveCashRoomByTableId(tableId);
  if (!liveRoom) {
    logger.info({ ...logBase, resumeStatus: "ENDED" }, "CASH_TABLE_RESUME");
    return {
      tableId,
      roomId: null,
      tableLive: false,
      resumeStatus: "ENDED",
      playerStatus: "NOT_SEATED",
      recoveryReason: "TABLE_NOT_FOUND",
    };
  }

  if (isTournamentTableMetadata(liveRoom.metadata)) {
    return {
      tableId,
      roomId: liveRoom.roomId,
      tableLive: false,
      resumeStatus: "FAILED",
      playerStatus: "NOT_SEATED",
      recoveryReason: "TOURNAMENT_TABLE_USE_ENSURE_TABLE",
    };
  }

  const liveRoomIds = await loadLivePokerRoomIds();
  const tableLive = liveRoomIds.has(liveRoom.roomId);
  if (!tableLive) {
    return {
      tableId,
      roomId: null,
      tableLive: false,
      resumeStatus: "ENDED",
      playerStatus: "NOT_SEATED",
      recoveryReason: "TABLE_ROOM_NOT_LIVE",
    };
  }

  const minBuyInCents = metadataCents(liveRoom.metadata, "minBuyInCents", 2000);
  const maxBuyInCents = metadataCents(liveRoom.metadata, "maxBuyInCents", 20000);
  const staleRoom =
    typeof previousRoomId === "string" &&
    previousRoomId.length > 0 &&
    previousRoomId !== liveRoom.roomId;

  if (isPersistentSeatsEnabled()) {
    await TableSeatSessionService.reapExpiredSessionsForTable({
      tableId,
      retentionHours: getSeatRetentionHours(),
      hardDeleteHours: getSeatHardDeleteHours(),
    });
  }

  if (!isPersistentSeatsEnabled()) {
    const resumeStatus: CashTableResumeStatus = staleRoom ? "ROOM_RECOVERED" : "READY";
    logger.info({ ...logBase, roomId: liveRoom.roomId, resumeStatus }, "CASH_TABLE_RESUME");
    return {
      tableId: liveRoom.tableId,
      roomId: liveRoom.roomId,
      tableLive: true,
      resumeStatus,
      playerStatus: "NOT_SEATED",
      seatSessionState: null,
      minBuyInCents,
      maxBuyInCents,
      recoveryReason: staleRoom ? "STALE_ROOM_REPLACED" : "PERSISTENT_SEATS_DISABLED",
    };
  }

  const seat = await loadSeatSessionWithDisconnect(tableId, userId);
  const retentionHours = getSeatRetentionHours();

  if (!seat) {
    logger.info({ ...logBase, roomId: liveRoom.roomId, resumeStatus: "NOT_SEATED" }, "CASH_TABLE_RESUME");
    return {
      tableId: liveRoom.tableId,
      roomId: liveRoom.roomId,
      tableLive: true,
      resumeStatus: staleRoom ? "ROOM_RECOVERED" : "NOT_SEATED",
      playerStatus: "NOT_SEATED",
      seatSessionState: null,
      minBuyInCents,
      maxBuyInCents,
      recoveryReason: staleRoom ? "STALE_ROOM_REPLACED" : undefined,
    };
  }

  if (!isSeatWithinRetention(seat, retentionHours)) {
    return {
      tableId: liveRoom.tableId,
      roomId: liveRoom.roomId,
      tableLive: true,
      resumeStatus: "NOT_SEATED",
      playerStatus: "NOT_SEATED",
      seatSessionState: seat.state,
      stackCentsSnapshot: seat.stackCentsSnapshot,
      minBuyInCents,
      maxBuyInCents,
      recoveryReason: "SEAT_SESSION_EXPIRED",
    };
  }

  if (seat.stackCentsSnapshot <= 0) {
    return {
      tableId: liveRoom.tableId,
      roomId: liveRoom.roomId,
      tableLive: true,
      resumeStatus: "NEEDS_BUY_IN",
      playerStatus: "SEATED",
      seatSessionState: seat.state,
      stackCentsSnapshot: seat.stackCentsSnapshot,
      minBuyInCents,
      maxBuyInCents,
      recoveryReason: seat.state === "SEATED_SITTING_OUT" ? "SEAT_SITTING_OUT_NO_STACK" : "SEAT_EMPTY_STACK",
    };
  }

  const resumeStatus: CashTableResumeStatus = staleRoom ? "ROOM_RECOVERED" : "READY";
  logger.info(
    {
      ...logBase,
      roomId: liveRoom.roomId,
      resumeStatus,
      seatSessionState: seat.state,
      stackCentsSnapshot: seat.stackCentsSnapshot,
    },
    "CASH_TABLE_RESUME",
  );
  return {
    tableId: liveRoom.tableId,
    roomId: liveRoom.roomId,
    tableLive: true,
    resumeStatus,
    playerStatus: "SEATED",
    seatSessionState: seat.state,
    stackCentsSnapshot: seat.stackCentsSnapshot,
    minBuyInCents,
    maxBuyInCents,
    recoveryReason: staleRoom ? "STALE_ROOM_REPLACED" : undefined,
  };
}
