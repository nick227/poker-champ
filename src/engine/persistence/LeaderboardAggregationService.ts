import type { PrismaClient } from "@prisma/client";
import pLimit from "p-limit";
import { nanoid } from "nanoid";
import { getPrisma } from "../../db/prisma.js";
import { logger } from "../../lib/logger.js";

export type LeaderboardPeriod = "daily" | "weekly" | "all_time";
export type LeaderboardCategory =
  | "biggest_winner"
  | "biggest_donor"
  | "showdown_sniper"
  | "all_in_maniac"
  | "ice_cold"
  | "heater"
  | "tight_rock"
  | "action_junkie";

export type LeaderboardSnapshotEntry = {
  rank: number;
  userId: string;
  displayName: string;
  value: string;
  valueNumerator: number;
  valueDenominator: number | null;
  handCount: number;
};

const PERIODS: LeaderboardPeriod[] = ["daily", "weekly", "all_time"];
const CATEGORIES: LeaderboardCategory[] = [
  "biggest_winner",
  "biggest_donor",
  "showdown_sniper",
  "all_in_maniac",
  "ice_cold",
  "heater",
  "tight_rock",
  "action_junkie",
];

/** Minimum showdown hands per user to appear in Showdown Wins. Kept low so leaderboard populates with typical play. */
const SHOWDOWN_MIN_SAMPLES = 5;
const VPIP_MIN_SAMPLES = 100;
const SNAPSHOT_WRITE_CHUNK_SIZE = 500;
/** Max hands per actor for streak computation to avoid memory spikes. */
const STREAK_MAX_HANDS_PER_ACTOR = 200;
/** Chunk size for IN (handId) to avoid MySQL packet limits. */
const IN_CLAUSE_CHUNK_SIZE = 1000;

type ActorMetadata = {
  displayName: string;
  createdAtMs: number;
};

export class LeaderboardAggregationService {
  static floorToHourUtc(input: Date): Date {
    return new Date(
      Date.UTC(
        input.getUTCFullYear(),
        input.getUTCMonth(),
        input.getUTCDate(),
        input.getUTCHours(),
        0,
        0,
        0,
      ),
    );
  }

  private static readonly SNAPSHOT_CONCURRENCY = 8;

