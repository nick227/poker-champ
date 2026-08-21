import { getPrisma } from "@poker-champ/db";
import { matchMaker } from "@colyseus/core";
import {
  GIFT_CATALOG_BY_KEY,
  SIDE_BET_CATALOG_BY_KEY,
  sideBetMinStakeCents,
  sideBetMaxStakeCents,
} from "@poker-champ/realtime-contract";
import type { SideBetCatalogEntry } from "@poker-champ/realtime-contract";
import { CashierService } from "./CashierService.js";
import { evaluateSideBetCondition, type ResolvableHand } from "./SideBetConditionEvaluator.js";

export const GIFT_CATALOG_KEY_UNKNOWN = "GIFT_CATALOG_KEY_UNKNOWN" as const;
export const GIFT_RECIPIENT_INVALID = "GIFT_RECIPIENT_INVALID" as const;
export const SIDE_BET_CATALOG_KEY_UNKNOWN = "SIDE_BET_CATALOG_KEY_UNKNOWN" as const;
export const SIDE_BET_RECIPIENT_INVALID = "SIDE_BET_RECIPIENT_INVALID" as const;
export const SIDE_BET_STAKE_OUT_OF_BOUNDS = "SIDE_BET_STAKE_OUT_OF_BOUNDS" as const;
export const SIDE_BET_SUBJECTS_REQUIRED = "SIDE_BET_SUBJECTS_REQUIRED" as const;
export const SIDE_BET_SUBJECTS_INVALID = "SIDE_BET_SUBJECTS_INVALID" as const;
export const SIDE_BET_PREDICTION_REQUIRED = "SIDE_BET_PREDICTION_REQUIRED" as const;
export const SIDE_BET_PREDICTION_INVALID = "SIDE_BET_PREDICTION_INVALID" as const;
export const SIDE_BET_NO_ACTIVE_HAND = "SIDE_BET_NO_ACTIVE_HAND" as const;
/** Shared by sendGift and proposeSideBet — §10's combined per-pair daily cap. */
export const DAILY_PAIR_CAP_EXCEEDED = "DAILY_PAIR_CAP_EXCEEDED" as const;
export const SIDE_BET_NOT_FOUND = "SIDE_BET_NOT_FOUND" as const;
export const SIDE_BET_NOT_INITIATOR = "SIDE_BET_NOT_INITIATOR" as const;
export const SIDE_BET_NOT_RECIPIENT = "SIDE_BET_NOT_RECIPIENT" as const;

/** §12: 20 BB-equivalent per ordered pair per rolling 24h, gifts + side-bet stakes combined. */
const DAILY_PAIR_CAP_BIG_BLINDS = 20;
/** Same floor rationale as SIDE_BET_MAX_STAKE_FLOOR_CENTS — on a penny-stakes table, 20 BB is
 *  only 20 cents, which would make the per-pair cap bind before a single $1-ceiling side bet
 *  could ever be placed. Floored so the two limits stay coherent with each other. */
const DAILY_PAIR_CAP_FLOOR_CENTS = 500;

export type SendGiftResult = {
  interactionId: string;
  senderUserId: string;
  recipientUserId: string;
  catalogKey: string;
  stakeCents: number;
  createdAt: number;
};

export type SideBetOfferResult = {
  interactionId: string;
  initiatorUserId: string;
  recipientUserId: string;
  catalogKey: string;
  stakeCents: number;
  subjectUserIds?: [string, string];
  predictedSubjectUserId?: string;
  expiresAt: number;
};

export type SideBetUpdateResult = {
  interactionId: string;
  status: "ACTIVE" | "DECLINED" | "CANCELLED" | "EXPIRED";
  initiatorId: string;
  recipientId: string;
};

export type SideBetResolvedResult = {
  interactionId: string;
  catalogKey: string;
  winnerId: string | null;
  payoutCents: number;
  resolutionNote: string;
};

type SideBetMetadata = {
  subjectUserIds?: [string, string];
  predictedSubjectUserId?: string;
};

