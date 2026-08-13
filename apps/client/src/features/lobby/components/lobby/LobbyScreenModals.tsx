import type { InstantGamePresetId } from "./instantGame.presets";
import type { TournamentSummary } from "@/services/tournaments.types";
import type { CreateGameConfig } from "./CreateGameModal";
import { CreateGameModal } from "./CreateGameModal";
import { ChooseTableModal } from "./ChooseTableModal";
import { TournamentCreateModal } from "./TournamentCreateModal";
import { TournamentJoinModal } from "./TournamentJoinModal";
import { TournamentRegisterModal } from "./TournamentRegisterModal";
import { TournamentStandingsModal } from "./TournamentStandingsModal";

type ChooseTable = {
  id: string;
  name: string;
  roomId?: string;
  minBuyInCents: number;
  maxBuyInCents: number;
};

type Standings = { id: string; name: string; status: string } | null;

type Props = {
  createModalVisible: boolean;
  onCloseCreate: () => void;
  onSubmitCreate: (config: CreateGameConfig) => void;
  onInstantStart?: (presetId: InstantGamePresetId) => void;
  instantStartInFlight?: InstantGamePresetId | null;
  tournamentCreateVisible: boolean;
  onCloseTournamentCreate: () => void;
  onTournamentCreated: () => void;
  registerTournament: TournamentSummary | null;
  bankroll: number;
  registerBusy: boolean;
  onCloseRegister: () => void;
  onConfirmRegister: () => void;
  joinTournament: TournamentSummary | null;
  tournamentActionBusy: boolean;
  onCloseJoin: () => void;
  onConfirmJoin: () => void;
  standings: Standings;
  onCloseStandings: () => void;
  chooseTable: ChooseTable | null;
  onCloseChoose: () => void;
  onApplyJoin: (opts: { buyInCents: number }) => void;
};

/** All lobby overlay modals / sheets. */
export function LobbyScreenModals({
  createModalVisible,
  onCloseCreate,
  onSubmitCreate,
  onInstantStart,
  instantStartInFlight,
  tournamentCreateVisible,
  onCloseTournamentCreate,
  onTournamentCreated,
  registerTournament,
  bankroll,
  registerBusy,
  onCloseRegister,
  onConfirmRegister,
  joinTournament,
  tournamentActionBusy,
  onCloseJoin,
  onConfirmJoin,
  standings,
  onCloseStandings,
  chooseTable,
  onCloseChoose,
  onApplyJoin,
}: Props) {
  return (
    <>
      <CreateGameModal
        visible={createModalVisible}
        onClose={onCloseCreate}
        onSubmit={onSubmitCreate}
        onInstantStart={onInstantStart}
        instantStartInFlight={instantStartInFlight}
      />
      <TournamentCreateModal
        visible={tournamentCreateVisible}
        onClose={onCloseTournamentCreate}
        onCreated={onTournamentCreated}
      />
      <TournamentRegisterModal
        visible={registerTournament != null}
        tournament={registerTournament}
        balanceCents={bankroll}
        busy={registerBusy}
        onClose={onCloseRegister}
        onConfirm={onConfirmRegister}
      />
      <TournamentJoinModal
        visible={joinTournament != null}
        tournament={joinTournament}
        busy={tournamentActionBusy}
        onClose={onCloseJoin}
        onConfirm={onConfirmJoin}
      />
      <TournamentStandingsModal
        visible={standings != null}
        tournamentId={standings?.id ?? null}
        tournamentName={standings?.name}
        tournamentStatus={standings?.status}
        onClose={onCloseStandings}
      />
      {chooseTable ? (
        <ChooseTableModal
          visible
          onClose={onCloseChoose}
          balanceCents={bankroll}
          minBuyInCents={chooseTable.minBuyInCents}
          maxBuyInCents={chooseTable.maxBuyInCents}
          onApply={onApplyJoin}
        />
      ) : null}
    </>
  );
}
