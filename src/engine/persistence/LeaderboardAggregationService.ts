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
const VPIP_MIN_HANDS = 100;
const SNAPSHOT_WRITE_CHUNK_SIZE = 500;
/** Placeholder value for empty snapshots so we can store computedAt; excluded when reading. */
const EMPTY_SNAPSHOT_SENTINEL_VALUE = "__empty__";

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

  static async recomputeHourlySnapshots(computedAt: Date = LeaderboardAggregationService.floorToHourUtc(new Date())) {
    for (const period of PERIODS) {
      for (const category of CATEGORIES) {
        await LeaderboardAggregationService.recomputeSnapshot(period, category, computedAt);
      }
    }
  }

  static async recomputeSnapshot(period: LeaderboardPeriod, category: LeaderboardCategory, computedAt: Date) {
    const prisma = getPrisma();
    const entries = await computeCategory(category, period, computedAt);

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
              userId: firstUser.id,
              userDisplayName: firstUser.displayName ?? "",
              value: EMPTY_SNAPSHOT_SENTINEL_VALUE,
              valueNumerator: 0,
              valueDenominator: null,
              handCount: 0,
              rank: 0,
              computedAt,
            },
          });
        }
        return;
      }

      const rows = entries.map((entry) => ({
        id: nanoid(),
        period,
        category,
        userId: entry.userId,
        userDisplayName: entry.displayName,
        value: entry.value,
        valueNumerator: entry.valueNumerator,
        valueDenominator: entry.valueDenominator,
        handCount: entry.handCount,
        rank: entry.rank,
        computedAt,
      }));

      for (let i = 0; i < rows.length; i += SNAPSHOT_WRITE_CHUNK_SIZE) {
        await tx.leaderboardSnapshot.createMany({
          data: rows.slice(i, i + SNAPSHOT_WRITE_CHUNK_SIZE),
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
    };
    const [allRows, totalEntries] = await Promise.all([
      prisma.leaderboardSnapshot.findMany({
        where,
        orderBy: { rank: "asc" },
      }),
      prisma.leaderboardSnapshot.count({
        where: { ...where, value: { not: EMPTY_SNAPSHOT_SENTINEL_VALUE } },
      }),
    ]);

    const rows = allRows
      .filter((row) => row.value !== EMPTY_SNAPSHOT_SENTINEL_VALUE)
      .slice(0, input.limit);

    return {
      computedAt: computedAt.toISOString(),
      totalEntries,
      entries: rows.map((row) => ({
        rank: row.rank,
        userId: row.userId,
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

async function getUserMetadata(userIds: string[]): Promise<Map<string, ActorMetadata>> {
  const prisma = getPrisma();
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

function resolveActorId(input: { userId: string | null; externalId: string; displayName?: string | null }): string {
  if (input.userId) return input.userId;
  const botName = input.displayName?.trim().toLowerCase();
  if (botName) return `bot:${botName}`;
  return input.externalId;
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
  category: LeaderboardCategory,
  period: LeaderboardPeriod,
  asOf: Date,
): Promise<LeaderboardSnapshotEntry[]> {
  switch (category) {
    case "biggest_winner":
      return computeProfitLeaders(period, asOf, "winner");
    case "biggest_donor":
      return computeProfitLeaders(period, asOf, "donor");
    case "showdown_sniper":
      return computeShowdownSniper(period, asOf);
    case "all_in_maniac":
      return computeAllInManiac(period, asOf);
    case "ice_cold":
      return computeStreaks(period, asOf, "loss");
    case "heater":
      return computeStreaks(period, asOf, "win");
    case "tight_rock":
      return computeVpip(period, asOf, "tight");
    case "action_junkie":
      return computeVpip(period, asOf, "loose");
    default:
      return [];
  }
}

async function computeProfitLeaders(
  period: LeaderboardPeriod,
  asOf: Date,
  mode: "winner" | "donor",
): Promise<LeaderboardSnapshotEntry[]> {
  const prisma = getPrisma();
  const since = getSinceForPeriod(period, asOf);
  const handWhere = since
    ? { endedAt: { not: null, gte: since, lte: asOf } }
    : { endedAt: { not: null, lte: asOf } };

  const totals = await prisma.balanceTransaction.groupBy({
    by: ["userId"],
    where: {
      handId: { not: null },
      hand: handWhere,
    },
    _sum: { amountCents: true },
  });

  const handRows = await prisma.balanceTransaction.groupBy({
    by: ["userId", "handId"],
    where: {
      handId: { not: null },
      hand: handWhere,
    },
    _sum: { amountCents: true },
  });

  const handCountByUser = new Map<string, number>();
  for (const row of handRows) {
    handCountByUser.set(row.userId, (handCountByUser.get(row.userId) ?? 0) + 1);
  }

  const filtered = totals.filter((row) => {
    const sum = row._sum.amountCents ?? 0;
    return mode === "winner" ? sum > 0 : sum < 0;
  });

  const userMeta = await getUserMetadata(filtered.map((row) => row.userId));

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

  filtered.sort((a, b) => {
    const aValue = a._sum.amountCents ?? 0;
    const bValue = b._sum.amountCents ?? 0;
    if (mode === "winner" && bValue !== aValue) return bValue - aValue;
    if (mode === "donor" && aValue !== bValue) return aValue - bValue;
    const aHands = handCountByUser.get(a.userId) ?? 0;
    const bHands = handCountByUser.get(b.userId) ?? 0;
    if (bHands !== aHands) return bHands - aHands;
    return compareUserTieBreak(userMeta, a.userId, b.userId);
  });

  const rows: Omit<LeaderboardSnapshotEntry, "rank">[] = filtered.map((row) => {
    const value = row._sum.amountCents ?? 0;
    return {
      userId: row.userId,
      displayName: userMeta.get(row.userId)?.displayName ?? row.userId,
      value: formatCurrencyCents(value),
      valueNumerator: value,
      valueDenominator: null,
      handCount: handCountByUser.get(row.userId) ?? 0,
    };
  });

  for (const [actorId, value] of botProfitById.entries()) {
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

async function computeShowdownSniper(period: LeaderboardPeriod, asOf: Date): Promise<LeaderboardSnapshotEntry[]> {
  const prisma = getPrisma();
  const since = getSinceForPeriod(period, asOf);
  const handWhere = since
    ? { endedAt: { not: null, gte: since, lte: asOf }, reason: "SHOWDOWN" }
    : { endedAt: { not: null, lte: asOf }, reason: "SHOWDOWN" };

  const hands = await prisma.hand.findMany({
    where: handWhere,
    select: {
      players: {
        select: {
          player: { select: { userId: true, externalId: true, displayName: true, createdAt: true } },
        },
      },
      payouts: {
        select: {
          amountCents: true,
          player: { select: { userId: true, externalId: true, displayName: true, createdAt: true } },
        },
      },
    },
  });

  const seen = new Map<string, number>();
  const wins = new Map<string, number>();
  const actorMeta = new Map<string, ActorMetadata>();

  for (const hand of hands) {
    const usersInHand = new Set<string>();
    for (const hp of hand.players) {
      const actorId = resolveActorId({
        userId: hp.player.userId,
        externalId: hp.player.externalId,
        displayName: hp.player.displayName,
      });
      usersInHand.add(actorId);
      if (!actorMeta.has(actorId)) {
        actorMeta.set(actorId, {
          displayName: hp.player.displayName || actorId,
          createdAtMs: hp.player.createdAt.getTime(),
        });
      }
    }
    for (const userId of usersInHand) {
      seen.set(userId, (seen.get(userId) ?? 0) + 1);
    }

    const payoutByUser = new Map<string, number>();
    for (const payout of hand.payouts) {
      const actorId = resolveActorId({
        userId: payout.player.userId,
        externalId: payout.player.externalId,
        displayName: payout.player.displayName,
      });
      payoutByUser.set(actorId, (payoutByUser.get(actorId) ?? 0) + payout.amountCents);
      if (!actorMeta.has(actorId)) {
        actorMeta.set(actorId, {
          displayName: payout.player.displayName || actorId,
          createdAtMs: payout.player.createdAt.getTime(),
        });
      }
    }
    for (const [actorId, amount] of payoutByUser.entries()) {
      if (amount > 0) wins.set(actorId, (wins.get(actorId) ?? 0) + 1);
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

async function computeAllInManiac(period: LeaderboardPeriod, asOf: Date): Promise<LeaderboardSnapshotEntry[]> {
  const prisma = getPrisma();
  const since = getSinceForPeriod(period, asOf);
  const handWhere = since
    ? { endedAt: { not: null, gte: since, lte: asOf } }
    : { endedAt: { not: null, lte: asOf } };

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
  period: LeaderboardPeriod,
  asOf: Date,
  mode: "win" | "loss",
): Promise<LeaderboardSnapshotEntry[]> {
  const prisma = getPrisma();
  const since = getSinceForPeriod(period, asOf);
  const handWhere = since
    ? { endedAt: { not: null, gte: since, lte: asOf } }
    : { endedAt: { not: null, lte: asOf } };

  const deltas = await prisma.handPlayer.findMany({
    where: {
      hand: handWhere,
    },
    select: {
      handId: true,
      startingStackCents: true,
      endingStackCents: true,
      player: { select: { userId: true, externalId: true, displayName: true, createdAt: true } },
    },
  });

  const handIds = Array.from(new Set(deltas.map((d) => d.handId).filter((id): id is string => Boolean(id))));
  const hands = await prisma.hand.findMany({
    where: { id: { in: handIds } },
    select: { id: true, endedAt: true },
  });
  const endedAtByHandId = new Map<string, number>();
  for (const hand of hands) {
    endedAtByHandId.set(hand.id, hand.endedAt?.getTime() ?? 0);
  }

  const byUser = new Map<string, Array<{ net: number; endedAt: number }>>();
  const actorMeta = new Map<string, ActorMetadata>();
  for (const row of deltas) {
    if (!row.handId || row.endingStackCents == null) continue;
    const endedAt = endedAtByHandId.get(row.handId) ?? 0;
    const actorId = resolveActorId({
      userId: row.player.userId,
      externalId: row.player.externalId,
      displayName: row.player.displayName,
    });
    if (!byUser.has(actorId)) byUser.set(actorId, []);
    byUser.get(actorId)!.push({
      net: row.endingStackCents - row.startingStackCents,
      endedAt,
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
    const sequence = (byUser.get(userId) ?? []).sort((a, b) => a.endedAt - b.endedAt);
    let current = 0;
    let best = 0;
    for (const hand of sequence) {
      const isMatch = mode === "win" ? hand.net > 0 : hand.net < 0;
      if (isMatch) {
        current += 1;
        if (current > best) best = current;
      } else {
        current = 0;
      }
    }
    rows.push({
      userId,
      displayName: actorMeta.get(userId)?.displayName ?? userId,
      value: `${best} hands`,
      valueNumerator: best,
      valueDenominator: null,
      handCount: sequence.length,
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
  period: LeaderboardPeriod,
  asOf: Date,
  mode: "tight" | "loose",
): Promise<LeaderboardSnapshotEntry[]> {
  const prisma = getPrisma();
  const since = getSinceForPeriod(period, asOf);
  const handWhere = since
    ? { endedAt: { not: null, gte: since, lte: asOf } }
    : { endedAt: { not: null, lte: asOf } };

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
      action: { in: ["CALL", "BET", "RAISE", "ALL_IN"] },
    },
    select: {
      handId: true,
      actionIndex: true,
      player: { select: { userId: true, externalId: true, displayName: true, createdAt: true } },
    },
  });

  const forcedBlindActionKeys = new Set<string>();
  const vpipRowsByHand = new Map<string, typeof vpipRows>();
  for (const row of vpipRows) {
    if (!vpipRowsByHand.has(row.handId)) vpipRowsByHand.set(row.handId, []);
    vpipRowsByHand.get(row.handId)!.push(row);
  }
  for (const [handId, rows] of vpipRowsByHand.entries()) {
    const firstTwo = [...rows].sort((a, b) => a.actionIndex - b.actionIndex).slice(0, 2);
    for (const row of firstTwo) {
      forcedBlindActionKeys.add(`${handId}:${row.actionIndex}`);
    }
  }

  const vpipByUser = new Map<string, Set<string>>();
  for (const row of vpipRows) {
    if (forcedBlindActionKeys.has(`${row.handId}:${row.actionIndex}`)) continue;
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
    .filter((row) => row.handCount >= VPIP_MIN_HANDS)
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
  try {
    await LeaderboardAggregationService.recomputeHourlySnapshots(computedAt);
    logger.info({ computedAt, durationMs: Date.now() - startedAt }, "Leaderboard snapshots recomputed");
  } catch (err) {
    logger.error({ err, computedAt, durationMs: Date.now() - startedAt }, "Leaderboard recompute failed");
  }
}
