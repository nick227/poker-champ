import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { useNowMs } from "@/hooks/useNowMs";
import { selectJoinedTournaments } from "@/lib/tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";
import { TournamentLobbyList } from "./TournamentLobbyList";

type JoinedTournamentsSectionProps = {
  tournaments: TournamentSummary[];
  authenticated: boolean;
  actionInFlight?: boolean;
  onTournamentAction: (tournament: TournamentSummary) => void;
  onOpenTournamentDetail: (tournament: TournamentSummary) => void;
  onDeleteTournament?: (tournament: TournamentSummary) => void;
  deleteInFlightId?: string | null;
  dense?: boolean;
};

export function JoinedTournamentsSection({
  tournaments,
  authenticated,
  actionInFlight,
  onTournamentAction,
  onOpenTournamentDetail,
  onDeleteTournament,
  deleteInFlightId,
  dense = false,
}: JoinedTournamentsSectionProps) {
  const nowMs = useNowMs();
  if (!authenticated) return null;

  const joined = selectJoinedTournaments(tournaments);
  if (joined.length === 0) return null;

  return (
    <View className={`ui-stack-2 pb-3 ${dense ? "" : "px-4"}`}>
      <Text variant="muted" className="text-[11px] tracking-widest uppercase">
        Your tournaments
      </Text>
      <TournamentLobbyList
        tournaments={joined}
        nowMs={nowMs}
        authenticated={authenticated}
        actionInFlight={actionInFlight}
        onOpenDetail={onOpenTournamentDetail}
        onAction={onTournamentAction}
        onDelete={onDeleteTournament}
        deleteInFlightId={deleteInFlightId}
      />
    </View>
  );
}
