
import { getPrisma } from "@poker-champ/db";
import type { User } from "@prisma/client";
import { UserRole } from "@prisma/client";
import { matchMaker } from "@colyseus/core";
import { sessionEvents } from "./SessionEvents.js";
import { AuthService } from "./AuthService.js";

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

export class AdminService {
  static async createAdminUser(input: {
    email: string;
    password: string;
    displayName?: string;
    username?: string;
  }): Promise<User> {
    const prisma = getPrisma();
    const { user } = await AuthService.register(
      input.email,
      input.password,
      input.displayName || "Admin",
      input.username,
    );

    await AuthService.revokeUserSessions(user.id);
    return prisma.user.update({
      where: { id: user.id },
      data: { role: "ADMIN" },
    });
  }

  static async promoteUserToAdmin(userId: string): Promise<User> {
    const prisma = getPrisma();
    return prisma.user.update({
      where: { id: userId },
      data: { role: "ADMIN" },
    });
  }

  static async getUsers(page: number = 1, limit: number = 20): Promise<{ users: AdminUserListItem[], total: number }> {
    const prisma = getPrisma();
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
         // Exclude sensitive fields if necessary, though passwordHash is safer to exclude in Controller layer
         // But for simplicity sending full object for now
      }),
      prisma.user.count()
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

  static async banUser(userId: string): Promise<User> {
    const prisma = getPrisma();
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isBanned: true }
    });

    await prisma.userSession.deleteMany({ where: { userId } });
    sessionEvents.emit("user.banned", { userId });
    await this.kickUserFromAllPokerRooms(userId);

    return user;
  }

  static async unbanUser(userId: string): Promise<User> {
    const prisma = getPrisma();
    return await prisma.user.update({
      where: { id: userId },
      data: { isBanned: false }
    });
  }

  static async softDeleteUser(userId: string): Promise<User> {
    const prisma = getPrisma();
    const user = await prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });

    await prisma.userSession.deleteMany({ where: { userId } });
    sessionEvents.emit("user.banned", { userId });
    await this.kickUserFromAllPokerRooms(userId);

    return user;
  }

  static async restoreUser(userId: string): Promise<User> {
    const prisma = getPrisma();
    return prisma.user.update({
      where: { id: userId },
      data: { deletedAt: null },
    });
  }

  static async setRole(userId: string, role: UserRole): Promise<User> {
      const prisma = getPrisma();
      return await prisma.user.update({
          where: { id: userId },
          data: { role }
      });
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
}

