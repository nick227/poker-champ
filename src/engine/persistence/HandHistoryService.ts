import type { PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";
import { logger } from "../../lib/logger.js";

export class HandHistoryService {
  /** externalId (userId / bot_*) -> PokerPlayer.id (cuid) */
  private playerIdMap = new Map<string, string>();

  constructor(
    private prisma: PrismaClient,
    private tableId: string,
    private tableMeta?: { name?: string; creatorId?: string },
  ) {}

  private assertTableId(tableId: string) {
    if (tableId !== this.tableId) {
      throw new Error(`TABLE_ID_MISMATCH: expected=${this.tableId} got=${tableId}`);
    }
  }

  private resolvePlayerId(externalId: string): string {
    const id = this.playerIdMap.get(externalId);
    if (!id) {
      const known = [...this.playerIdMap.keys()].join(", ");
      logger.warn({ externalId, tableId: this.tableId, knownKeys: [...this.playerIdMap.keys()] }, "resolvePlayerId: unknown player — action/payout may not persist");
      throw new Error(`Unknown player ${externalId}. Known: ${known}`);
    }
    return id;
  }

  async ensureTableAndPlayers(players: { id: string; name: string; seat: number; userId?: string | null }[]) {
    if (players.length === 0) {
      throw new Error("ensureTableAndPlayers called with empty roster");
    }
    await this.prisma.pokerTable.upsert({
      where: { id: this.tableId },
      create: {
        id: this.tableId,
        name: this.tableMeta?.name ?? "POC Table",
        creatorId: this.tableMeta?.creatorId,
      },
      update: {},
    });

    this.playerIdMap.clear();
    for (const pl of players) {
      const row = await this.prisma.pokerPlayer.upsert({
        where: {
          tableId_externalId: { tableId: this.tableId, externalId: pl.id },
        },
        create: {
          tableId: this.tableId,
          externalId: pl.id,
          displayName: pl.name,
          seat: pl.seat,
          userId: pl.userId ?? null,
        },
        update: {
          displayName: pl.name,
          seat: pl.seat,
          userId: pl.userId ?? null,
        },
      });
      this.playerIdMap.set(pl.id, row.id);
    }
  }

  /** Drops the player from the in-memory map so this service stops using them for new hands. Call when a player/bot leaves the table. Does NOT delete the PokerPlayer row — HandPlayer/HandAction/HandPayout reference it; deleting would break historical joins. Seat reuse is handled by ensureTableAndPlayers upsert on @@unique([tableId, externalId]). */
  async removePlayer(playerId: string): Promise<void> {
    this.playerIdMap.delete(playerId);
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
            data: params.players.map((p) => ({
              id: nanoid(),
              playerId: this.resolvePlayerId(p.id),
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
    meta?: Record<string, unknown>;
  }) {
    this.assertTableId(params.tableId);
    await this.prisma.handAction.create({
      data: {
        id: nanoid(),
        handId: params.handId,
        playerId: this.resolvePlayerId(params.playerId),
        seat: params.seat,
        actionIndex: params.actionIndex,
        street: params.street,
        action: params.action,
        amountCents: params.amountCents,
        potBeforeCents: params.potBeforeCents,
        potAfterCents: params.potAfterCents,
        metaJson: params.meta as object | undefined,
      },
    });
  }

  /** Record blind post so VPIP can exclude it (position-based, not "first two" by index). */
  async recordBlindAction(params: {
    tableId: string;
    handId: string;
    playerId: string;
    seat: number;
    blindType: "SB" | "BB";
    amountCents: number;
    potBeforeCents: number;
    potAfterCents: number;
    actionIndex: number;
  }) {
    this.assertTableId(params.tableId);
    await this.prisma.handAction.create({
      data: {
        id: nanoid(),
        handId: params.handId,
        playerId: this.resolvePlayerId(params.playerId),
        seat: params.seat,
        actionIndex: params.actionIndex,
        street: "PREFLOP",
        action: params.blindType === "SB" ? "POST_SB" : "POST_BB",
        amountCents: params.amountCents,
        potBeforeCents: params.potBeforeCents,
        potAfterCents: params.potAfterCents,
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
        playerId: this.resolvePlayerId(params.playerId),
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
        where: { handId: params.handId, playerId: this.resolvePlayerId(e.playerId) },
        data: { endingStackCents: e.endingStackCents },
      });
    }
  }

}
