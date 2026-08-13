import { View } from "react-native";
import type { LobbySortDir } from "../../lobbyTableSort";
import type { TournamentSortKey } from "../../tournamentLobbySort";
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
  compact?: boolean;
  embedded?: boolean;
  sortKey?: TournamentSortKey;
  sortDir?: LobbySortDir;
  onSort?: (key: TournamentSortKey) => void;
};

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
  compact = false,
  embedded = false,
  sortKey,
  sortDir,
  onSort,
}: Props) {
  return (
    <View className={embedded ? "" : "ui-stack-4"}>
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
        compact={compact}
        embedded={embedded}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
    </View>
  );
}
