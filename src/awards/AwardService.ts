import { randomUUID } from "node:crypto";
import { getPrisma } from "../db/prisma.js";
import { logger } from "../lib/logger.js";
import { awardCatalog } from "./awardCatalog.js";
import type { AwardGrant, BulkGrantResult, GrantCandidate } from "./types.js";
import { evaluateHandAwards } from "./evaluateHandAwards.js";
import type { HandSummary, HandAwardSessionState } from "./evaluateHandAwards.js";

const BULK_CAP = 10;
// Observability (plan §3.2): when adding metrics, emit awards.granted.count, awards.skipped.count, awards.bulk.capped

/** Prisma P2002 = unique constraint violation. */
function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string };
  return err?.code === "P2002";
}

function toAwardGrant(
  awardId: string,
  reason: string,
  contextType?: string,
  contextId?: string
): AwardGrant | null {
  const entry = awardCatalog.getById(awardId);
  if (!entry) return null;
  return {
    awardId: entry.id,
    name: entry.name,
    graphic: entry.graphic,
    tier: entry.tier,
    tierWeight: entry.tierWeight,
    priorityWeight: entry.priorityWeight,
    reason,
    ...(contextType && { contextType: contextType as AwardGrant["contextType"] }),
    ...(contextId && { contextId }),
  };
}

export class AwardService {
  async bulkGrant(
    userId: string,
    candidates: GrantCandidate[],
    context?: { handId?: string; incrementHandCount?: boolean }
  ): Promise<BulkGrantResult> {
    const granted: AwardGrant[] = [];
    const skipped: string[] = [];

    const prisma = getPrisma();

    await prisma.$transaction(async (tx) => {
      if (context?.incrementHandCount) {
        const id = randomUUID();
        await tx.$executeRawUnsafe(
          "INSERT INTO UserHandCount (id, userId, handsDealt, updatedAt) VALUES (?, ?, 1, NOW()) ON DUPLICATE KEY UPDATE handsDealt = handsDealt + 1, updatedAt = NOW()",
          id,
          userId
        );
      }

      const existing = await tx.userAward.findMany({
        where: { userId },
        select: { awardId: true, id: true },
      });
      const earnedSet = new Set(existing.map((r: { awardId: string }) => r.awardId));
      const existingIdByAward = new Map(existing.map((r: { awardId: string; id: string }) => [r.awardId, r.id]));

      const catalogVersion = awardCatalog.version;
      const now = new Date();

      let list = candidates;
      list = list.filter((c) => {
        const entry = awardCatalog.getById(c.awardId);
        if (!entry) return false;
        if (entry.earnType === "ONE_TIME" && earnedSet.has(c.awardId)) return false;
        return true;
      });
      if (list.length > BULK_CAP) {
        logger.error({
          userId,
          handId: context?.handId,
          originalCount: candidates.length,
          afterDedupe: list.length,
          cappedTo: BULK_CAP,
          awardIds: list.slice(0, BULK_CAP).map((a) => a.awardId),
        });
        list = list.slice(0, BULK_CAP);
      }

      for (const c of list) {
        const entry = awardCatalog.getById(c.awardId);
        if (!entry) {
          skipped.push(c.awardId);
          continue;
        }

        if (entry.earnType === "ONE_TIME") {
          if (earnedSet.has(c.awardId)) {
            skipped.push(c.awardId);
            continue;
          }
          await tx.userAward.create({
            data: {
              userId,
              awardId: c.awardId,
              catalogVersion,
              earnedAt: now,
              lastEarnedAt: now,
              count: 1,
              reason: c.reason,
              contextType: c.contextType ?? null,
              contextId: c.contextId ?? null,
            },
          });
          earnedSet.add(c.awardId);
          const ag = toAwardGrant(c.awardId, c.reason, c.contextType, c.contextId);
          if (ag) granted.push(ag);
          continue;
        }

        if (entry.earnType === "REPEATABLE" && c.triggerKey) {
          try {
            await tx.awardGrantEvent.create({
              data: {
                userId,
                awardId: c.awardId,
                triggerKey: c.triggerKey,
                earnedAt: now,
              },
            });
          } catch (e) {
            if (isUniqueViolation(e)) {
              skipped.push(c.awardId);
              continue;
            }
            throw e;
          }
        }

        const existingRowId = existingIdByAward.get(c.awardId);

        if (existingRowId) {
          await tx.userAward.update({
            where: { id: existingRowId },
            data: {
              count: { increment: 1 },
              lastEarnedAt: now,
              reason: c.reason,
              contextType: c.contextType ?? null,
              contextId: c.contextId ?? null,
            },
          });
        } else {
          await tx.userAward.create({
            data: {
              userId,
              awardId: c.awardId,
              catalogVersion,
              earnedAt: now,
              lastEarnedAt: now,
              count: 1,
              reason: c.reason,
              contextType: c.contextType ?? null,
              contextId: c.contextId ?? null,
            },
          });
        }
        const ag = toAwardGrant(c.awardId, c.reason, c.contextType, c.contextId);
        if (ag) granted.push(ag);
      }
    });

    return { granted, skipped };
  }