function readMetadata(row: { metadata: unknown }): SideBetMetadata {
  const m = row.metadata;
  if (!m || typeof m !== "object") return {};
  return m as SideBetMetadata;
}

function exposureCentsForRole(
  role: "initiator" | "recipient",
  stakeCents: number,
  entry: SideBetCatalogEntry | undefined,
): number {
  if (role === "initiator") return stakeCents;
  const multiplier = entry?.payoutMultiplier ?? 1;
  return Math.round(stakeCents * multiplier);
}

export class PlayerInteractionService {
  /**
   * §10's per-pair daily notional ceiling: gifts + side-bet stakes summed, per ordered pair,
   * per rolling 24h — shared by sendGift and proposeSideBet (one check, both call sites),
   * consistent with the "one authorization path" claim in the design doc's §2. PlayerInteraction
   * is already the unified audit trail for both features, so this is a single query against one
   * table rather than needing to reconcile two separate ledgers.
   */
  private static async assertWithinDailyPairCap(params: {
    initiatorId: string;
    recipientId: string;
    additionalStakeCents: number;
    bigBlindCents: number;
    tx: any;
  }): Promise<void> {
    const { initiatorId, recipientId, additionalStakeCents, bigBlindCents, tx } = params;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await tx.playerInteraction.findMany({
      where: {
        initiatorId,
        recipientId,
        createdAt: { gte: since },
        status: { notIn: ["DECLINED", "CANCELLED", "EXPIRED", "VOIDED"] },
      },
      select: { stakeCents: true },
    });
    const priorTotal = rows.reduce((sum: number, r: { stakeCents: number }) => sum + r.stakeCents, 0);
    const capCents = Math.max(DAILY_PAIR_CAP_BIG_BLINDS * bigBlindCents, DAILY_PAIR_CAP_FLOOR_CENTS);
    if (priorTotal + additionalStakeCents > capCents) {
      throw new Error(DAILY_PAIR_CAP_EXCEEDED);
    }
  }

  /**
   * Sends a Gift: one atomic debit(initiator) + credit(recipient) + a terminal
   * PlayerInteraction row, all in a single transaction so there is never a
   * moment where the sender's chips have left but the recipient hasn't
   * received them (docs/GIFTS_AND_SIDE_BETS_DESIGN.md §5.2).
   */
  static async sendGift(params: {
    initiatorId: string;
    recipientId: string;
    tableId: string;
    catalogKey: string;
    bigBlindCents: number;
    clientRequestId: string;
  }): Promise<SendGiftResult> {
    const { initiatorId, recipientId, tableId, catalogKey, bigBlindCents, clientRequestId } = params;

    const entry = GIFT_CATALOG_BY_KEY.get(catalogKey);
    if (!entry) {
      throw new Error(GIFT_CATALOG_KEY_UNKNOWN);
    }
    if (initiatorId === recipientId) {
      throw new Error(GIFT_RECIPIENT_INVALID);
    }

    const prisma = getPrisma();
    // Deterministic (not random) so a duplicate message carrying the same client-generated
    // clientRequestId — a UI double-tap that slipped past the client-side guard, or a naive
    // network retry — resolves to the same interaction instead of charging twice.
    const interactionId = `gift_${initiatorId}_${clientRequestId}`;
    const costCents = entry.costCents;

    const existing = await prisma.playerInteraction.findUnique({ where: { id: interactionId } });
    if (existing) {
      return {
        interactionId: existing.id,
        senderUserId: existing.initiatorId,
        recipientUserId: existing.recipientId,
        catalogKey: existing.catalogKey,
        stakeCents: existing.stakeCents,
        createdAt: existing.createdAt.getTime(),
      };
    }

    const createdAt = new Date();

    try {
      await prisma.$transaction(async (tx: any) => {
        await PlayerInteractionService.assertWithinDailyPairCap({
          initiatorId,
          recipientId,
          additionalStakeCents: costCents,
          bigBlindCents,
          tx,
        });

        await CashierService.debitUser({
          userId: initiatorId,
          amountCents: costCents,
          type: "GIFT_SENT",
          externalRef: `gift:${interactionId}:debit`,
          tx,
        });
        await CashierService.creditUser({
          userId: recipientId,
          amountCents: costCents,
          type: "GIFT_RECEIVED",
          externalRef: `gift:${interactionId}:credit`,
          tx,
        });

        await tx.playerInteraction.create({
          data: {
            id: interactionId,
            type: "GIFT",
            status: "COMPLETED",
            catalogKey,
            tableId,
            initiatorId,
            recipientId,
            stakeCents: costCents,
            payoutCents: costCents,
            externalRef: `gift:${interactionId}`,
            respondedAt: createdAt,
            resolvedAt: createdAt,
          },
        });
      });
    } catch (err: unknown) {
      // A true concurrent duplicate (two in-flight requests racing on the same
      // clientRequestId) can lose the findUnique check above and hit the unique
      // constraint on `id` here instead. Treat that the same as the pre-check hit —
      // idempotent, not an error — rather than surfacing a raw DB error to the sender.
      if (err && typeof err === "object" && "code" in err && (err as { code?: unknown }).code === "P2002") {
        const existingAfterRace = await prisma.playerInteraction.findUnique({ where: { id: interactionId } });
        if (existingAfterRace) {
          return {
            interactionId: existingAfterRace.id,
            senderUserId: existingAfterRace.initiatorId,
            recipientUserId: existingAfterRace.recipientId,
            catalogKey: existingAfterRace.catalogKey,
            stakeCents: existingAfterRace.stakeCents,
            createdAt: existingAfterRace.createdAt.getTime(),
          };
        }
      }
      throw err;
    }

    return {
      interactionId,
      senderUserId: initiatorId,
      recipientUserId: recipientId,
      catalogKey,
      stakeCents: costCents,
      createdAt: createdAt.getTime(),
    };
  }

