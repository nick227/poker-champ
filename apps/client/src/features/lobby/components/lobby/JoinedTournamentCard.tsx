import { formatTournamentSupplementHint } from "@/lib/tournamentLobbyTimer";
import { resolveTournamentCta } from "@/lib/tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";
import { TournamentCard } from "./TournamentCard";

type JoinedTournamentCardProps = {
  tournament: TournamentSummary;
  nowMs: number;
  authenticated: boolean;
  actionInFlight?: boolean;
  onOpenDetail: (tournament: TournamentSummary) => void;
  onAction: (tournament: TournamentSummary) => void;
};

export function JoinedTournamentCard({
  tournament,
  nowMs,
  authenticated,
  actionInFlight,
  onOpenDetail,
  onAction,
}: JoinedTournamentCardProps) {
  const statusHint = formatTournamentSupplementHint(tournament, nowMs) ?? undefined;
  const cta = resolveTournamentCta(tournament, { authenticated, nowMs });

  return (
    <TournamentCard
      tournament={tournament}
      nowMs={nowMs}
      authenticated={authenticated}
      actionInFlight={actionInFlight}
      statusHint={statusHint}
      ctaOverride={cta}
      onOpenDetail={onOpenDetail}
      onAction={onAction}
    />
  );
}
