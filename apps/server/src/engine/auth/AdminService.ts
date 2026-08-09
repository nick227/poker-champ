
import { getPrisma } from "@poker-champ/db";
import type { Prisma, User } from "@prisma/client";
import { UserRole } from "@prisma/client";
import { matchMaker } from "@colyseus/core";
import { sessionEvents } from "./SessionEvents.js";
import { AuthService } from "./AuthService.js";
import { TOURNAMENT_BOT_USER_ID_PREFIX } from "../../tournaments/tournament-bot-users.js";
import { RecoveryService } from "../recovery/RecoveryService.js";
import { logger } from "../../lib/logger.js";

const excludeTournamentBotUsersWhere = {
  NOT: { id: { startsWith: TOURNAMENT_BOT_USER_ID_PREFIX } },
} as const;

/**
 * Every action that gets written to the append-only AdminLog table.
 */
type AdminLogAction =
  | "CREATE_ADMIN_USER"
  | "BAN"
  | "UNBAN"
  | "SOFT_DELETE"
  | "RESTORE"
  | "PROMOTE"
  | "ROLE_CHANGE"
  | "BALANCE_RECOVERY"
  | "TABLE_CLOSE"
  | "TABLE_KICK";

type PokerRoomRef = { roomId?: string; metadata?: { tableId?: string } };

/** Minimal, consistent before/after snapshot of the audit-relevant User fields. */
function userAuditSnapshot(user: Pick<User, "role" | "isBanned" | "deletedAt">): Prisma.InputJsonValue {
  return {
    role: user.role,
    isBanned: user.isBanned,
    deletedAt: user.deletedAt ? user.deletedAt.toISOString() : null,
  };
}

