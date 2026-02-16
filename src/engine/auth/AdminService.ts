
import { getPrisma } from "../../db/prisma.js";
import type { User } from "@prisma/client";
import { UserRole } from "@prisma/client";
import { matchMaker } from "@colyseus/core";
import { sessionEvents } from "./SessionEvents.js";

export class AdminService {
  static async getUsers(page: number = 1, limit: number = 20): Promise<{ users: User[], total: number }> {
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

    return { users, total };
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
