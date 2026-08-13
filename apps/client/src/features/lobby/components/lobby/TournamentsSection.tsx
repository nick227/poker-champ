import { View } from "react-native";
import { useNowMs } from "@/hooks/useNowMs";
import { sliceLobbyPreview } from "../../lobbyPreview";
import { buildLobbyTournamentRows } from "../../lobbyTournamentRows";
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
}: TournamentsSectionProps) {
  const rows = buildLobbyTournamentRows(tournaments, authenticated);
  const sliced =
    previewLimit != null
      ? sliceLobbyPreview(rows.pinned, rows.browse, previewLimit)
      : { pinned: rows.pinned, rest: rows.browse };
  const hasRows = sliced.pinned.length > 0 || sliced.rest.length > 0;
  const nowMs = useNowMs();
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
        />
      ) : null}
    </View>
  );
}
