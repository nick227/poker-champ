import type { Tournament } from "@prisma/client";
import type { TournamentPlayerStatus } from "./tournament-player-status.js";
import { lateRegCloseMs } from "./tournament-schedule.js";

type TournamentWithCount = Tournament & {
  _count?: { registrations: number };
  /** MTT proposal Phase 5: table rows, when the caller included them, to surface a multi-table
   *  indicator. Omitted from the response entirely for the common N=1/never-provisioned case. */
  tables?: { status: string }[];
};

export type TournamentApiResponse = Tournament & {
  registeredCount: number;
  lateRegClosesAt: string;
  isRegistered?: boolean;
  isCreator?: boolean;
  tableLive?: boolean;
  playerStatus?: TournamentPlayerStatus;
  tableCount?: number;
  openTableCount?: number;
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
  const { _count, tables, ...rest } = tournament;
  return {
    ...rest,
    lateRegClosesAt: new Date(lateRegCloseMs(tournament)).toISOString(),
    registeredCount: _count?.registrations ?? 0,
    ...(tables && tables.length > 1
      ? { tableCount: tables.length, openTableCount: tables.filter((t) => t.status === "OPEN").length }
      : {}),
    ...(opts?.isRegistered === undefined ? {} : { isRegistered: opts.isRegistered }),
    ...(opts?.isCreator === undefined ? {} : { isCreator: opts.isCreator }),
    ...(opts?.tableLive === undefined ? {} : { tableLive: opts.tableLive }),
    ...(opts?.playerStatus === undefined ? {} : { playerStatus: opts.playerStatus }),
  };
}