  /** Returns number of category/period tasks that failed. */
  static async recomputeHourlySnapshots(
    computedAt: Date = LeaderboardAggregationService.floorToHourUtc(new Date()),
  ): Promise<{ failureCount: number }> {
    const tasks = PERIODS.flatMap((period) =>
      CATEGORIES.map((category) => ({ period, category })),
    );
    const limit = pLimit(LeaderboardAggregationService.SNAPSHOT_CONCURRENCY);
    const results = await Promise.allSettled(
      tasks.map(({ period, category }) =>
        limit(() =>
          LeaderboardAggregationService.recomputeSnapshot(period, category, computedAt),
        ),
      ),
    );
    let failureCount = 0;
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        failureCount += 1;
        const { period, category } = tasks[i];
        logger.error(
          { err: result.reason, period, category, computedAt: computedAt.toISOString() },
          "Leaderboard snapshot category failed",
        );
      }
    });
    return { failureCount };
  }

  /**
   * Reads (computeCategory) run outside the write transaction. Concurrent recomputes or hands
   * ending mid-run can yield slightly inconsistent snapshot sets across categories; acceptable for leaderboards.
   */
  static async recomputeSnapshot(period: LeaderboardPeriod, category: LeaderboardCategory, computedAt: Date) {
    const prisma = getPrisma();
    const entries = await computeCategory(prisma, category, period, computedAt);

    await prisma.$transaction(async (tx) => {
      await tx.leaderboardSnapshot.deleteMany({
        where: {
          period,
          category,
          computedAt,
        },
      });

      if (entries.length === 0) {
        const firstUser = await tx.user.findFirst({
          orderBy: { createdAt: "asc" },
          select: { id: true, displayName: true },
        });
        if (firstUser) {
          await tx.leaderboardSnapshot.create({
            data: {
              id: nanoid(),
              period,
              category,
              actorId: firstUser.id,
              actorType: "USER",
              userId: firstUser.id,
              userDisplayName: firstUser.displayName ?? "",
              value: "",
              valueNumerator: 0,
              valueDenominator: null,
              handCount: 0,
              rank: 0,
              computedAt,
              isEmpty: true,
            },
          });
        }
        return;
      }

      const rows = entries.map((entry) => {
        const actorId = entry.userId;
        const actorType = actorId.startsWith("bot:") ? "BOT" : "USER";
        return {
          id: nanoid(),
          period,
          category,
          actorId,
          actorType,
          userId: actorType === "BOT" ? null : actorId,
          userDisplayName: entry.displayName,
          value: entry.value,
          valueNumerator: entry.valueNumerator,
          valueDenominator: entry.valueDenominator,
          handCount: entry.handCount,
          rank: entry.rank,
          computedAt,
          isEmpty: false,
        };
      });

      for (let i = 0; i < rows.length; i += SNAPSHOT_WRITE_CHUNK_SIZE) {
        await tx.leaderboardSnapshot.createMany({
          data: rows.slice(i, i + SNAPSHOT_WRITE_CHUNK_SIZE),
          skipDuplicates: true,
        });
      }
    });
  }

  static async readLatestSnapshot(input: {
    period: LeaderboardPeriod;
    category: LeaderboardCategory;
    limit: number;
  }): Promise<{ computedAt: string | null; entries: LeaderboardSnapshotEntry[]; totalEntries: number }> {
    const prisma = getPrisma();
    const latest = await prisma.leaderboardSnapshot.aggregate({
      where: {
        period: input.period,
        category: input.category,
      },
      _max: { computedAt: true },
    });

    const computedAt = latest._max.computedAt;
    if (!computedAt) {
      return { computedAt: null, entries: [], totalEntries: 0 };
    }

    const where = {
      period: input.period,
      category: input.category,
      computedAt,
      isEmpty: false,
    };
    const [entriesRows, totalEntries] = await Promise.all([
      prisma.leaderboardSnapshot.findMany({
        where,
        orderBy: [{ rank: "asc" }, { valueNumerator: "desc" }, { handCount: "desc" }],
        take: input.limit,
      }),
      prisma.leaderboardSnapshot.count({ where }),
    ]);

    const rows = entriesRows;

    return {
      computedAt: computedAt.toISOString(),
      totalEntries,
      entries: rows.map((row) => ({
        rank: row.rank,
        userId: row.userId ?? row.actorId,
        displayName: row.userDisplayName,
        value: row.value,
        valueNumerator: row.valueNumerator,
        valueDenominator: row.valueDenominator,
        handCount: row.handCount,
      })),
    };
  }
}

function getSinceForPeriod(period: LeaderboardPeriod, asOf: Date): Date | null {
  if (period === "daily") return new Date(asOf.getTime() - 24 * 60 * 60 * 1000);
  if (period === "weekly") return new Date(asOf.getTime() - 7 * 24 * 60 * 60 * 1000);
  return null;
}

/** Half-open [since, asOf) to avoid double-counting at exact boundary timestamps. */
function handWhereForPeriod(since: Date | null, asOf: Date): { endedAt: { not: null; gte?: Date; lt: Date } } {
  return since
    ? { endedAt: { not: null, gte: since, lt: asOf } }
    : { endedAt: { not: null, lt: asOf } };
}

function formatCurrencyCents(cents: number): string {
  const abs = Math.abs(cents);
  const sign = cents > 0 ? "+" : cents < 0 ? "-" : "";
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

function formatPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatPerHundred(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0.0 /100";
  return `${((numerator / denominator) * 100).toFixed(1)} /100`;
}

async function getUserMetadata(prisma: PrismaClient, userIds: string[]): Promise<Map<string, ActorMetadata>> {
  if (userIds.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, displayName: true, username: true, email: true, createdAt: true },
  });
  const map = new Map<string, ActorMetadata>();
  for (const user of users) {
    map.set(user.id, {
      displayName: user.displayName || user.username || user.email || user.id,
      createdAtMs: user.createdAt.getTime(),
    });
  }
  return map;
}

function compareUserTieBreak(meta: Map<string, ActorMetadata>, aUserId: string, bUserId: string): number {
  const aCreated = meta.get(aUserId)?.createdAtMs ?? Number.MAX_SAFE_INTEGER;
  const bCreated = meta.get(bUserId)?.createdAtMs ?? Number.MAX_SAFE_INTEGER;
  if (aCreated !== bCreated) return aCreated - bCreated;
  return aUserId.localeCompare(bUserId);
}

