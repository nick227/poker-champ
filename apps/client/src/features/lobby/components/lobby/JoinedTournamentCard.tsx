import { useNowMs } from "@/hooks/useNowMs";
import { formatJoinedTournamentHint, resolveTournamentCta } from "@/lib/tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";
import { TournamentCard } from "./TournamentCard";

type JoinedTournamentCardProps = {
  tournament: TournamentSummary;
  authenticated: boolean;
  actionInFlight?: boolean;
  onOpenDetail: (tournament: TournamentSummary) => void;
  onAction: (tournament: TournamentSummary) => void;
};

export function JoinedTournamentCard({
  tournament,
  authenticated,
  actionInFlight,
  onOpenDetail,
  onAction,
}: JoinedTournamentCardProps) {
  const nowMs = useNowMs();
  const statusHint = formatJoinedTournamentHint(tournament, nowMs);
  const cta = resolveTournamentCta(tournament, { authenticated, nowMs });

  return (
    <TournamentCard
      tournament={tournament}
      authenticated={authenticated}
      actionInFlight={actionInFlight}
      statusHint={statusHint}
      ctaOverride={cta}
      onOpenDetail={onOpenDetail}
      onAction={onAction}
    />
  );
}
