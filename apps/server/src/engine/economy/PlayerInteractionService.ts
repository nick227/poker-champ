import { getPrisma } from "@poker-champ/db";
import { GIFT_CATALOG_BY_KEY } from "@poker-champ/realtime-contract";
import { CashierService } from "./CashierService.js";

export const GIFT_CATALOG_KEY_UNKNOWN = "GIFT_CATALOG_KEY_UNKNOWN" as const;
export const GIFT_RECIPIENT_INVALID = "GIFT_RECIPIENT_INVALID" as const;

export type SendGiftResult = {
  interactionId: string;
  senderUserId: string;
  recipientUserId: string;
  catalogKey: string;
  stakeCents: number;
  createdAt: number;
};

export class PlayerInteractionService {
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
    clientRequestId: string;
  }): Promise<SendGiftResult> {
    const { initiatorId, recipientId, tableId, catalogKey, clientRequestId } = params;

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
}