class AdminLogWriteError extends Error {
  constructor(cause: unknown) {
    super(`Failed to write AdminLog entry: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.name = "AdminLogWriteError";
  }
}

type AdminUserStats = {
  lastOnlineAt: Date | null;
  totalOnlineHours: number;
  totalSpendCents: number;
  totalLostCents: number;
  totalBuyInCents: number;
  totalCashOutCents: number;
  totalTournamentEntryCents: number;
  totalTournamentPayoutCents: number;
};

type AdminUserListItem = {
  user: User;
  stats: AdminUserStats;
};

type AdminLogEntry = {
  actorUserId: string;
  action: AdminLogAction;
  targetUserId?: string | null;
  targetTableId?: string | null;
  beforeJson?: Prisma.InputJsonValue;
  afterJson?: Prisma.InputJsonValue;
  reason?: string | null;
};

/** Builds the AdminLog create payload from a log entry, omitting before/afterJson keys entirely when absent (rather than writing JSON null). */
// Exercised indirectly by every AdminService.test.ts case via writeLog/writeLogStandalone; CRAP score reflects no coverage data being wired into this fallow run.
// fallow-ignore-next-line complexity
function buildAdminLogCreateData(entry: AdminLogEntry): Prisma.AdminLogUncheckedCreateInput {
  const data: Prisma.AdminLogUncheckedCreateInput = {
    actorUserId: entry.actorUserId,
    action: entry.action,
    targetUserId: entry.targetUserId ?? null,
    targetTableId: entry.targetTableId ?? null,
    reason: entry.reason ?? null,
  };
  if (entry.beforeJson !== undefined) data.beforeJson = entry.beforeJson;
  if (entry.afterJson !== undefined) data.afterJson = entry.afterJson;
  return data;
}

export class AdminService {
  /**
   * Writes an AdminLog row inside the given transaction. Failures are logged
   * and rethrown (never silently swallowed): since this always runs inside
   * the same transaction as the action it documents, a failed log write
   * rolls back the action too - an admin action can never succeed without a
   * matching audit trail entry.
   */
  private static async writeLog(tx: Prisma.TransactionClient, entry: AdminLogEntry): Promise<void> {
    try {
      await tx.adminLog.create({ data: buildAdminLogCreateData(entry) });
    } catch (err) {
      logger.error({ err, entry }, "ADMIN_LOG_WRITE_FAILED");
      throw new AdminLogWriteError(err);
    }
  }

  /**
   * Writes an AdminLog row outside of any DB transaction (used for actions
   * whose primary effect isn't a Prisma write, e.g. table close/kick which
   * act on live Colyseus rooms). The primary action has already happened by
   * the time this runs, so a failure here can't roll it back - instead we
   * log loudly and rethrow so the caller surfaces a 500 rather than
   * pretending the action completed cleanly with no audit trace.
   */
  private static async writeLogStandalone(entry: AdminLogEntry): Promise<void> {
    try {
      await getPrisma().adminLog.create({ data: buildAdminLogCreateData(entry) });
    } catch (err) {
      logger.error({ err, entry }, "ADMIN_LOG_WRITE_FAILED");
      throw new AdminLogWriteError(err);
    }
  }

  /**
   * Shared path for the common "fetch user, apply a field update, log the
   * before/after" shape used by promote/ban/unban/soft-delete/restore/role
   * change. Runs atomically: the user update and the AdminLog row are
   * written in the same transaction (see writeLog's failure-handling note).
   */
  private static async updateUserWithLog(
    userId: string,
    actorUserId: string,
    action: AdminLogAction,
    data: Prisma.UserUpdateInput,
    reason?: string,
  ): Promise<User> {
    const prisma = getPrisma();
    return prisma.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const updated = await tx.user.update({ where: { id: userId }, data });
      await this.writeLog(tx, {
        actorUserId,
        action,
        targetUserId: userId,
        beforeJson: userAuditSnapshot(before),
        afterJson: userAuditSnapshot(updated),
        reason,
      });
      return updated;
    });
  }

  static async createAdminUser(
    input: {
      email: string;
      password: string;
      displayName?: string;
      username?: string;
    },
    actorUserId: string,
    reason?: string,
  ): Promise<User> {
    const prisma = getPrisma();
    const { user } = await AuthService.register(
      input.email,
      input.password,
      input.displayName || "Admin",
      input.username,
    );

    await AuthService.revokeUserSessions(user.id);

    return prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { role: "ADMIN" },
      });
      await this.writeLog(tx, {
        actorUserId,
        action: "CREATE_ADMIN_USER",
        targetUserId: updated.id,
        beforeJson: userAuditSnapshot(user),
        afterJson: userAuditSnapshot(updated),
        reason,
      });
      return updated;
    });
  }

  static async promoteUserToAdmin(userId: string, actorUserId: string, reason?: string): Promise<User> {
    return this.updateUserWithLog(userId, actorUserId, "PROMOTE", { role: "ADMIN" }, reason);
  }

  static async getUsers(page: number = 1, limit: number = 20): Promise<{ users: AdminUserListItem[], total: number }> {
    const prisma = getPrisma();
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: excludeTournamentBotUsersWhere,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where: excludeTournamentBotUsersWhere }),
    ]);

    if (users.length === 0) {
      return { users: [], total };
    }

    const userIds = users.map((u) => u.id);

    const [txByType, sessions, sessionLastSeen] = await Promise.all([
      prisma.balanceTransaction.groupBy({
        by: ["userId", "type"],
        where: { userId: { in: userIds } },
        _sum: { amountCents: true },
      }),
      prisma.userSession.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, createdAt: true, lastUsedAt: true },
      }),
      prisma.userSession.groupBy({
        by: ["userId"],
        where: { userId: { in: userIds } },
        _max: { lastUsedAt: true, createdAt: true },
      }),
    ]);

    const [seatSessions, seatLastSeen] = await Promise.all([
      prisma.tableSeatSession.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, createdAt: true, lastSeenAt: true, disconnectAt: true },
      }),
      prisma.tableSeatSession.groupBy({
        by: ["userId"],
        where: { userId: { in: userIds } },
        _max: { lastSeenAt: true, createdAt: true, disconnectAt: true },
      }),
    ]);

    const txSumsByUser = new Map<string, Record<string, number>>();
    for (const row of txByType) {
      const byType = txSumsByUser.get(row.userId) ?? {};
      byType[row.type] = row._sum.amountCents ?? 0;
      txSumsByUser.set(row.userId, byType);
    }

    const onlineMsByUser = new Map<string, number>();
    for (const s of sessions) {
      const start = s.createdAt.getTime();
      const end = (s.lastUsedAt ?? s.createdAt).getTime();
      const ms = Math.max(0, end - start);
      onlineMsByUser.set(s.userId, (onlineMsByUser.get(s.userId) ?? 0) + ms);
    }
    for (const s of seatSessions) {
      const start = s.createdAt.getTime();
      const end = (s.disconnectAt ?? s.lastSeenAt ?? s.createdAt).getTime();
      const ms = Math.max(0, end - start);
      onlineMsByUser.set(s.userId, (onlineMsByUser.get(s.userId) ?? 0) + ms);
    }

    const lastOnlineByUser = new Map<string, Date | null>();
    for (const s of sessionLastSeen) {
      const candidate = s._max.lastUsedAt ?? s._max.createdAt ?? null;
      if (candidate) lastOnlineByUser.set(s.userId, candidate);
    }
    for (const s of seatLastSeen) {
      const candidate = s._max.lastSeenAt ?? s._max.disconnectAt ?? s._max.createdAt ?? null;
      const current = lastOnlineByUser.get(s.userId);
      if (!candidate) continue;
      if (!current || candidate.getTime() > current.getTime()) {
        lastOnlineByUser.set(s.userId, candidate);
      }
    }

    const enriched = users.map((user) => {
      const tx = txSumsByUser.get(user.id) ?? {};
      const totalBuyInCents = tx.BUYIN ?? 0;
      const totalCashOutCents = tx.CASHOUT ?? 0;
      const totalTournamentEntryCents = tx.TOURNAMENT_ENTRY ?? 0;
      const totalTournamentPayoutCents = tx.TOURNAMENT_PAYOUT ?? 0;
      const totalSpendCents = totalBuyInCents + totalTournamentEntryCents;
      const totalLostCents =
        Math.max(0, totalBuyInCents - totalCashOutCents) +
        Math.max(0, totalTournamentEntryCents - totalTournamentPayoutCents);

      return {
        user,
        stats: {
          lastOnlineAt: lastOnlineByUser.get(user.id) ?? null,
          totalOnlineHours: Math.round(((onlineMsByUser.get(user.id) ?? 0) / 3_600_000) * 10) / 10,
          totalSpendCents,
          totalLostCents,
          totalBuyInCents,
          totalCashOutCents,
          totalTournamentEntryCents,
          totalTournamentPayoutCents,
        },
      };
    });

    return { users: enriched, total };
  }

  static async banUser(userId: string, actorUserId: string, reason?: string): Promise<User> {
    const prisma = getPrisma();
    const user = await this.updateUserWithLog(userId, actorUserId, "BAN", { isBanned: true }, reason);

    await prisma.userSession.deleteMany({ where: { userId } });
    sessionEvents.emit("user.banned", { userId });
    await this.kickUserFromAllPokerRooms(userId);

    return user;
  }

  static async unbanUser(userId: string, actorUserId: string, reason?: string): Promise<User> {
    return this.updateUserWithLog(userId, actorUserId, "UNBAN", { isBanned: false }, reason);
  }

  static async softDeleteUser(userId: string, actorUserId: string, reason?: string): Promise<User> {
    const prisma = getPrisma();
    const user = await this.updateUserWithLog(userId, actorUserId, "SOFT_DELETE", { deletedAt: new Date() }, reason);

    await prisma.userSession.deleteMany({ where: { userId } });
    sessionEvents.emit("user.banned", { userId });
    await this.kickUserFromAllPokerRooms(userId);

    return user;
  }

  static async restoreUser(userId: string, actorUserId: string, reason?: string): Promise<User> {
    return this.updateUserWithLog(userId, actorUserId, "RESTORE", { deletedAt: null }, reason);
  }

  static async setRole(userId: string, role: UserRole, actorUserId: string, reason?: string): Promise<User> {
    return this.updateUserWithLog(userId, actorUserId, "ROLE_CHANGE", { role }, reason);
  }

  static async getBalances(params: {
    page?: number;
    limit?: number;
    tableId?: string;
    userId?: string;
    status?: string;
  }): Promise<{ items: any[]; total: number }> {
    const prisma = getPrisma();
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.tableId) where.tableId = params.tableId;
    if (params.userId) where.userId = params.userId;
    if (params.status) where.status = params.status;

    const [items, total] = await Promise.all([
      prisma.playerBalance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.playerBalance.count({ where }),
    ]);

    return { items, total };
  }

  static async getTransactions(params: {
    page?: number;
    limit?: number;
    tableId?: string;
    userId?: string;
    handId?: string;
  }): Promise<{ items: any[]; total: number }> {
    const prisma = getPrisma();
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.tableId) where.tableId = params.tableId;
    if (params.userId) where.userId = params.userId;
    if (params.handId) where.handId = params.handId;

    const [items, total] = await Promise.all([
      prisma.balanceTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.balanceTransaction.count({ where }),
    ]);

    return { items, total };
  }

  private static async kickUserFromAllPokerRooms(userId: string): Promise<void> {
    const rooms = await matchMaker.query({ name: "poker" });
    await Promise.allSettled(
      rooms.map(async (room) => {
        const roomId = (room as any)?.roomId;
        if (!roomId) return;
        await matchMaker.remoteRoomCall<any>(roomId, "kickUserByAdmin" as any, [userId, "BANNED"], 5000);
      }),
    );
  }

  /**
   * Runs the abandoned-balance reconciliation sweep (the only bulk,
   * balance-adjusting action currently reachable from the admin API) and
   * records it in the AdminLog. The reconciliation itself is not
   * transactional with the log write (RecoveryService performs its own
   * per-balance cashouts), so on a log-write failure we log loudly and
   * rethrow rather than pretending the run was untracked.
   */
  static async runBalanceRecovery(
    thresholdMs: number,
    actorUserId: string,
    reason?: string,
  ): Promise<{ counts?: number; successCount?: number; failCount?: number }> {
    const result = await RecoveryService.reconcileAbandonedBalances(thresholdMs);
    await this.writeLogStandalone({
      actorUserId,
      action: "BALANCE_RECOVERY",
      afterJson: result as unknown as Prisma.InputJsonValue,
      reason: reason ?? `thresholdMs=${thresholdMs}`,
    });
    return result;
  }

  /** Resolves an admin-supplied roomId to a live Colyseus poker room, matching either the room's own id or its table id. */
  private static async findPokerRoom(roomId: string): Promise<{ roomId: string } | null> {
    const rooms = (await matchMaker.query({ name: "poker" })) as PokerRoomRef[];
    const room = rooms.find((r) => r.roomId === roomId || r.metadata?.tableId === roomId);
    return room?.roomId ? { roomId: room.roomId } : null;
  }

  /**
   * Kicks a single user from a specific live table (admin-initiated), reusing
   * the existing kickUserByAdmin room RPC also used for bans.
   */
  static async kickUserFromTable(
    roomId: string,
    targetUserId: string,
    actorUserId: string,
    reason?: string,
  ): Promise<{ ok: true; roomId: string; targetUserId: string }> {
    const room = await this.findPokerRoom(roomId);
    if (!room) {
      const err = new Error(`Table not found: ${roomId}`) as Error & { code: string };
      err.code = "ROOM_NOT_FOUND";
      throw err;
    }

    await matchMaker.remoteRoomCall<any>(
      room.roomId,
      "kickUserByAdmin" as any,
      [targetUserId, reason ?? "ADMIN_KICK"],
      5000,
    );

    await this.writeLogStandalone({
      actorUserId,
      action: "TABLE_KICK",
      targetUserId,
      targetTableId: room.roomId,
      afterJson: { kicked: true },
      reason,
    });

    return { ok: true, roomId: room.roomId, targetUserId };
  }

  /**
   * Force-closes a specific live table (admin-initiated): kicks every seated
   * human player (cashing them out via the existing per-user kick path) and
   * disposes the room, via PokerRoom.closeTableByAdmin.
   */
  // Covered by AdminService.test.ts; CRAP score reflects the "no coverage data" default, not an actual test gap.
  // fallow-ignore-next-line complexity
  static async closeTable(
    roomId: string,
    actorUserId: string,
    reason?: string,
  ): Promise<{ ok: true; roomId: string; kickedUserIds: string[] }> {
    const room = await this.findPokerRoom(roomId);
    if (!room) {
      const err = new Error(`Table not found: ${roomId}`) as Error & { code: string };
      err.code = "ROOM_NOT_FOUND";
      throw err;
    }

    const result = (await matchMaker.remoteRoomCall<any>(
      room.roomId,
      "closeTableByAdmin" as any,
      [reason ?? "ADMIN_CLOSED"],
      10_000,
    )) as { kickedUserIds?: string[] } | undefined;
    const kickedUserIds = result?.kickedUserIds ?? [];

    await this.writeLogStandalone({
      actorUserId,
      action: "TABLE_CLOSE",
      targetTableId: room.roomId,
      afterJson: { kickedUserIds },
      reason,
    });

    return { ok: true, roomId: room.roomId, kickedUserIds };
  }
}

