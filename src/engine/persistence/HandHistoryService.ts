import type { PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";

export class HandHistoryService {
  constructor(private prisma: PrismaClient, private tableId: string) {}

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
    handId: string;
    dealerSeat: number;
    smallBlindCents: number;
    bigBlindCents: number;
    players: { id: string; seat: number; startingStackCents: number; holeCards: string[] }[];
  }) {
    await this.prisma.hand.create({
      data: {
        id: params.handId,
        tableId: this.tableId,
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
    handId: string;
    playerId: string;
    seat: number;
    street: string;
    action: string;
    amountCents: number;
    potBeforeCents: number;
    potAfterCents: number;
    meta?: any;
  }) {
    await this.prisma.handAction.create({
      data: {
        id: nanoid(),
        handId: params.handId,
        playerId: params.playerId,
        seat: params.seat,
        street: params.street,
        action: params.action,
        amountCents: params.amountCents,
        potBeforeCents: params.potBeforeCents,
        potAfterCents: params.potAfterCents,
        metaJson: params.meta ?? undefined,
      },
    });
  }

  async recordPayout(params: { handId: string; playerId: string; amountCents: number }) {
    await this.prisma.handPayout.create({
      data: {
        id: nanoid(),
        handId: params.handId,
        playerId: params.playerId,
        amountCents: params.amountCents,
      },
    });
  }

  async endHand(params: { handId: string; reason: string; board: string[]; endingStacks: { playerId: string; endingStackCents: number }[] }) {
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
