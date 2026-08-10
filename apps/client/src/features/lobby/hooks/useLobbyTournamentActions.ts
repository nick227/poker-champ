import { useCallback, useState } from "react";
import { useRouter } from "expo-router";
import {
  confirmTournamentRegister,
  dispatchTournamentCta,
  executeTournamentTableJoin,
} from "@/lib/tournament.actions";
import { mapTournamentApiError } from "@/lib/tournament.utils";
import { loginPathWithNext, tournamentPath } from "@/lib/nav";
import { serviceRegistry } from "@/registry/service.registry";
import type { TournamentSummary } from "@/services/tournaments.types";
import { useToastStore } from "@/stores/toast.store";

type OpenTable = (
  tableId: string,
  opts?: { buyInCents?: number },
) => void;

type Params = {
  authenticated: boolean;
  openTable: OpenTable;
  setRoomForTable: (tableId: string, roomId: string) => void;
  refreshTournaments: (opts?: { background?: boolean }) => Promise<unknown> | void;
  refreshBankroll: () => Promise<unknown> | void;
  tournamentList: TournamentSummary[];
  authToken: string | null;
};

/** Tournament CTA / modal handlers for the lobby screen. */
export function useLobbyTournamentActions({
  authenticated,
  openTable,
  setRoomForTable,
  refreshTournaments,
  refreshBankroll,
  tournamentList,
  authToken,
}: Params) {
  const router = useRouter();
  const showToast = useToastStore((s) => s.show);
  const [registerModalTournament, setRegisterModalTournament] =
    useState<TournamentSummary | null>(null);
  const [joinModalTournament, setJoinModalTournament] =
    useState<TournamentSummary | null>(null);
  const [registerBusy, setRegisterBusy] = useState(false);
  const [standingsModal, setStandingsModal] = useState<{
    id: string;
    name: string;
    status: string;
  } | null>(null);
  const [tournamentActionBusy, setTournamentActionBusy] = useState(false);
  const [tournamentCreateModalVisible, setTournamentCreateModalVisible] = useState(false);
  const [tournamentDeleteId, setTournamentDeleteId] = useState<string | null>(null);

  const handleCreateTournament = useCallback(() => {
    if (!authToken) {
      router.push(loginPathWithNext("/lobby"));
      return;
    }
    setTournamentCreateModalVisible(true);
  }, [authToken, router]);

  const handleDeleteTournament = useCallback(
    async (tournament: TournamentSummary) => {
      setTournamentDeleteId(tournament.id);
      const res = await serviceRegistry.post.tournamentCancel(tournament.id);
      if (!res.ok) {
        showToast(
          mapTournamentApiError(res.error.message || "Delete failed", res.error.code),
          "danger",
        );
        setTournamentDeleteId(null);
        return;
      }
      showToast("Tournament deleted", "success");
      void refreshTournaments();
      setTournamentDeleteId(null);
    },
    [refreshTournaments, showToast],
  );

  const handleOpenTournamentDetail = useCallback(
    (tournament: TournamentSummary) => {
      router.push(tournamentPath(tournament.id));
    },
    [router],
  );

  const handleTournamentAction = useCallback(
    (tournament: TournamentSummary) => {
      dispatchTournamentCta(tournament, {
        router,
        authenticated,
        actionInFlight: tournamentActionBusy || registerBusy,
        setActionInFlight: setTournamentActionBusy,
        showToast,
        onRequestRegister: setRegisterModalTournament,
        onRequestJoin: setJoinModalTournament,
        onRequestStandings: (t) =>
          setStandingsModal({ id: t.id, name: t.name, status: t.status }),
        openTable,
        setRoomForTable,
        refreshTournament: () => {
          void refreshTournaments();
        },
        refreshBankroll: () => {
          void refreshBankroll();
        },
        loginReturnPath: "/lobby",
        lookupTournament: (id) => tournamentList.find((t) => t.id === id),
        joinSource: "lobby_cta",
      });
    },
    [
      authenticated,
      openTable,
      refreshBankroll,
      refreshTournaments,
      registerBusy,
      router,
      setRoomForTable,
      showToast,
      tournamentActionBusy,
      tournamentList,
    ],
  );

  const handleConfirmTournamentJoin = useCallback(() => {
    if (!joinModalTournament) return;
    setTournamentActionBusy(true);
    void executeTournamentTableJoin(
      joinModalTournament,
      {
        openTable,
        router,
        setRoomForTable,
        showToast,
        refreshTournament: () => {
          void refreshTournaments();
        },
      },
      { source: "join_modal", clickedSnapshot: joinModalTournament },
    )
      .then((ok) => {
        if (ok) setJoinModalTournament(null);
      })
      .finally(() => setTournamentActionBusy(false));
  }, [joinModalTournament, openTable, refreshTournaments, router, setRoomForTable, showToast]);

  const handleConfirmTournamentRegister = useCallback(async () => {
    if (!registerModalTournament) return;
    setRegisterBusy(true);
    const ok = await confirmTournamentRegister(
      registerModalTournament.id,
      {
        showToast,
        refreshTournament: () => {
          void refreshTournaments();
        },
        refreshBankroll: () => {
          void refreshBankroll();
        },
      },
      "lobby_register_modal",
    );
    if (ok) setRegisterModalTournament(null);
    setRegisterBusy(false);
  }, [registerModalTournament, refreshBankroll, refreshTournaments, showToast]);

  return {
    registerModalTournament,
    setRegisterModalTournament,
    joinModalTournament,
    setJoinModalTournament,
    registerBusy,
    standingsModal,
    setStandingsModal,
    tournamentActionBusy,
    tournamentCreateModalVisible,
    setTournamentCreateModalVisible,
    tournamentDeleteId,
    handleCreateTournament,
    handleDeleteTournament,
    handleOpenTournamentDetail,
    handleTournamentAction,
    handleConfirmTournamentJoin,
    handleConfirmTournamentRegister,
  };
}