/** Prefer stable externalId for bots; displayName is mutable and would split historical identity. */
function resolveActorId(input: {
  userId: string | null;
  externalId?: string | null;
  displayName?: string | null;
}): string {
  if (input.userId) return input.userId;
  if (input.externalId) return input.externalId;
  const botName = input.displayName?.trim().toLowerCase();
  if (botName) return `bot:${botName}`;
  return "unknown";
}

function withRanks(rows: Omit<LeaderboardSnapshotEntry, "rank">[]): LeaderboardSnapshotEntry[] {
  return rows.map((row, index) => ({ rank: index + 1, ...row }));
}

/**
 * Leaderboard can be empty when: (1) no snapshot has been recomputed yet,
 * (2) no Hand rows with endedAt in the period (or no BalanceTransaction with handId for biggest_winner),
 * (3) for showdown_sniper, no user has >= SHOWDOWN_MIN_SAMPLES hands in the period.
 */
async function computeCategory(
  prisma: PrismaClient,
  category: LeaderboardCategory,
  period: LeaderboardPeriod,
  asOf: Date,
): Promise<LeaderboardSnapshotEntry[]> {
  switch (category) {
    case "biggest_winner":
      return computeProfitLeaders(prisma, period, asOf, "winner");
    case "biggest_donor":
      return computeProfitLeaders(prisma, period, asOf, "donor");
    case "showdown_sniper":
      return computeShowdownSniper(prisma, period, asOf);
    case "all_in_maniac":
      return computeAllInManiac(prisma, period, asOf);
    case "ice_cold":
      return computeStreaks(prisma, period, asOf, "loss");
    case "heater":
      return computeStreaks(prisma, period, asOf, "win");
    case "tight_rock":
      return computeVpip(prisma, period, asOf, "tight");
    case "action_junkie":
      return computeVpip(prisma, period, asOf, "loose");
    default:
      return [];
  }
}

