import { getPrisma } from "@poker-champ/db";
import { CashierService } from "../engine/economy/CashierService.js";
import { tournamentBotEntryExternalRef } from "./tournament.constants.js";
import {
  ensureTournamentBotUsers,
  getTournamentBotUserId,
  listTournamentFillBotCatalogIds,
} from "./tournament-bot-users.js";

export function resolveTournamentBotFillCount(params: {
  maxPlayers: number;
  registrationCount: number;
  humanCount: number;
  fillBotCount: number | null;
}): number {
  const openSeats = Math.max(0, params.maxPlayers - params.registrationCount);
  if (openSeats === 0) return 0;

  const defaultTarget = Math.max(0, params.maxPlayers - params.humanCount);
  const requested = params.fillBotCount ?? defaultTarget;
  return Math.min(openSeats, Math.max(0, requested));
}

export async function fillTournamentBotRegistrations(tournamentId: string): Promise<number> {
  const prisma = getPrisma();
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      registrations: { select: { userId: true, isBot: true } },
    },
  });

  if (!tournament?.fillBotsAtStart) return 0;
  if (tournament.status !== "STARTING" && tournament.status !== "LATE_REG") return 0;

  const humanCount = tournament.registrations.filter((reg) => !reg.isBot).length;
  const botCount = resolveTournamentBotFillCount({
    maxPlayers: tournament.maxPlayers,
    registrationCount: tournament.registrations.length,
    humanCount,
    fillBotCount: tournament.fillBotCount,
  });

  if (botCount <= 0) return 0;

  const catalogBotIds = listTournamentFillBotCatalogIds(botCount);
  if (catalogBotIds.length === 0) return 0;

  await ensureTournamentBotUsers(catalogBotIds);

  let added = 0;
  for (const catalogBotId of catalogBotIds) {
    const userId = getTournamentBotUserId(catalogBotId);
    const existing = tournament.registrations.find((reg) => reg.userId === userId);
    if (existing) continue;

    await CashierService.processTournamentBotRegister({
      userId,
      tournamentId,
      externalRef: tournamentBotEntryExternalRef(tournamentId, userId),
    });
    added += 1;
  }

  return added;
}
