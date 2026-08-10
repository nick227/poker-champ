import { ScrollView } from "react-native";
import { JoinedTournamentsSection } from "./JoinedTournamentsSection";
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
};

/** Joined + browse tournament columns for lobby primary pane. */
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
}: Props) {
  return (
    <ScrollView className="flex-1">
      <JoinedTournamentsSection
        tournaments={tournaments}
        authenticated={authenticated}
        actionInFlight={actionInFlight}
        onTournamentAction={onTournamentAction}
        onOpenTournamentDetail={onOpenTournamentDetail}
        onDeleteTournament={onDeleteTournament}
        deleteInFlightId={deleteInFlightId}
        dense={dense}
      />
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
    </ScrollView>
  );
}