async function computeProfitLeaders(
  prisma: PrismaClient,
  period: LeaderboardPeriod,
  asOf: Date,
  mode: "winner" | "donor",
): Promise<LeaderboardSnapshotEntry[]> {
  const since = getSinceForPeriod(period, asOf);
  const handWhere = handWhereForPeriod(since, asOf);

  const byUserAndHand = await prisma.balanceTransaction.groupBy({
    by: ["userId", "handId"],
    where: {
      handId: { not: null },
      hand: handWhere,
    },
    _sum: { amountCents: true },
  });

  const totalCentsByUser = new Map<string, number>();
  const handCountByUser = new Map<string, number>();
  for (const row of byUserAndHand) {
    const sum = row._sum.amountCents ?? 0;
    totalCentsByUser.set(row.userId, (totalCentsByUser.get(row.userId) ?? 0) + sum);
    handCountByUser.set(row.userId, (handCountByUser.get(row.userId) ?? 0) + 1);
  }

  const filtered = Array.from(totalCentsByUser.entries())
    .map(([userId, totalCents]) => ({ userId, totalCents }))
    .filter((row) => (mode === "winner" ? row.totalCents > 0 : row.totalCents < 0));

  const userMeta = await getUserMetadata(prisma, filtered.map((row) => row.userId));

  // Bots don't have BalanceTransaction rows, so include them from hand stack deltas.
  const botHandRows = await prisma.handPlayer.findMany({
    where: {
      hand: handWhere,
      player: { userId: null },
    },
    select: {
      handId: true,
      startingStackCents: true,
      endingStackCents: true,
      player: {
        select: {
          userId: true,
          externalId: true,
          displayName: true,
          createdAt: true,
        },
      },
    },
  });
  const botProfitById = new Map<string, number>();
  const botHandsById = new Map<string, Set<string>>();
  for (const row of botHandRows) {
    if (row.endingStackCents == null) continue;
    const actorId = resolveActorId({
      userId: row.player.userId,
      externalId: row.player.externalId,
      displayName: row.player.displayName,
    });
    const delta = row.endingStackCents - row.startingStackCents;
    botProfitById.set(actorId, (botProfitById.get(actorId) ?? 0) + delta);
    if (!botHandsById.has(actorId)) botHandsById.set(actorId, new Set());
    botHandsById.get(actorId)!.add(row.handId);
    if (!userMeta.has(actorId)) {
      userMeta.set(actorId, {
        displayName: row.player.displayName || actorId,
        createdAtMs: row.player.createdAt.getTime(),
      });
    }
  }

  const userIdsFromLedger = new Set(totalCentsByUser.keys());

  filtered.sort((a, b) => {
    if (mode === "winner" && b.totalCents !== a.totalCents) return b.totalCents - a.totalCents;
    if (mode === "donor" && a.totalCents !== b.totalCents) return a.totalCents - b.totalCents;
    const aHands = handCountByUser.get(a.userId) ?? 0;
    const bHands = handCountByUser.get(b.userId) ?? 0;
    if (bHands !== aHands) return bHands - aHands;
    return compareUserTieBreak(userMeta, a.userId, b.userId);
  });

  const rows: Omit<LeaderboardSnapshotEntry, "rank">[] = filtered.map((row) => ({
    userId: row.userId,
    displayName: userMeta.get(row.userId)?.displayName ?? row.userId,
    value: formatCurrencyCents(row.totalCents),
    valueNumerator: row.totalCents,
    valueDenominator: null,
    handCount: handCountByUser.get(row.userId) ?? 0,
  }));

  for (const [actorId, value] of botProfitById.entries()) {
    if (userIdsFromLedger.has(actorId)) continue;
    const include = mode === "winner" ? value > 0 : value < 0;
    if (!include) continue;
    rows.push({
      userId: actorId,
      displayName: userMeta.get(actorId)?.displayName ?? actorId,
      value: formatCurrencyCents(value),
      valueNumerator: value,
      valueDenominator: null,
      handCount: botHandsById.get(actorId)?.size ?? 0,
    });
  }

  rows.sort((a, b) => {
    if (mode === "winner" && b.valueNumerator !== a.valueNumerator) return b.valueNumerator - a.valueNumerator;
    if (mode === "donor" && a.valueNumerator !== b.valueNumerator) return a.valueNumerator - b.valueNumerator;
    if (b.handCount !== a.handCount) return b.handCount - a.handCount;
    return compareUserTieBreak(userMeta, a.userId, b.userId);
  });

  return withRanks(rows);
}

