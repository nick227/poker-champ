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
        // Deterministic per-episode ref: derived from this row's updatedAt
        // snapshot (not Date.now()), so that re-running the sweep — even
        // concurrently, e.g. from two overlapping cron ticks — for the SAME
        // stale balance always produces the SAME externalRef. That lets
        // CashierService's externalRef-uniqueness guard catch the duplicate
        // and skip crediting twice. A later buy-in on the same table changes
        // updatedAt, so a *future* abandonment episode gets a fresh ref
        // instead of colliding with this one.
        const externalRef = `recovery_${pb.tableId}_${pb.userId}_${new Date(pb.updatedAt).getTime()}`;
        const table = await prisma.pokerTable.findUnique({
          where: { id: pb.tableId },
          select: { name: true, creatorId: true },
        });
        // If the table row is gone (e.g. hard-deleted), fall back to a
        // synthetic name so the cash-out can still proceed and credit the
        // user's bankroll back — CashierService.ensureTableExists will
        // recreate a minimal PokerTable row for the FK. Refusing to recover
        // funds just because the table metadata is missing would strand the
        // user's money indefinitely.
        const tableMeta = {
          name: table?.name ?? `Recovered Table ${pb.tableId}`,
          creatorId: table?.creatorId ?? undefined,
        };

        await CashierService.processCashGameCashOut({
          userId: pb.userId,
          tableId: pb.tableId,
          amountCents: pb.balanceCents,
          externalRef,
          tableMeta,
        });

        // Mark as explicitly ABANDONED (final state after recovery). This is
        // best-effort bookkeeping on top of the already-committed cash-out:
        // if it fails, the funds are safely credited either way (processCash
        // GameCashOut already flips status to CASHED_OUT when the balance is
        // fully drained), it just won't carry the more specific ABANDONED
        // label. It's also naturally idempotent: once status is no longer
        // ACTIVE, this row won't be picked up as a candidate again.
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

