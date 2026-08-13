import { View } from "react-native";
import { useNowMs } from "@/hooks/useNowMs";
import { sliceLobbyPreview } from "../../lobbyPreview";
import { buildLobbyTournamentRows } from "../../lobbyTournamentRows";
import type { LobbySortDir } from "../../lobbyTableSort";
import { sortTournamentLobbyRows, type TournamentSortKey } from "../../tournamentLobbySort";
import type { TournamentSummary } from "@/services/tournaments.types";
import { TournamentListFeedback } from "./TournamentListFeedback";
import { TournamentLobbyList } from "./TournamentLobbyList";

type TournamentsSectionProps = {
  tournaments: TournamentSummary[];
  busy: boolean;
  error: string | null;
  authenticated: boolean;
  actionInFlight?: boolean;
  onTournamentAction: (tournament: TournamentSummary) => void;
  onOpenTournamentDetail: (tournament: TournamentSummary) => void;
  onRetry?: () => void;
  onCreate?: () => void;
  onDeleteTournament?: (tournament: TournamentSummary) => void;
  deleteInFlightId?: string | null;
  dense?: boolean;
  compact?: boolean;
  embedded?: boolean;
  previewLimit?: number;
  sortKey?: TournamentSortKey;
  sortDir?: LobbySortDir;
  onSort?: (key: TournamentSortKey) => void;
};

export function TournamentsSection({
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
  previewLimit,
  sortKey = "startTime",
  sortDir = "asc",
  onSort,
}: TournamentsSectionProps) {
  const nowMs = useNowMs();
  const rows = buildLobbyTournamentRows(tournaments, authenticated);
  const browse = sortTournamentLobbyRows(rows.browse, sortKey, sortDir, nowMs);
  const sliced =
    previewLimit != null
      ? sliceLobbyPreview(rows.pinned, browse, previewLimit)
      : { pinned: rows.pinned, rest: browse };
  const hasRows = sliced.pinned.length > 0 || sliced.rest.length > 0;
  const emptyMessage = authenticated
    ? "No tournaments scheduled yet. Create one or check back soon."
    : "No tournaments scheduled yet. Log in to register when events are posted.";

  return (
    <View className={embedded ? "" : `ui-stack-3 ${dense ? "" : "px-4 pb-2"}`}>
      <TournamentListFeedback
        busy={busy}
        error={error}
        isEmpty={!hasRows}
        emptyMessage={emptyMessage}
        onRetry={onRetry}
        onCreate={authenticated ? onCreate : undefined}
        embedded={embedded}
      />
      {!error && hasRows ? (
        <TournamentLobbyList
          pinnedTournaments={sliced.pinned}
          tournaments={sliced.rest}
          nowMs={nowMs}
          authenticated={authenticated}
          actionInFlight={actionInFlight}
          onOpenDetail={onOpenTournamentDetail}
          onAction={onTournamentAction}
          onDelete={onDeleteTournament}
          deleteInFlightId={deleteInFlightId}
          compact={compact}
          embedded={embedded}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
        />
      ) : null}
    </View>
  );
}