  async getEarnedAwardIds(userId: string): Promise<Set<string>> {
    const prisma = getPrisma();
    const rows = await prisma.userAward.findMany({
      where: { userId },
      select: { awardId: true },
    });
    return new Set(rows.map((r: { awardId: string }) => r.awardId));
  }

  /** Batch load earned award ids and hand counts in one transaction (consistent snapshot). */
  async getEarnedAwardIdsAndHandCounts(userIds: string[]): Promise<{
    earnedByUserId: Map<string, Set<string>>;
    handsDealtByUserId: Map<string, number>;
  }> {
    if (userIds.length === 0) {
      return { earnedByUserId: new Map(), handsDealtByUserId: new Map() };
    }
    const prisma = getPrisma();
    return prisma.$transaction(async (tx) => {
      const [awards, counts] = await Promise.all([
        tx.userAward.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, awardId: true },
        }),
        tx.userHandCount.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, handsDealt: true },
        }),
      ]);
      const earnedByUserId = new Map<string, Set<string>>();
      for (const uid of userIds) earnedByUserId.set(uid, new Set());
      for (const r of awards) {
        earnedByUserId.get(r.userId)?.add(r.awardId);
      }
      const handsDealtByUserId = new Map<string, number>();
      for (const uid of userIds) handsDealtByUserId.set(uid, 0);
      for (const r of counts) handsDealtByUserId.set(r.userId, r.handsDealt);
      return { earnedByUserId, handsDealtByUserId };
    });
  }

  /**
   * Hand-end awards: batch load, atomic increment, then evaluate + bulkGrant per user.
   * Caller must have already called sessionTracker.recordHandResult(userId, won) for each user.
   * No-ops if UserHandCount table is missing (e.g. test DB without Phase 2 migration).
   */
  async processHandEndAwards(
    handSummary: HandSummary,
    dealtUserIds: string[],
    getSessionState: (userId: string) => HandAwardSessionState
  ): Promise<void> {
    if (dealtUserIds.length === 0) return;
    const prisma = getPrisma();
    const existingUsers = await prisma.user.findMany({
      where: { id: { in: dealtUserIds } },
      select: { id: true },
    });
    const existingIds = new Set(existingUsers.map((u) => u.id));
    const userIdsToProcess = dealtUserIds.filter((id) => existingIds.has(id));
    if (userIdsToProcess.length === 0) return;
    try {
      const { earnedByUserId, handsDealtByUserId } = await this.getEarnedAwardIdsAndHandCounts(userIdsToProcess);
      const { handId } = handSummary;
      for (const userId of userIdsToProcess) {
        const earnedAwardIds = earnedByUserId.get(userId) ?? new Set();
        const handsBefore = handsDealtByUserId.get(userId) ?? 0;
        const lifetimeHands = handsBefore + 1;
        const sessionState = getSessionState(userId);
        const candidates = evaluateHandAwards(
          handSummary,
          userId,
          sessionState,
          earnedAwardIds,
          lifetimeHands
        );
        await this.bulkGrant(userId, candidates, { handId, incrementHandCount: true });
      }
    } catch (e) {
      const prismaErr = e as { code?: string; meta?: { code?: string } };
      if (prismaErr?.code === "P2010" || prismaErr?.code === "P2021" || prismaErr?.meta?.code === "1146" || prismaErr?.code === "P2003" || prismaErr?.meta?.code === "1452") {
        logger.warn({ err: e }, "Hand-end awards skipped: UserHandCount table missing or user not found (run Phase 2 migration or check user creation)");
        return;
      }
      throw e;
    }
  }

  async getUserAwards(
    userId: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<{
    items: Array<{ id: string; awardId: string; earnedAt: Date; lastEarnedAt: Date; count: number; reason: string; contextType: string | null; contextId: string | null }>;
    nextCursor: string | null;
  }> {
    const prisma = getPrisma();
    const limit = Math.min(options?.limit ?? 100, 100);
    const rows = await prisma.userAward.findMany({
      where: { userId },
      select: { id: true, awardId: true, earnedAt: true, lastEarnedAt: true, count: true, reason: true, contextType: true, contextId: true },
      orderBy: { lastEarnedAt: "desc" },
      take: limit + 1,
      ...(options?.cursor && { skip: 1, cursor: { id: options.cursor } }),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;
    return { items, nextCursor };
  }
}

export const awardService = new AwardService();
