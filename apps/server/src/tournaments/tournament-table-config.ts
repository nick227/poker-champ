import { makeTableId } from "../lobby/TableManager.js";
import type { TableConfig } from "../lobby/types.js";
import { getBlindLevel } from "./blind-structure.js";

export function buildTournamentTableConfig(input: {
  tournamentId: string;
  name: string;
  maxPlayers: number;
  startingStackCents: number;
  blindStructureId: string;
  level?: number;
}): TableConfig {
  const level = input.level ?? 1;
  const blinds = getBlindLevel(input.blindStructureId, level);
  const tableId = makeTableId();
  const now = Date.now();

  return {
    tableId,
    name: input.name,
    maxSeats: input.maxPlayers,
    smallBlindCents: blinds.smallBlindCents,
    bigBlindCents: blinds.bigBlindCents,
    minBuyInCents: input.startingStackCents,
    maxBuyInCents: input.startingStackCents,
    visibility: "PUBLIC",
    showStats: false,
    speed: "normal",
    createdAt: now,
    updatedAt: now,
    creatorName: "Tournament",
    creatorAvatarUrl: null,
    tournamentId: input.tournamentId,
    gameMode: "TOURNAMENT",
  };
}