async function computeShowdownSniper(
  prisma: PrismaClient,
  period: LeaderboardPeriod,
  asOf: Date,
): Promise<LeaderboardSnapshotEntry[]> {
  const since = getSinceForPeriod(period, asOf);
  const handWhere = { ...handWhereForPeriod(since, asOf), reason: "SHOWDOWN" as const };

  const handIds = await prisma.hand.findMany({
    where: handWhere,
    select: { id: true },
  }).then((rows) => rows.map((r) => r.id));
  if (handIds.length === 0) return [];

  const handIdChunks: string[][] = [];
  for (let i = 0; i < handIds.length; i += IN_CLAUSE_CHUNK_SIZE) {
    handIdChunks.push(handIds.slice(i, i + IN_CLAUSE_CHUNK_SIZE));
  }
  const [participationRows, payoutRows] = await Promise.all([
    Promise.all(
      handIdChunks.map((chunk) =>
        prisma.handPlayer.findMany({
          where: { handId: { in: chunk } },
          select: {
            handId: true,
            player: { select: { userId: true, externalId: true, displayName: true, createdAt: true } },
          },
        }),
      ),
    ).then((pages) => pages.flat()),
    Promise.all(
      handIdChunks.map((chunk) =>
        prisma.handPayout.findMany({
          where: { handId: { in: chunk } },
          select: {
            handId: true,
            amountCents: true,
            player: { select: { userId: true, externalId: true, displayName: true, createdAt: true } },
          },
        }),
      ),
    ).then((pages) => pages.flat()),
  ]);

  const seen = new Map<string, number>();
  const wins = new Map<string, number>();
  const actorMeta = new Map<string, ActorMetadata>();

  const participantsByHand = new Map<string, Map<string, void>>();
  for (const row of participationRows) {
    const actorId = resolveActorId({
      userId: row.player.userId,
      externalId: row.player.externalId,
      displayName: row.player.displayName,
    });
    if (!actorMeta.has(actorId)) {
      actorMeta.set(actorId, {
        displayName: row.player.displayName || actorId,
        createdAtMs: row.player.createdAt.getTime(),
      });
    }
    if (!participantsByHand.has(row.handId)) participantsByHand.set(row.handId, new Map());
    participantsByHand.get(row.handId)!.set(actorId);
  }
  for (const [, actorIds] of participantsByHand) {
    for (const actorId of actorIds.keys()) {
      seen.set(actorId, (seen.get(actorId) ?? 0) + 1);
    }
  }

  const payoutByHandAndActor = new Map<string, Map<string, number>>();
  for (const row of payoutRows) {
    const actorId = resolveActorId({
      userId: row.player.userId,
      externalId: row.player.externalId,
      displayName: row.player.displayName,
    });
    if (!actorMeta.has(actorId)) {
      actorMeta.set(actorId, {
        displayName: row.player.displayName || actorId,
        createdAtMs: row.player.createdAt.getTime(),
      });
    }
    if (!payoutByHandAndActor.has(row.handId)) payoutByHandAndActor.set(row.handId, new Map());
    const m = payoutByHandAndActor.get(row.handId)!;
    m.set(actorId, (m.get(actorId) ?? 0) + row.amountCents);
  }
  // Only max-payout (main-pot) winners count; side-pot winners get smaller payouts and are excluded.
  for (const [, payoutByUser] of payoutByHandAndActor) {
    const maxPayoutThisHand = Math.max(0, ...payoutByUser.values());
    for (const [actorId, amount] of payoutByUser.entries()) {
      if (amount > 0 && amount >= maxPayoutThisHand) wins.set(actorId, (wins.get(actorId) ?? 0) + 1);
    }
  }

  const candidateIds = Array.from(seen.keys()).filter((userId) => (seen.get(userId) ?? 0) >= SHOWDOWN_MIN_SAMPLES);

  const rows = candidateIds
    .map((userId) => {
      const numerator = wins.get(userId) ?? 0;
      const denominator = seen.get(userId) ?? 0;
      return {
        userId,
        displayName: actorMeta.get(userId)?.displayName ?? userId,
        value: formatPercent(numerator, denominator),
        valueNumerator: numerator,
        valueDenominator: denominator,
        handCount: denominator,
      } satisfies Omit<LeaderboardSnapshotEntry, "rank">;
    })
    .sort((a, b) => {
      const aRatio = a.valueDenominator ? a.valueNumerator / a.valueDenominator : 0;
      const bRatio = b.valueDenominator ? b.valueNumerator / b.valueDenominator : 0;
      if (bRatio !== aRatio) return bRatio - aRatio;
      if (b.handCount !== a.handCount) return b.handCount - a.handCount;
      return compareUserTieBreak(actorMeta, a.userId, b.userId);
    });

  return withRanks(rows);
}

