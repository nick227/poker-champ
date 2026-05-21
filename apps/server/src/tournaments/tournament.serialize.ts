import type { Tournament } from "@prisma/client";

type TournamentWithCount = Tournament & {
  _count?: { registrations: number };
};

export type TournamentApiResponse = Tournament & {
  registeredCount: number;
  isRegistered?: boolean;
  tableLive?: boolean;
};

export function toTournamentResponse(
  tournament: TournamentWithCount,
  opts?: { isRegistered?: boolean; tableLive?: boolean },
): TournamentApiResponse {
  const { _count, ...rest } = tournament;
  return {
    ...rest,
    registeredCount: _count?.registrations ?? 0,
    ...(opts?.isRegistered === undefined ? {} : { isRegistered: opts.isRegistered }),
    ...(opts?.tableLive === undefined ? {} : { tableLive: opts.tableLive }),
  };
}
