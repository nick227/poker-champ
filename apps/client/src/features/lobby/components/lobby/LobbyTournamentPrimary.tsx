import { ScrollView, View } from "react-native";
import { TournamentsSection } from "./TournamentsSection";
import type { TournamentSummary } from "@/services/tournaments.types";

type Props = {
  tournaments: TournamentSummary[];
  busy: boolean;
  error: string | null;
  authenticated: boolean;
  actionInFlight: boolean;
  onTournamentAction: (tournament: TournamentSummary) => void;
  onOpenTournamentDetail: (tournament: TournamentSummary) => void;
  onRetry: () => void;
  onCreate: () => void;
  onDeleteTournament?: (tournament: TournamentSummary) => void;
  deleteInFlightId: string | null;
  dense?: boolean;
  scrollable?: boolean;
};

/** Browse tournament lists for lobby primary pane (joined pinned as first rows). */
export function LobbyTournamentPrimary({
  tournaments,
  busy,
  error,
  authenticated,
  actionInFlight,
  onTournamentAction,
  onOpenTournamentDetail,
  onRetry,
  onCreate,
  onDeleteTournament,
  deleteInFlightId,
  dense = false,
  scrollable = true,
}: Props) {
  const body = (
    <TournamentsSection
      tournaments={tournaments}
      busy={busy}
      error={error}
      authenticated={authenticated}
      actionInFlight={actionInFlight}
      onTournamentAction={onTournamentAction}
      onOpenTournamentDetail={onOpenTournamentDetail}
      onRetry={onRetry}
      onCreate={onCreate}
      onDeleteTournament={onDeleteTournament}
      deleteInFlightId={deleteInFlightId}
      dense={dense}
    />
  );

  if (!scrollable) {
    return <View className="ui-stack-4">{body}</View>;
  }

  return <ScrollView className="flex-1">{body}</ScrollView>;
}

export function filterTournamentsByQuery(
  tournaments: TournamentSummary[],
  query: string,
): TournamentSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return tournaments;
  return tournaments.filter((t) => t.name.toLowerCase().includes(q));
}