async function computeAllInManiac(
  prisma: PrismaClient,
  period: LeaderboardPeriod,
  asOf: Date,
): Promise<LeaderboardSnapshotEntry[]> {
  const since = getSinceForPeriod(period, asOf);
  const handWhere = handWhereForPeriod(since, asOf);

  const participationRows = await prisma.handPlayer.findMany({
    where: {
      hand: handWhere,
    },
    select: {
      handId: true,
      player: { select: { userId: true, externalId: true, displayName: true, createdAt: true } },
    },
  });

  const handsByUser = new Map<string, Set<string>>();
  const actorMeta = new Map<string, ActorMetadata>();
  for (const row of participationRows) {
    const actorId = resolveActorId({
      userId: row.player.userId,
      externalId: row.player.externalId,
      displayName: row.player.displayName,
    });
    if (!handsByUser.has(actorId)) handsByUser.set(actorId, new Set());
    handsByUser.get(actorId)!.add(row.handId);
    if (!actorMeta.has(actorId)) {
      actorMeta.set(actorId, {
        displayName: row.player.displayName || actorId,
        createdAtMs: row.player.createdAt.getTime(),
      });
    }
  }

  const allInRows = await prisma.handAction.findMany({
    where: {
      action: "ALL_IN",
      hand: handWhere,
    },
    select: {
      player: { select: { userId: true, externalId: true, displayName: true, createdAt: true } },
    },
  });

  const allInByUser = new Map<string, number>();
  for (const row of allInRows) {
    const actorId = resolveActorId({
      userId: row.player.userId,
      externalId: row.player.externalId,
      displayName: row.player.displayName,
    });
    allInByUser.set(actorId, (allInByUser.get(actorId) ?? 0) + 1);
    if (!actorMeta.has(actorId)) {
      actorMeta.set(actorId, {
        displayName: row.player.displayName || actorId,
        createdAtMs: row.player.createdAt.getTime(),
      });
    }
  }

  const userIds = Array.from(handsByUser.keys());

  const rows = userIds
    .map((userId) => {
      const handCount = handsByUser.get(userId)?.size ?? 0;
      const numerator = allInByUser.get(userId) ?? 0;
      return {
        userId,
        displayName: actorMeta.get(userId)?.displayName ?? userId,
        value: formatPerHundred(numerator, handCount),
        valueNumerator: numerator,
        valueDenominator: handCount,
        handCount,
      } satisfies Omit<LeaderboardSnapshotEntry, "rank">;
    })
    .filter((row) => row.handCount > 0)
    .sort((a, b) => {
      const aRatio = a.valueDenominator ? a.valueNumerator / a.valueDenominator : 0;
      const bRatio = b.valueDenominator ? b.valueNumerator / b.valueDenominator : 0;
      if (bRatio !== aRatio) return bRatio - aRatio;
      if (b.handCount !== a.handCount) return b.handCount - a.handCount;
      return compareUserTieBreak(actorMeta, a.userId, b.userId);
    });

  return withRanks(rows);
}

async function computeStreaks(
  prisma: PrismaClient,
  period: LeaderboardPeriod,
  asOf: Date,
  mode: "win" | "loss",
): Promise<LeaderboardSnapshotEntry[]> {
  const since = getSinceForPeriod(period, asOf);
  const handWhere = handWhereForPeriod(since, asOf);

  const deltas = await prisma.handPlayer.findMany({
    where: {
      hand: handWhere,
    },
    select: {
      handId: true,
      startingStackCents: true,
      endingStackCents: true,
      hand: { select: { endedAt: true } },
      player: { select: { userId: true, externalId: true, displayName: true, createdAt: true } },
    },
  });

  const byUser = new Map<string, Array<{ net: number; endedAt: number; handId: string }>>();
  const actorMeta = new Map<string, ActorMetadata>();
  for (const row of deltas) {
    if (!row.handId || row.endingStackCents == null) continue;
    const endedAt = row.hand?.endedAt?.getTime() ?? 0;
    const actorId = resolveActorId({
      userId: row.player.userId,
      externalId: row.player.externalId,
      displayName: row.player.displayName,
    });
    if (!byUser.has(actorId)) byUser.set(actorId, []);
    byUser.get(actorId)!.push({
      net: row.endingStackCents - row.startingStackCents,
      endedAt,
      handId: row.handId,
    });
    if (!actorMeta.has(actorId)) {
      actorMeta.set(actorId, {
        displayName: row.player.displayName || actorId,
        createdAtMs: row.player.createdAt.getTime(),
      });
    }
  }

  const userIds = Array.from(byUser.keys());

  const rows: Omit<LeaderboardSnapshotEntry, "rank">[] = [];
  for (const userId of userIds) {
    const full = byUser.get(userId) ?? [];
    const sequence = full
      .sort((a, b) => a.endedAt - b.endedAt || a.handId.localeCompare(b.handId))
      .slice(-STREAK_MAX_HANDS_PER_ACTOR);
    let currentStreak = 0;
    for (let i = sequence.length - 1; i >= 0; i--) {
      const isMatch = mode === "win" ? sequence[i].net > 0 : sequence[i].net < 0;
      if (isMatch) currentStreak += 1;
      else break;
    }
    rows.push({
      userId,
      displayName: actorMeta.get(userId)?.displayName ?? userId,
      value: `${currentStreak} hands`,
      valueNumerator: currentStreak,
      valueDenominator: null,
      handCount: full.length,
    });
  }

  rows.sort((a, b) => {
    if (b.valueNumerator !== a.valueNumerator) return b.valueNumerator - a.valueNumerator;
    if (b.handCount !== a.handCount) return b.handCount - a.handCount;
    return compareUserTieBreak(actorMeta, a.userId, b.userId);
  });
  return withRanks(rows);
}

