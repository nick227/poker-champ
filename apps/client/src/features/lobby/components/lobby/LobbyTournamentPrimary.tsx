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
  compact?: boolean;
  embedded?: boolean;
  previewLimit?: number;
  scrollable?: boolean;
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
  previewLimit,
  scrollable = false,
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
      compact={compact}
      embedded={embedded}
      previewLimit={previewLimit}
    />
  );

  if (scrollable) {
    return <ScrollView className="flex-1 min-h-0">{body}</ScrollView>;
  }

  return <View className={embedded ? "" : "ui-stack-4"}>{body}</View>;
}
