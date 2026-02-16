import type { PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";

export class HandHistoryService {
  constructor(private prisma: PrismaClient, private tableId: string) {}

  private assertTableId(tableId: string) {
    if (tableId !== this.tableId) {
      throw new Error(`TABLE_ID_MISMATCH: expected=${this.tableId} got=${tableId}`);
    }
  }

  async ensureTableAndPlayers(players: { id: string; name: string; seat: number }[]) {
    await this.prisma.pokerTable.upsert({
      where: { id: this.tableId },
      create: { id: this.tableId },
      update: {},
    });

    for (const pl of players) {
      await this.prisma.pokerPlayer.upsert({
        where: { id: pl.id },
        create: { id: pl.id, tableId: this.tableId, displayName: pl.name, seat: pl.seat },
        update: { tableId: this.tableId, displayName: pl.name, seat: pl.seat },
      });
    }
  }

  async startHand(params: {
    tableId: string;
    handId: string;
    dealerSeat: number;
    smallBlindCents: number;
    bigBlindCents: number;
    players: { id: string; seat: number; startingStackCents: number; holeCards: string[] }[];
  }) {
    this.assertTableId(params.tableId);
    await this.prisma.hand.create({
      data: {
        id: params.handId,
        tableId: params.tableId,
        dealerSeat: params.dealerSeat,
        smallBlindCents: params.smallBlindCents,
        bigBlindCents: params.bigBlindCents,
        players: {
          createMany: {
            data: params.players.map(p => ({
              id: nanoid(),
              playerId: p.id,
              seat: p.seat,
              startingStackCents: p.startingStackCents,
              holeCardsJson: p.holeCards,
            })),
          },
        },
      },
    });
  }

  async recordAction(params: {
    tableId: string;
    handId: string;
    playerId: string;
    seat: number;
    actionIndex: number;
    street: string;
    action: string;
    amountCents: number;
    potBeforeCents: number;
    potAfterCents: number;
    meta?: any;
  }) {
    this.assertTableId(params.tableId);
    await this.prisma.handAction.create({
      data: {
        id: nanoid(),
        handId: params.handId,
        playerId: params.playerId,
        seat: params.seat,
        actionIndex: params.actionIndex,
        street: params.street,
        action: params.action,
        amountCents: params.amountCents,
        potBeforeCents: params.potBeforeCents,
        potAfterCents: params.potAfterCents,
        metaJson: params.meta ?? undefined,
      },
    });
  }

  async recordPayout(params: {
    tableId: string;
    handId: string;
    playerId: string;
    payoutIndex: number;
    amountCents: number;
  }) {
    this.assertTableId(params.tableId);
    await this.prisma.handPayout.create({
      data: {
        id: nanoid(),
        handId: params.handId,
        playerId: params.playerId,
        payoutIndex: params.payoutIndex,
        amountCents: params.amountCents,
      },
    });
  }

  async endHand(params: {
    tableId: string;
    handId: string;
    reason: string;
    board: string[];
    endingStacks: { playerId: string; endingStackCents: number }[];
  }) {
    this.assertTableId(params.tableId);
    await this.prisma.hand.update({
      where: { id: params.handId },
      data: {
        endedAt: new Date(),
        reason: params.reason,
        boardJson: params.board,
      },
    });

    // update ending stacks on HandPlayer rows (best-effort)
    for (const e of params.endingStacks) {
      await this.prisma.handPlayer.updateMany({
        where: { handId: params.handId, playerId: e.playerId },
        data: { endingStackCents: e.endingStackCents },
      });
    }
  }
}