async function computeVpip(
  prisma: PrismaClient,
  period: LeaderboardPeriod,
  asOf: Date,
  mode: "tight" | "loose",
): Promise<LeaderboardSnapshotEntry[]> {
  const since = getSinceForPeriod(period, asOf);
  const handWhere = handWhereForPeriod(since, asOf);

  const participationRows = await prisma.handPlayer.findMany({
    where: {
      hand: handWhere,
    },
    select: {
      handId: true,
      player: { select: { userId: true, externalId: true, displayName: true, createdAt: true } },
    },
  });

  const handsByUser = new Map<string, Set<string>>();
  const actorMeta = new Map<string, ActorMetadata>();
  for (const row of participationRows) {
    const actorId = resolveActorId({
      userId: row.player.userId,
      externalId: row.player.externalId,
      displayName: row.player.displayName,
    });
    if (!handsByUser.has(actorId)) handsByUser.set(actorId, new Set());
    handsByUser.get(actorId)!.add(row.handId);
    if (!actorMeta.has(actorId)) {
      actorMeta.set(actorId, {
        displayName: row.player.displayName || actorId,
        createdAtMs: row.player.createdAt.getTime(),
      });
    }
  }

  const vpipRows = await prisma.handAction.findMany({
    where: {
      hand: handWhere,
      street: "PREFLOP",
      action: { in: ["CALL", "BET", "RAISE", "ALL_IN", "POST_SB", "POST_BB"] },
    },
    select: {
      handId: true,
      action: true,
      player: { select: { userId: true, externalId: true, displayName: true, createdAt: true } },
    },
  });

  const vpipByUser = new Map<string, Set<string>>();
  for (const row of vpipRows) {
    if (row.action === "POST_SB" || row.action === "POST_BB") continue;
    const actorId = resolveActorId({
      userId: row.player.userId,
      externalId: row.player.externalId,
      displayName: row.player.displayName,
    });
    if (!vpipByUser.has(actorId)) vpipByUser.set(actorId, new Set());
    vpipByUser.get(actorId)!.add(row.handId);
    if (!actorMeta.has(actorId)) {
      actorMeta.set(actorId, {
        displayName: row.player.displayName || actorId,
        createdAtMs: row.player.createdAt.getTime(),
      });
    }
  }

  const userIds = Array.from(handsByUser.keys());
  const rows = userIds
    .map((userId) => {
      const handCount = handsByUser.get(userId)?.size ?? 0;
      const numerator = vpipByUser.get(userId)?.size ?? 0;
      return {
        userId,
        displayName: actorMeta.get(userId)?.displayName ?? userId,
        value: `${(handCount > 0 ? (numerator / handCount) * 100 : 0).toFixed(1)}% VPIP`,
        valueNumerator: numerator,
        valueDenominator: handCount,
        handCount,
      } satisfies Omit<LeaderboardSnapshotEntry, "rank">;
    })
    .filter((row) => row.handCount >= VPIP_MIN_SAMPLES)
    .sort((a, b) => {
      const aRatio = a.valueDenominator ? a.valueNumerator / a.valueDenominator : 0;
      const bRatio = b.valueDenominator ? b.valueNumerator / b.valueDenominator : 0;
      if (mode === "tight") {
        if (aRatio !== bRatio) return aRatio - bRatio;
      } else {
        if (bRatio !== aRatio) return bRatio - aRatio;
      }
      if (b.handCount !== a.handCount) return b.handCount - a.handCount;
      return compareUserTieBreak(actorMeta, a.userId, b.userId);
    });

  return withRanks(rows);
}

export async function recomputeLeaderboardSafely() {
  const computedAt = LeaderboardAggregationService.floorToHourUtc(new Date());
  const startedAt = Date.now();
  const { failureCount } = await LeaderboardAggregationService.recomputeHourlySnapshots(computedAt);
  const durationMs = Date.now() - startedAt;
  if (failureCount > 0) {
    logger.error({ computedAt, durationMs, failureCount }, "Leaderboard recompute had category failures");
  } else {
    logger.info({ computedAt, durationMs }, "Leaderboard snapshots recomputed");
  }
}
