import type { Tournament } from "@prisma/client";

type TournamentWithCount = Tournament & {
  _count?: { registrations: number };
};

export type TournamentApiResponse = Tournament & { registeredCount: number };

export function toTournamentResponse(tournament: TournamentWithCount): TournamentApiResponse {
  const { _count, ...rest } = tournament;
  return {
    ...rest,
    registeredCount: _count?.registrations ?? 0,
  };
}
