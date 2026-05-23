import { getPrisma } from "@poker-champ/db";
import type { PokerState } from "../state/PokerState.js";
import { CashierService } from "../engine/economy/CashierService.js";
import { logger } from "../lib/logger.js";
import { getBlindLevel } from "./blind-structure.js";
import type { TournamentTableOverlay } from "./tournament-overlay.js";
import { processTournamentFinishResults } from "./tournament-result-processor.js";
import {
  countTournamentSurvivorsWithChips,
  resolveTournamentWinnerUserId,
} from "./tournament-finish-resolution.js";

export type TournamentReconcileContext = {
  tournamentId: string;
  tableId: string;
  roomId: string;
  state: PokerState;
  tableName: string;
  removeBustedPlayer: (userId: string) => Promise<void>;
  onOverlayUpdated: (overlay: TournamentTableOverlay | null) => void;
  onPlayEnded: () => void;
  emitSnapshot?: () => Promise<void>;
};

export { countTournamentSurvivorsWithChips };

export class TournamentTableReconciler {
  async reconcileAfterHand(ctx: TournamentReconcileContext): Promise<void> {
    if (ctx.state.street !== "WAITING") return;

    const prisma = getPrisma();
    const tournament = await prisma.tournament.findUnique({
      where: { id: ctx.tournamentId },
      include: {
        registrations: {
          include: { user: { select: { displayName: true } } },
        },
      },
    });

    if (!tournament || tournament.status !== "RUNNING") {
      if (tournament?.status === "FINISHED" || tournament?.status === "ABANDONED") {
        await processTournamentFinishResults(ctx.tournamentId);
        ctx.onPlayEnded();
      }
      return;
    }

    const level = getBlindLevel(tournament.blindStructureId, tournament.currentLevel);
    ctx.onOverlayUpdated({
      tournamentId: tournament.id,
      status: tournament.status,
      currentLevel: tournament.currentLevel,
      smallBlindCents: level.smallBlindCents,
      bigBlindCents: level.bigBlindCents,
      anteCents: level.anteCents,
      nextLevelAtTs: tournament.nextLevelAt?.getTime() ?? null,
    });

    for (const player of ctx.state.playersById.values()) {
      if (player.stackCents > 0) continue;

      const registration = tournament.registrations.find((r) => r.userId === player.id);
      if (!registration || registration.finishPlace != null) continue;

      const pendingCount = await prisma.tournamentRegistration.count({
        where: { tournamentId: ctx.tournamentId, finishPlace: null },
      });

      await prisma.tournamentRegistration.update({
        where: { tournamentId_userId: { tournamentId: ctx.tournamentId, userId: player.id } },
        data: {
          finishPlace: pendingCount,
          eliminatedAt: new Date(),
        },
      });

      await CashierService.forfeitTournamentTableBalance({
        userId: player.id,
        tableId: ctx.tableId,
        tournamentId: ctx.tournamentId,
        externalRef: `tournament_bust_${ctx.tournamentId}_${player.id}`,
        tableMeta: { name: ctx.tableName },
      });

      await ctx.removeBustedPlayer(player.id);

      logger.info(
        { tournamentId: ctx.tournamentId, userId: player.id, finishPlace: pendingCount },
        "TOURNAMENT_PLAYER_ELIMINATED",
      );
      if (ctx.emitSnapshot) {
        await ctx.emitSnapshot();
      }
    }

    const refreshed = await prisma.tournament.findUnique({
      where: { id: ctx.tournamentId },
      include: { registrations: true },
    });
    if (!refreshed || refreshed.status !== "RUNNING") return;

    const registrationRows = refreshed.registrations.map((r) => ({
      userId: r.userId,
      isBot: r.isBot,
      finishPlace: r.finishPlace,
    }));

    const winnerId = resolveTournamentWinnerUserId(
      ctx.state,
      registrationRows,
    );
    if (winnerId) {
      await prisma.tournamentRegistration.update({
        where: { tournamentId_userId: { tournamentId: ctx.tournamentId, userId: winnerId } },
        data: { finishPlace: 1, eliminatedAt: null },
      });

      await prisma.tournament.update({
        where: { id: ctx.tournamentId },
        data: {
          status: "FINISHED",
          finishedAt: new Date(),
        },
      });

      const humanEntrantCount = await prisma.tournamentRegistration.count({
        where: { tournamentId: ctx.tournamentId, isBot: false },
      });

      await CashierService.processTournamentPayouts({
        tournamentId: ctx.tournamentId,
        humanEntrantCount,
      });

      await processTournamentFinishResults(ctx.tournamentId);

      ctx.onPlayEnded();
      ctx.onOverlayUpdated({
        tournamentId: refreshed.id,
        status: "FINISHED",
        currentLevel: refreshed.currentLevel,
        smallBlindCents: level.smallBlindCents,
        bigBlindCents: level.bigBlindCents,
        anteCents: level.anteCents,
        nextLevelAtTs: null,
      });

      logger.info({ tournamentId: ctx.tournamentId, winnerId, reason: "human_field_closed" }, "TOURNAMENT_FINISHED");
      if (ctx.emitSnapshot) {
        await ctx.emitSnapshot();
      }
    }
  }
}

export const tournamentTableReconciler = new TournamentTableReconciler();