  /**
   * Proposes a Side Bet. No chip movement — proposeSideBet only ever authorizes a hold
   * (checked via CashierService.getSpendableCents) and creates a PENDING PlayerInteraction
   * row (docs/GIFTS_AND_SIDE_BETS_DESIGN.md §5.2). `handId`/`bigBlindCents` are the caller's
   * (the room's) live view of the table — this service is DB-only and has no access to live
   * game state, so it trusts the router to have already confirmed a hand is in progress and,
   * for catalog entries with subjects, that both subjects are actually dealt into it (§5.1) —
   * this method only re-validates the parts that are pure data logic (bounds, disjointness).
   */
  static async proposeSideBet(params: {
    initiatorId: string;
    recipientId: string;
    tableId: string;
    handId: string;
    catalogKey: string;
    stakeCents: number;
    bigBlindCents: number;
    subjectUserIds?: [string, string];
    predictedSubjectUserId?: string;
    clientRequestId: string;
  }): Promise<SideBetOfferResult> {
    const {
      initiatorId,
      recipientId,
      tableId,
      handId,
      catalogKey,
      stakeCents,
      bigBlindCents,
      subjectUserIds,
      predictedSubjectUserId,
      clientRequestId,
    } = params;

    const entry = SIDE_BET_CATALOG_BY_KEY.get(catalogKey);
    if (!entry) throw new Error(SIDE_BET_CATALOG_KEY_UNKNOWN);
    if (initiatorId === recipientId) throw new Error(SIDE_BET_RECIPIENT_INVALID);

    const minCents = sideBetMinStakeCents(entry, bigBlindCents);
    const maxCents = sideBetMaxStakeCents(entry, bigBlindCents);
    if (stakeCents < minCents || stakeCents > maxCents) throw new Error(SIDE_BET_STAKE_OUT_OF_BOUNDS);

    if (entry.requiresSubjects) {
      if (!subjectUserIds) throw new Error(SIDE_BET_SUBJECTS_REQUIRED);
      const [a, b] = subjectUserIds;
      const bettors = new Set([initiatorId, recipientId]);
      if (a === b || bettors.has(a) || bettors.has(b)) throw new Error(SIDE_BET_SUBJECTS_INVALID);
    }
    if (entry.requiresPrediction) {
      if (!predictedSubjectUserId) throw new Error(SIDE_BET_PREDICTION_REQUIRED);
      if (!subjectUserIds || !subjectUserIds.includes(predictedSubjectUserId)) {
        throw new Error(SIDE_BET_PREDICTION_INVALID);
      }
    }

    const prisma = getPrisma();
    // Same deterministic-id idempotency trick as sendGift — see its comment.
    const interactionId = `sidebet_${initiatorId}_${clientRequestId}`;
    const expiresAt = new Date(Date.now() + 30_000); // §12: 30s offer TTL

    const existing = await prisma.playerInteraction.findUnique({ where: { id: interactionId } });
    if (existing) return PlayerInteractionService.toOfferResult(existing, expiresAt);

    try {
      await prisma.$transaction(async (tx: any) => {
        await PlayerInteractionService.assertWithinDailyPairCap({
          initiatorId,
          recipientId,
          additionalStakeCents: stakeCents,
          bigBlindCents,
          tx,
        });

        const spendable = await CashierService.getSpendableCents(initiatorId, tx);
        if (spendable < stakeCents) throw new Error("INSUFFICIENT_BANKROLL");

        await tx.playerInteraction.create({
          data: {
            id: interactionId,
            type: "SIDE_BET",
            status: "PENDING",
            catalogKey,
            tableId,
            handId,
            initiatorId,
            recipientId,
            stakeCents,
            metadata: { subjectUserIds, predictedSubjectUserId },
            externalRef: `sidebet:${interactionId}`,
            expiresAt,
          },
        });
      });
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && (err as { code?: unknown }).code === "P2002") {
        const existingAfterRace = await prisma.playerInteraction.findUnique({ where: { id: interactionId } });
        if (existingAfterRace) return PlayerInteractionService.toOfferResult(existingAfterRace, expiresAt);
      }
      throw err;
    }

