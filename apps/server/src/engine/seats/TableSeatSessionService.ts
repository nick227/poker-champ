import { getPrisma } from "@poker-champ/db";
import { logger } from "../../lib/logger.js";

type SeatSessionState = "SEATED_ACTIVE" | "SEATED_SITTING_OUT" | "LEFT";

type UpsertSeatInput = {
  tableId: string;
  userId: string;
  seat: number;
  stackCentsSnapshot: number;
  buyInCents: number;
  handIdSnapshot?: string;
  schemaVersion?: number;
};

type ReapParams = {
  tableId: string;
  retentionHours: number;
  hardDeleteHours: number;
};

type SoftExpiredSeatSession = {
  id: string;
  tableId: string;
  userId: string;
  seat: number;
  stackCentsSnapshot: number;
  state: SeatSessionState;
  disconnectAt: Date | null;
};

type RestorableSeatSession = {
  id: string;
  tableId: string;
  userId: string;
  seat: number;
  stackCentsSnapshot: number;
  buyInCents: number;
  state: SeatSessionState;
  handIdSnapshot: string | null;
  schemaVersion: number;
  disconnectAt: Date | null;
  lastSeenAt: Date;
};

type SittingOutSessionTimestamp = {
  userId: string;
  disconnectAt: Date | null;
};

export type LobbyViewerSeatSession = {
  tableId: string;
  state: "SEATED_ACTIVE" | "SEATED_SITTING_OUT";
};

export class TableSeatSessionService {
  static async countReconnectableSessionsForTable(tableId: string): Promise<number> {
    const prisma = getPrisma() as any;
    return prisma.tableSeatSession.count({
      where: {
        tableId,
        state: { in: ["SEATED_ACTIVE", "SEATED_SITTING_OUT"] },
      },
    });
  }

  static async listViewerSessionsForTables(params: {
    tableIds: string[];
    userId: string;
  }): Promise<LobbyViewerSeatSession[]> {
    if (params.tableIds.length === 0) return [];
    const prisma = getPrisma() as any;
    return prisma.tableSeatSession.findMany({
      where: {
        tableId: { in: params.tableIds },
        userId: params.userId,
        state: { in: ["SEATED_ACTIVE", "SEATED_SITTING_OUT"] },
      },
      select: { tableId: true, state: true },
    });
  }

