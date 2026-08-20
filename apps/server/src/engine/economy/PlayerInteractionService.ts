import { getPrisma } from "@poker-champ/db";
import { nanoid } from "nanoid";
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
  }): Promise<SendGiftResult> {
    const { initiatorId, recipientId, tableId, catalogKey } = params;

    const entry = GIFT_CATALOG_BY_KEY.get(catalogKey);
    if (!entry) {
      throw new Error(GIFT_CATALOG_KEY_UNKNOWN);
    }
    if (initiatorId === recipientId) {
      throw new Error(GIFT_RECIPIENT_INVALID);
    }

    const prisma = getPrisma();
    const interactionId = nanoid();
    const costCents = entry.costCents;
    const createdAt = new Date();

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
