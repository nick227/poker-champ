import type { Tournament } from "@prisma/client";

type TournamentWithCount = Tournament & {
  _count?: { registrations: number };
};

export type TournamentApiResponse = Tournament & {
  registeredCount: number;
  isRegistered?: boolean;
};

export function toTournamentResponse(
  tournament: TournamentWithCount,
  opts?: { isRegistered?: boolean },
): TournamentApiResponse {
  const { _count, ...rest } = tournament;
  return {
    ...rest,
    registeredCount: _count?.registrations ?? 0,
    ...(opts?.isRegistered === undefined ? {} : { isRegistered: opts.isRegistered }),
  };
}
