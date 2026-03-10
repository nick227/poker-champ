import { matchMaker } from "@colyseus/core";
import { getPrisma } from "@poker-champ/db";
import { CashierService } from "../economy/CashierService.js";
import { logger } from "../../lib/logger.js";

export class RecoveryService {
  /**
   * Reconcile abandoned balances
   * Finds ACTIVE balances that haven't been updated for a certain threshold (e.g. 2 hours)
   * and automatically cashes them out.
   */
  static async reconcileAbandonedBalances(thresholdMs: number = 2 * 60 * 60 * 1000) {
    const prisma = getPrisma();
    const cutoff = new Date(Date.now() - thresholdMs);

    logger.info({ cutoff }, "Starting abandoned balance reconciliation");

    // 1. Find abandoned ACTIVE balances
    const candidates = await prisma.playerBalance.findMany({
      where: {
        status: "ACTIVE",
        updatedAt: { lt: cutoff },
        balanceCents: { gt: 0 },
      },
    });

    if (candidates.length === 0) {
      logger.info("No abandoned balance candidates found");
      return { counts: 0 };
    }

    // 2. Cross-reference with active matchmaker rooms
    const activeRooms = await matchMaker.query({ name: "poker" });
    const activeTableIds = new Set(
      activeRooms
        .map((r: any) => r.metadata?.tableId)
        .filter((id: any): id is string => typeof id === "string")
    );

    const abandoned = candidates.filter((pb: any) => !activeTableIds.has(pb.tableId));

    if (abandoned.length === 0) {
      logger.info({ candidateCount: candidates.length }, "All candidate balances belong to active tables. Skipping.");
      return { counts: 0 };
    }

    logger.info({ count: abandoned.length }, "Processing verified abandoned balances");

    let successCount = 0;
    let failCount = 0;

    for (const pb of abandoned as any[]) {
      try {
        const externalRef = `recovery_${pb.tableId}_${pb.userId}_${Date.now()}`;
        const table = await prisma.pokerTable.findUnique({
          where: { id: pb.tableId },
          select: { name: true, creatorId: true },
        });
        if (!table) {
          throw new Error(`TABLE_NOT_FOUND_FOR_RECOVERY:${pb.tableId}`);
        }
        
        await CashierService.processCashGameCashOut({
          userId: pb.userId,
          tableId: pb.tableId,
          amountCents: pb.balanceCents,
          externalRef,
          tableMeta: {
            name: table.name,
            creatorId: table.creatorId ?? undefined,
          },
        });

        // Mark as explicitly ABANDONED (final state after recovery)
        await prisma.playerBalance.update({
          where: { id: pb.id },
          data: { status: "ABANDONED" },
        });

        successCount++;
        logger.info({ userId: pb.userId, tableId: pb.tableId, amount: pb.balanceCents }, "Recovered abandoned balance");
      } catch (err) {
        failCount++;
        logger.error({ err, userId: pb.userId, tableId: pb.tableId }, "Failed to recover abandoned balance");
      }
    }

    return { successCount, failCount };
  }

  /**
   * Clean up stale tables
   * In a real system, you'd check if any game server still has this table in memory.
   * For this POC, we'll just mark balances as ABANDONED if the table itself is "closed".
   * (Logic depends on how tables are closed).
   */
  static async reconcileClosedTableBalances() {
    // Placeholder for future logic where we cross-reference matchmaker rooms
  }
}