    return {
      interactionId,
      initiatorUserId: initiatorId,
      recipientUserId: recipientId,
      catalogKey,
      stakeCents,
      subjectUserIds,
      predictedSubjectUserId,
      expiresAt: expiresAt.getTime(),
    };
  }

  private static toOfferResult(
    row: { id: string; initiatorId: string; recipientId: string; catalogKey: string; stakeCents: number; expiresAt: Date | null; metadata: unknown },
    fallbackExpiresAt: Date,
  ): SideBetOfferResult {
    const meta = readMetadata(row);
    return {
      interactionId: row.id,
      initiatorUserId: row.initiatorId,
      recipientUserId: row.recipientId,
      catalogKey: row.catalogKey,
      stakeCents: row.stakeCents,
      subjectUserIds: meta.subjectUserIds,
      predictedSubjectUserId: meta.predictedSubjectUserId,
      expiresAt: row.expiresAt?.getTime() ?? fallbackExpiresAt.getTime(),
    };
  }

  /**
   * Accept/decline a Side Bet offer. CAS-guarded on `status = 'PENDING'` — the guard itself
   * is the idempotency mechanism here (§5.2), not a per-clientRequestId table: unlike
   * proposeSideBet (which creates a new row per request), there is only ever one legitimate
   * response to a given interactionId, ever. A retry — same or even a different
   * clientRequestId — that arrives after the first response already landed just sees
   * status !== 'PENDING' and returns the current state instead of erroring or double-applying.
   */
  static async respondSideBet(params: {
    interactionId: string;
    recipientId: string;
    accept: boolean;
    bigBlindCents: number;
    /** Not load-bearing for correctness — the `status = 'PENDING'` CAS guard below already
     *  makes this idempotent on its own (there is only ever one legitimate response to a given
     *  interactionId, ever). Accepted anyway for wire-contract consistency with propose/cancel
     *  and so it's captured in the audit trail (metadata) alongside the response. */
    clientRequestId: string;
    /** Injected by the router, which owns live game-state access this service deliberately
     *  doesn't have (see proposeSideBet's docblock). Re-checks that both subjects are still
     *  dealt into the target hand at accept time, not just at propose time — hand state can
     *  change in between (docs/GIFTS_AND_SIDE_BETS_DESIGN.md §5.1). Only called when the
     *  catalog entry actually has subjects. */
    validateSubjectsStillDealtIn?: (subjectUserIds: [string, string]) => boolean;
  }): Promise<SideBetUpdateResult & { alreadyProcessed?: boolean }> {
    const { interactionId, recipientId, accept, bigBlindCents, clientRequestId, validateSubjectsStillDealtIn } = params;
    const prisma = getPrisma();

    const row = await prisma.playerInteraction.findUnique({ where: { id: interactionId } });
    if (!row || row.type !== "SIDE_BET") throw new Error(SIDE_BET_NOT_FOUND);
    if (row.recipientId !== recipientId) throw new Error(SIDE_BET_NOT_RECIPIENT);
    const ids = { initiatorId: row.initiatorId, recipientId: row.recipientId };
    if (row.status !== "PENDING") {
      return { interactionId, status: row.status as SideBetUpdateResult["status"], ...ids, alreadyProcessed: true };
    }

    const metadataWithResponse = { ...readMetadata(row), responseRequestId: clientRequestId };

    if (!accept) {
      const result = await prisma.playerInteraction.updateMany({
        where: { id: interactionId, status: "PENDING" },
        data: { status: "DECLINED", respondedAt: new Date(), metadata: metadataWithResponse },
      });
      if (result.count === 0) {
        const current = await prisma.playerInteraction.findUniqueOrThrow({ where: { id: interactionId } });
        return { interactionId, status: current.status as SideBetUpdateResult["status"], ...ids, alreadyProcessed: true };
      }
      return { interactionId, status: "DECLINED", ...ids };
    }

    // Re-validate the stake bound against the table's CURRENT big blind — a tournament's
    // blinds can increase between propose and accept (§7). Out-of-bounds at accept time
    // voids the offer outright rather than leaving it dangling for the TTL to clean up.
    const entry = SIDE_BET_CATALOG_BY_KEY.get(row.catalogKey);
    const maxCents = entry ? sideBetMaxStakeCents(entry, bigBlindCents) : 0;
    const minCents = entry ? sideBetMinStakeCents(entry, bigBlindCents) : 0;
    const voidOffer = async (reason: string): Promise<boolean> => {
      const voided = await prisma.playerInteraction.updateMany({
        where: { id: interactionId, status: "PENDING" },
        data: { status: "VOIDED", respondedAt: new Date(), resolvedAt: new Date(), metadata: { ...readMetadata(row), voidReason: reason } },
      });
      return voided.count > 0;
    };
    if (!entry || row.stakeCents > maxCents || row.stakeCents < minCents) {
      if (!(await voidOffer("Stake no longer within bounds at accept time."))) {
        const current = await prisma.playerInteraction.findUniqueOrThrow({ where: { id: interactionId } });
        return { interactionId, status: current.status as SideBetUpdateResult["status"], ...ids, alreadyProcessed: true };
      }
      throw new Error(SIDE_BET_STAKE_OUT_OF_BOUNDS);
    }

    // Re-check subject eligibility at accept time too, not just propose time (§5.1) — a subject
    // could have folded out of eligibility, or the hand itself could have ended, in the window
    // between propose and accept.
    const subjectUserIds = readMetadata(row).subjectUserIds;
    if (entry.requiresSubjects && subjectUserIds && validateSubjectsStillDealtIn && !validateSubjectsStillDealtIn(subjectUserIds)) {
      if (!(await voidOffer("Subjects no longer dealt into the hand at accept time."))) {
        const current = await prisma.playerInteraction.findUniqueOrThrow({ where: { id: interactionId } });
        return { interactionId, status: current.status as SideBetUpdateResult["status"], ...ids, alreadyProcessed: true };
      }
      throw new Error(SIDE_BET_SUBJECTS_INVALID);
    }

    const exposure = exposureCentsForRole("recipient", row.stakeCents, entry);
    const spendable = await CashierService.getSpendableCents(recipientId);
    if (spendable < exposure) throw new Error("INSUFFICIENT_BANKROLL");

    const result = await prisma.playerInteraction.updateMany({
      where: { id: interactionId, status: "PENDING" },
      data: { status: "ACTIVE", respondedAt: new Date(), metadata: metadataWithResponse },
    });
    if (result.count === 0) {
      const current = await prisma.playerInteraction.findUniqueOrThrow({ where: { id: interactionId } });
      return { interactionId, status: current.status as SideBetUpdateResult["status"], ...ids, alreadyProcessed: true };
    }
    return { interactionId, status: "ACTIVE", ...ids };
  }

  /**
   * Whether a still-PENDING offer's recipient can actually cover their exposure right now —
   * the same check respondSideBet's accept branch makes, but exposed standalone so a caller
   * (the bot auto-response trigger) can decide accept vs. decline BEFORE attempting the accept,
   * instead of attempting it and having it fail into a silently-expiring PENDING offer.
   */
  static async getRecipientAffordability(
    interactionId: string,
    recipientId: string,
  ): Promise<{ canAfford: boolean; exposureCents: number; spendableCents: number } | null> {
    const prisma = getPrisma();
    const row = await prisma.playerInteraction.findUnique({ where: { id: interactionId } });
    if (!row || row.type !== "SIDE_BET" || row.recipientId !== recipientId) return null;
    const entry = SIDE_BET_CATALOG_BY_KEY.get(row.catalogKey);
    const exposureCents = exposureCentsForRole("recipient", row.stakeCents, entry);
    const spendableCents = await CashierService.getSpendableCents(recipientId);
    return { canAfford: spendableCents >= exposureCents, exposureCents, spendableCents };
  }

  /**
   * Cancel a still-PENDING offer. Initiator-only, same CAS-as-idempotency shape as
   * respondSideBet — clientRequestId is accepted for wire-contract consistency and audit
   * capture, but the `status = 'PENDING'` guard is what actually makes this idempotent.
   */
  static async cancelSideBet(params: {
    interactionId: string;
    initiatorId: string;
    clientRequestId: string;
  }): Promise<SideBetUpdateResult & { alreadyProcessed?: boolean }> {
    const { interactionId, initiatorId, clientRequestId } = params;
    const prisma = getPrisma();

    const row = await prisma.playerInteraction.findUnique({ where: { id: interactionId } });
    if (!row || row.type !== "SIDE_BET") throw new Error(SIDE_BET_NOT_FOUND);
    if (row.initiatorId !== initiatorId) throw new Error(SIDE_BET_NOT_INITIATOR);
    const ids = { initiatorId: row.initiatorId, recipientId: row.recipientId };
    if (row.status !== "PENDING") {
      return { interactionId, status: row.status as SideBetUpdateResult["status"], ...ids, alreadyProcessed: true };
    }

    const result = await prisma.playerInteraction.updateMany({
      where: { id: interactionId, status: "PENDING" },
      data: {
        status: "CANCELLED",
        respondedAt: new Date(),
        metadata: { ...readMetadata(row), responseRequestId: clientRequestId },
      },
    });
    if (result.count === 0) {
      const current = await prisma.playerInteraction.findUniqueOrThrow({ where: { id: interactionId } });
      return { interactionId, status: current.status as SideBetUpdateResult["status"], ...ids, alreadyProcessed: true };
    }
    return { interactionId, status: "CANCELLED", ...ids };
  }

  /**
   * Resolves every ACTIVE side bet scoped to one hand, against that hand's persisted
   * Hand/HandPlayer/HandAction/HandPayout rows (§5.3) — the same data hand-history already
   * writes, so this needs no live game-state access. Idempotent: the CAS guard on
   * `status = 'ACTIVE'` makes a second call for the same handId a no-op (§5.4), which is what
   * lets both the hand-end hook (fast path) and the reconciliation sweep (durability backstop)
   * safely call this exact function.
   */
  static async resolveSideBetsForHand(tableId: string, handId: string): Promise<SideBetResolvedResult[]> {
    const prisma = getPrisma();

    const active = await prisma.playerInteraction.findMany({
      where: { tableId, handId, type: "SIDE_BET", status: "ACTIVE" },
    });
    if (active.length === 0) return [];

    const handRow = await prisma.hand.findUnique({
      where: { id: handId },
      include: {
        players: { include: { player: { select: { id: true, userId: true } } } },
        actions: { select: { playerId: true, actionIndex: true, street: true, action: true } },
        payouts: { select: { playerId: true, amountCents: true } },
      },
    });
    if (!handRow || !handRow.endedAt) {
      // Hand hasn't actually ended yet in persisted data — nothing to resolve against.
      // Only reachable via the reconciliation sweep racing a still-in-progress hand; the
      // hand-end hook only ever calls this after endHand() has committed.
      return [];
    }

    const resolvableHand: ResolvableHand = {
      board: Array.isArray(handRow.boardJson) ? (handRow.boardJson as string[]) : [],
      reason: handRow.reason,
      players: handRow.players.map((p: any) => ({
        playerId: p.playerId,
        userId: p.player.userId,
        holeCards: Array.isArray(p.holeCardsJson) ? (p.holeCardsJson as string[]) : null,
        endingStackCents: p.endingStackCents,
        startingStackCents: p.startingStackCents,
      })),
      actions: handRow.actions,
      payouts: handRow.payouts,
    };

    const results: SideBetResolvedResult[] = [];

    for (const row of active) {
      const entry = SIDE_BET_CATALOG_BY_KEY.get(row.catalogKey);
      if (!entry) {
        await PlayerInteractionService.voidActiveBet(row.id, "Catalog entry no longer exists.");
        results.push({ interactionId: row.id, catalogKey: row.catalogKey, winnerId: null, payoutCents: 0, resolutionNote: "Catalog entry no longer exists." });
        continue;
      }

      const meta = readMetadata(row);
      const evaluation = evaluateSideBetCondition(entry.condition, resolvableHand, meta.subjectUserIds, meta.predictedSubjectUserId);

      if (evaluation.outcome === "VOID") {
        await PlayerInteractionService.voidActiveBet(row.id, evaluation.note);
        results.push({ interactionId: row.id, catalogKey: row.catalogKey, winnerId: null, payoutCents: 0, resolutionNote: evaluation.note });
        continue;
      }

      const winnerId = evaluation.initiatorWins ? row.initiatorId : row.recipientId;
      const loserId = evaluation.initiatorWins ? row.recipientId : row.initiatorId;
      const loserRole: "initiator" | "recipient" = evaluation.initiatorWins ? "recipient" : "initiator";
      const payoutCents = exposureCentsForRole(loserRole, row.stakeCents, entry);

      const settled = await prisma.$transaction(async (tx: any) => {
        const guard = await tx.playerInteraction.updateMany({
          where: { id: row.id, status: "ACTIVE" },
          data: { status: "COMPLETED", winnerId, payoutCents, resolvedAt: new Date() },
        });
        if (guard.count === 0) return false; // already resolved by a concurrent sweep/hook — no-op

        await CashierService.debitUser({
          userId: loserId,
          amountCents: payoutCents,
          type: "SIDE_BET_PAYOUT",
          externalRef: `sidebet:${row.id}:debit`,
          tx,
        });
        await CashierService.creditUser({
          userId: winnerId,
          amountCents: payoutCents,
          type: "SIDE_BET_PAYOUT",
          externalRef: `sidebet:${row.id}:credit`,
          tx,
        });
        return true;
      });

      if (settled) {
        results.push({ interactionId: row.id, catalogKey: row.catalogKey, winnerId, payoutCents, resolutionNote: evaluation.note });
      }
    }

    if (results.length > 0) {
      await PlayerInteractionService.broadcastResolved(tableId, results);
    }
    return results;
  }

  /**
   * Best-effort cross-process notification (docs/GIFTS_AND_SIDE_BETS_DESIGN.md §5.4) — resolution
   * itself is already durable in the DB by the time this runs; this only tells a currently-live
   * room to tell its connected clients. Called from both the hand-end hook (same room, still
   * routed through remoteRoomCall for one code path) and the reconciliation sweep (no room
   * reference at all — has to look the table up by id). A quiet no-op if the table isn't
   * currently live, or if the notification itself fails for any reason.
   */
  private static async broadcastResolved(tableId: string, results: SideBetResolvedResult[]): Promise<void> {
    try {
      const rooms = (await matchMaker.query({ name: "poker" })) as {
        roomId?: string;
        metadata?: { tableId?: string };
      }[];
      const room = rooms.find((r) => r.metadata?.tableId === tableId);
      if (!room?.roomId) return;
      await matchMaker.remoteRoomCall(room.roomId, "broadcastSideBetResolved" as never, [results], 5000);
    } catch {
      // Notification is a nicety, not a correctness guarantee — swallow and move on.
    }
  }

  private static async voidActiveBet(interactionId: string, note: string): Promise<void> {
    const prisma = getPrisma();
    await prisma.playerInteraction.updateMany({
      where: { id: interactionId, status: "ACTIVE" },
      data: { status: "VOIDED", resolvedAt: new Date(), metadata: { voidReason: note } },
    });
  }

  /**
   * Force-voids every ACTIVE side bet tied to a hand that's being voided instead of
   * resolved normally (manually/admin today; a future automated stuck-hand recovery
   * path later). Deliberately not a ledger operation: side-bet stakes only move at
   * resolution time (see resolveSideBetsForHand's CashierService calls above), so an
   * ACTIVE bet has never debited anyone — voiding it is a pure status flip, nothing to
   * refund. Not wired into any caller yet; there is no admin void-hand action today.
   */
  static async voidSideBetsForHand(tableId: string, handId: string, reason: string): Promise<number> {
    const prisma = getPrisma();
    const result = await prisma.playerInteraction.updateMany({
      where: { tableId, handId, type: "SIDE_BET", status: "ACTIVE" },
      data: { status: "VOIDED", resolvedAt: new Date(), metadata: { voidReason: reason } },
    });
    return result.count;
  }

  /**
   * The reconciliation sweep (§5.4): finds PlayerInteraction rows still PENDING past their
   * expiresAt (auto-expire, since nothing was ever held for a PENDING offer — no refund
   * needed, just a status flip) and ACTIVE rows whose target hand has already ended in
   * persisted data (the crash-recovery backstop for resolveSideBetsForHand). Called on a
   * timer from apps/server/src/index.ts, not tied to any specific room process.
   */
  static async sweepStaleSideBets(): Promise<{ expired: number; resolved: number }> {
    const prisma = getPrisma();
    const now = new Date();

    const expiredResult = await prisma.playerInteraction.updateMany({
      where: { type: "SIDE_BET", status: "PENDING", expiresAt: { lt: now } },
      data: { status: "EXPIRED", respondedAt: now },
    });

    const staleActive = await prisma.playerInteraction.findMany({
      where: { type: "SIDE_BET", status: "ACTIVE" },
      select: { tableId: true, handId: true },
      distinct: ["tableId", "handId"],
    });

    let resolved = 0;
    for (const { tableId, handId } of staleActive) {
      if (!handId) continue;
      const hand = await prisma.hand.findUnique({ where: { id: handId }, select: { endedAt: true } });
      if (!hand?.endedAt) continue; // still in progress — the hand-end hook will get it
      const results = await PlayerInteractionService.resolveSideBetsForHand(tableId, handId);
      resolved += results.length;
    }

    return { expired: expiredResult.count, resolved };
  }
}