  /**
   * @returns true if the update was applied (or attempted successfully); false if persistence
   * was skipped (no Prisma client) or the update threw. Callers that need to react to failure
   * (e.g. escalate a reconciliation-required error after a successful cash-out) can check this;
   * callers that don't care can keep awaiting without capturing the result, as before.
   */
  private static async safeSeatSessionUpdateMany(args: {
    op: string;
    context: Record<string, unknown>;
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<boolean> {
    const prisma = getPrisma() as any;
    const updateMany = prisma?.tableSeatSession?.updateMany;
    if (typeof updateMany !== "function") {
      logger.warn(
        {
          ...args.context,
          op: args.op,
          hasPrisma: Boolean(prisma),
          hasTableSeatSession: Boolean(prisma?.tableSeatSession),
        },
        "TABLE_SEAT_SESSION_PERSIST_SKIPPED",
      );
      return false;
    }
    try {
      const result = await updateMany({
        where: args.where,
        data: args.data,
      });
      // A completed updateMany that matched zero rows is not the same thing as one that actually
      // applied a change: the former means there was nothing at (tableId, userId) to transition
      // (already gone, or never existed) and is not itself evidence of a persistence failure,
      // while the latter is the real, expected success path. Log them distinctly so a
      // reconciliation-required escalation upstream (e.g. after a successful cash-out) can be
      // diagnosed against the right underlying cause instead of both looking like plain success.
      if (typeof result?.count === "number" && result.count === 0) {
        logger.info(
          { ...args.context, op: args.op },
          "TABLE_SEAT_SESSION_UPDATE_NO_ROW_MATCHED",
        );
      }
      return true;
    } catch (err) {
      logger.warn(
        {
          ...args.context,
          op: args.op,
          message: (err as Error | undefined)?.message ?? String(err),
        },
        "TABLE_SEAT_SESSION_PERSIST_FAILED",
      );
      return false;
    }
  }

  static async listRestorableSessionsForTable(params: {
    tableId: string;
    retentionHours: number;
  }): Promise<RestorableSeatSession[]> {
    const prisma = getPrisma() as any;
    const retentionHours = Math.max(1, Math.floor(params.retentionHours));
    const softCutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);
    const rows: RestorableSeatSession[] = await prisma.tableSeatSession.findMany({
      where: {
        tableId: params.tableId,
        state: { in: ["SEATED_ACTIVE", "SEATED_SITTING_OUT"] },
        OR: [{ disconnectAt: null }, { disconnectAt: { gte: softCutoff } }],
      },
      orderBy: [{ seat: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        tableId: true,
        userId: true,
        seat: true,
        stackCentsSnapshot: true,
        buyInCents: true,
        state: true,
        handIdSnapshot: true,
        schemaVersion: true,
        disconnectAt: true,
        lastSeenAt: true,
      },
    });
    return rows;
  }

  static async markLeftBySessionId(params: {
    id: string;
  }): Promise<void> {
    const prisma = getPrisma() as any;
    await prisma.tableSeatSession.updateMany({
      where: { id: params.id },
      data: {
        state: "LEFT" as SeatSessionState,
        lastSeenAt: new Date(),
      },
    });
  }

  static async reapExpiredSessionsForTable(params: ReapParams): Promise<{
    softExpired: SoftExpiredSeatSession[];
    hardDeletedCount: number;
  }> {
    const prisma = getPrisma() as any;
    const now = Date.now();
    const retentionHours = Math.max(1, Math.floor(params.retentionHours));
    const hardDeleteHours = Math.max(retentionHours, Math.floor(params.hardDeleteHours));
    const softCutoff = new Date(now - retentionHours * 60 * 60 * 1000);
    const hardCutoff = new Date(now - hardDeleteHours * 60 * 60 * 1000);

    return prisma.$transaction(async (tx: any) => {
      const softExpired: SoftExpiredSeatSession[] = await tx.tableSeatSession.findMany({
        where: {
          tableId: params.tableId,
          state: "SEATED_SITTING_OUT",
          disconnectAt: { not: null, lte: softCutoff, gt: hardCutoff },
        },
        select: {
          id: true,
          tableId: true,
          userId: true,
          seat: true,
          stackCentsSnapshot: true,
          state: true,
          disconnectAt: true,
        },
      });

      if (softExpired.length > 0) {
        await tx.tableSeatSession.updateMany({
          where: { id: { in: softExpired.map((row) => row.id) } },
          data: {
            state: "LEFT",
            lastSeenAt: new Date(),
          },
        });
      }

      const hardDeleted = await tx.tableSeatSession.deleteMany({
        where: {
          tableId: params.tableId,
          state: { in: ["LEFT", "SEATED_SITTING_OUT"] },
          disconnectAt: { not: null, lte: hardCutoff },
        },
      });

      return {
        softExpired,
        hardDeletedCount: hardDeleted.count ?? 0,
      };
    });
  }

  static async findRejoinableSession(params: {
    tableId: string;
    userId: string;
  }): Promise<{
    tableId: string;
    userId: string;
    seat: number;
    stackCentsSnapshot: number;
    buyInCents: number;
    state: SeatSessionState;
  } | null> {
    const prisma = getPrisma() as any;
    const row = await prisma.tableSeatSession.findUnique({
      where: { tableId_userId: { tableId: params.tableId, userId: params.userId } },
      select: {
        tableId: true,
        userId: true,
        seat: true,
        stackCentsSnapshot: true,
        buyInCents: true,
        state: true,
      },
    });
    if (!row) return null;
    if (row.state === "LEFT") return null;

    // The durable seat row's stackCentsSnapshot is only a mirror; PlayerBalance is the actual
    // source of truth for money (see LedgerService's doc comment). A row can go stale -- e.g. a
    // cash-out succeeded but the follow-up markLeft failed to persist (see
    // PlayerLifecycleService.finalizeRemoval) -- and keep claiming SEATED with a nonzero snapshot
    // over a balance that's already been paid out. Never let a stale row reseat a player with
    // phantom chips: once the balance is explicitly CASHED_OUT, treat the seat the same as LEFT
    // (not resumable), regardless of what the snapshot still claims. A legitimately-busted but
    // still-seated player (balanceCents 0, status still ACTIVE) is a different, valid state --
    // that's NEEDS_BUY_IN, not a stale row, so balanceCents alone must not gate this.
    const balance = await prisma.playerBalance?.findUnique?.({
      where: { tableId_userId: { tableId: params.tableId, userId: params.userId } },
      select: { balanceCents: true, status: true },
    });
    if (!balance || balance.status === "CASHED_OUT") return null;

    return { ...row, stackCentsSnapshot: Math.min(row.stackCentsSnapshot, balance.balanceCents) };
  }

  static async upsertActiveSeat(input: UpsertSeatInput): Promise<void> {
    const prisma = getPrisma() as any;
    const now = new Date();
    const schemaVersion = input.schemaVersion ?? 1;

    await prisma.$transaction(async (tx: any) => {
      // Row-level lock on table rows to reduce double-seat races under concurrent joins.
      await tx.$queryRawUnsafe(
        "SELECT id FROM TableSeatSession WHERE tableId = ? FOR UPDATE",
        input.tableId,
      );

      const conflicting = await tx.tableSeatSession.findFirst({
        where: {
          tableId: input.tableId,
          seat: input.seat,
          state: { in: ["SEATED_ACTIVE", "SEATED_SITTING_OUT"] },
          userId: { not: input.userId },
        },
      });
      if (conflicting) {
        throw new Error("SEAT_CONFLICT");
      }

      await tx.tableSeatSession.upsert({
        where: { tableId_userId: { tableId: input.tableId, userId: input.userId } },
        create: {
          tableId: input.tableId,
          userId: input.userId,
          seat: input.seat,
          state: "SEATED_ACTIVE",
          stackCentsSnapshot: input.stackCentsSnapshot,
          buyInCents: input.buyInCents,
          handIdSnapshot: input.handIdSnapshot,
          disconnectAt: null,
          lastSeenAt: now,
          schemaVersion,
        },
        update: {
          seat: input.seat,
          state: "SEATED_ACTIVE",
          stackCentsSnapshot: input.stackCentsSnapshot,
          buyInCents: input.buyInCents,
          handIdSnapshot: input.handIdSnapshot,
          disconnectAt: null,
          lastSeenAt: now,
          schemaVersion,
        },
      });
    });
  }

  static async markSittingOut(params: {
    tableId: string;
    userId: string;
    stackCentsSnapshot?: number;
    handIdSnapshot?: string;
  }): Promise<void> {
    await this.safeSeatSessionUpdateMany({
      op: "markSittingOut",
      context: {
        tableId: params.tableId,
        userId: params.userId,
      },
      where: { tableId: params.tableId, userId: params.userId },
      data: {
        state: "SEATED_SITTING_OUT" as SeatSessionState,
        disconnectAt: new Date(),
        lastSeenAt: new Date(),
        ...(typeof params.stackCentsSnapshot === "number" ? { stackCentsSnapshot: params.stackCentsSnapshot } : {}),
        ...(params.handIdSnapshot ? { handIdSnapshot: params.handIdSnapshot } : {}),
      },
    });
  }

  /** @returns true if the durable transition to LEFT was applied; false if it was not (see safeSeatSessionUpdateMany). */
  static async markLeft(params: {
    tableId: string;
    userId: string;
    reason?: string;
    stackCentsSnapshot?: number;
    handIdSnapshot?: string;
  }): Promise<boolean> {
    return this.safeSeatSessionUpdateMany({
      op: "markLeft",
      context: {
        tableId: params.tableId,
        userId: params.userId,
        reason: params.reason,
      },
      where: { tableId: params.tableId, userId: params.userId },
      data: {
        state: "LEFT" as SeatSessionState,
        disconnectAt: null,
        lastSeenAt: new Date(),
        ...(typeof params.stackCentsSnapshot === "number" ? { stackCentsSnapshot: params.stackCentsSnapshot } : {}),
        ...(params.handIdSnapshot ? { handIdSnapshot: params.handIdSnapshot } : {}),
      },
    });
  }

  static async listSittingOutDisconnectTimesForUsers(params: {
    tableId: string;
    userIds: string[];
  }): Promise<SittingOutSessionTimestamp[]> {
    if (params.userIds.length === 0) return [];
    const prisma = getPrisma() as any;
    const rows: SittingOutSessionTimestamp[] = await prisma.tableSeatSession.findMany({
      where: {
        tableId: params.tableId,
        userId: { in: params.userIds },
        state: "SEATED_SITTING_OUT",
      },
      select: {
        userId: true,
        disconnectAt: true,
      },
    });
    return rows;
  }

  /** Mark all seat sessions for a table as LEFT. Used when table is deleted. */
  static async markAllLeftForTable(params: { tableId: string }): Promise<void> {
    const prisma = getPrisma() as any;
    await prisma.tableSeatSession.updateMany({
      where: { tableId: params.tableId, state: { in: ["SEATED_ACTIVE", "SEATED_SITTING_OUT"] } },
      data: { state: "LEFT" as SeatSessionState, lastSeenAt: new Date() },
    });
  }

  static async touchConnected(params: {
    tableId: string;
    userId: string;
    stackCentsSnapshot?: number;
    handIdSnapshot?: string;
  }): Promise<void> {
    await this.safeSeatSessionUpdateMany({
      op: "touchConnected",
      context: {
        tableId: params.tableId,
        userId: params.userId,
      },
      where: { tableId: params.tableId, userId: params.userId },
      data: {
        state: "SEATED_ACTIVE" as SeatSessionState,
        disconnectAt: null,
        lastSeenAt: new Date(),
        ...(typeof params.stackCentsSnapshot === "number" ? { stackCentsSnapshot: params.stackCentsSnapshot } : {}),
        ...(params.handIdSnapshot ? { handIdSnapshot: params.handIdSnapshot } : {}),
      },
    });
  }
}
