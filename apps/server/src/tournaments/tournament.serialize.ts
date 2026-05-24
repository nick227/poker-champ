import type { Tournament } from "@prisma/client";
import type { TournamentPlayerStatus } from "./tournament-player-status.js";

type TournamentWithCount = Tournament & {
  _count?: { registrations: number };
};

export type TournamentApiResponse = Tournament & {
  registeredCount: number;
  isRegistered?: boolean;
  isCreator?: boolean;
  tableLive?: boolean;
  playerStatus?: TournamentPlayerStatus;
};

export function toTournamentResponse(
  tournament: TournamentWithCount,
  opts?: {
    isRegistered?: boolean;
    isCreator?: boolean;
    tableLive?: boolean;
    playerStatus?: TournamentPlayerStatus;
  },
): TournamentApiResponse {
  const { _count, ...rest } = tournament;
  return {
    ...rest,
    registeredCount: _count?.registrations ?? 0,
    ...(opts?.isRegistered === undefined ? {} : { isRegistered: opts.isRegistered }),
    ...(opts?.isCreator === undefined ? {} : { isCreator: opts.isCreator }),
    ...(opts?.tableLive === undefined ? {} : { tableLive: opts.tableLive }),
    ...(opts?.playerStatus === undefined ? {} : { playerStatus: opts.playerStatus }),
  };
}
