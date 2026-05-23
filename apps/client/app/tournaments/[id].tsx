import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/components/containers/Screen";
import { Loader } from "@/components/base/Loader";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { Masthead } from "@/features/lobby";
import { AppTopNav } from "@/components/domain/navigation/AppTopNav";
import { HeaderStack } from "@/components/containers/HeaderStack";
import { BottomBar } from "@/components/containers/BottomBar";
import { TournamentJoinModal, TournamentRegisterModal } from "@/features/lobby";
import { TournamentDetailBody } from "@/features/tournaments";
import {
  confirmTournamentRegister,
  executeTournamentTableJoin,
  dispatchTournamentCta,
} from "@/lib/tournament.actions";
import { mapTournamentApiError } from "@/lib/tournament.utils";
import { tournamentPath } from "@/lib/nav";
import { getTournament, getTournamentStandings } from "@/services/get/tournaments.get";
import type { TournamentStandingRow, TournamentSummary } from "@/services/tournaments.types";
import { useAuthStore } from "@/stores/auth.store";
import { useToastStore } from "@/stores/toast.store";
import { useBankroll } from "@/hooks/useBankroll";
import { useProfile } from "@/hooks/useProfile";
import { storeRegistry } from "@/registry/store.registry";

export default function TournamentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tournamentId = typeof id === "string" ? id : "";
  const authToken = useAuthStore((s) => s.token);
  const showToast = useToastStore((s) => s.show);
  const profile = useProfile();
  const { cents: bankroll, refresh: refreshBankroll } = useBankroll();
  const openTable = storeRegistry.use.tables((s) => s.openTable);
  const setRoomForTable = storeRegistry.use.tables((s) => s.setRoomForTable);

  const [tournament, setTournament] = useState<TournamentSummary | null>(null);
  const [loadBusy, setLoadBusy] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState(false);
  const [registerModalTournament, setRegisterModalTournament] = useState<TournamentSummary | null>(null);
  const [joinModalTournament, setJoinModalTournament] = useState<TournamentSummary | null>(null);
  const [registerBusy, setRegisterBusy] = useState(false);
  const [rosterRows, setRosterRows] = useState<TournamentStandingRow[]>([]);
  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const loadTournament = useCallback(async () => {
    if (!tournamentId) {
      setLoadError("Tournament not found");
      setTournament(null);
      setLoadBusy(false);
      return null;
    }
    setLoadError(null);
    try {
      const data = await getTournament(tournamentId);
      setTournament(data);
      return data;
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "Failed to load tournament";
      setTournament(null);
      setLoadError(mapTournamentApiError(raw));
      return null;
    } finally {
      setLoadBusy(false);
    }
  }, [tournamentId]);

  const loadRoster = useCallback(async (t: TournamentSummary) => {
    const needsRoster =
      t.registeredCount > 0 && (t.status === "REGISTERING" || t.status === "FINISHED");
    if (!needsRoster) {
      setRosterRows([]);
      setRosterError(null);
      return;
    }
    setRosterBusy(true);
    setRosterError(null);
    try {
      const rows = await getTournamentStandings(t.id);
      setRosterRows(rows);
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "Failed to load players";
      setRosterRows([]);
      setRosterError(mapTournamentApiError(raw));
    } finally {
      setRosterBusy(false);
    }
  }, []);

  useEffect(() => {
    setLoadBusy(true);
    void loadTournament().then((data) => {
      if (data) void loadRoster(data);
    });
  }, [loadTournament, loadRoster]);

  useEffect(() => {
    if (!tournamentId) return;
    const timer = setInterval(() => {
      void loadTournament().then((data) => {
        if (data) void loadRoster(data);
      });
    }, 30_000);
    return () => clearInterval(timer);
  }, [tournamentId, loadTournament, loadRoster]);

  const refreshAll = useCallback(() => {
    void loadTournament().then((data) => {
      if (data) void loadRoster(data);
    });
  }, [loadTournament, loadRoster]);

  const actionHandlers = useMemo(
    () => ({
      router,
      authenticated: Boolean(authToken),
      actionInFlight: actionInFlight || registerBusy,
      setActionInFlight,
      showToast,
      onRequestRegister: setRegisterModalTournament,
      onRequestJoin: setJoinModalTournament,
      openTable,
      setRoomForTable,
      refreshTournament: refreshAll,
      refreshBankroll: () => { void refreshBankroll(); },
      loginReturnPath: tournamentPath(tournamentId),
      lookupTournament: (lookupId: string) =>
        tournament && tournament.id === lookupId ? tournament : undefined,
      joinSource: "tournament_detail_cta",
    }),
    [
      actionInFlight,
      authToken,
      openTable,
      refreshAll,
      refreshBankroll,
      registerBusy,
      router,
      setRoomForTable,
      showToast,
      tournament,
      tournamentId,
    ],
  );

  const handleConfirmTournamentJoin = useCallback(() => {
    if (!joinModalTournament) return;
    setActionInFlight(true);
    void executeTournamentTableJoin(
      joinModalTournament,
      {
        openTable,
        router,
        setRoomForTable,
        showToast,
        refreshTournament: () => { void loadTournament(); },
      },
      { source: "tournament_detail_join_modal", clickedSnapshot: joinModalTournament },
    )
      .then((ok) => {
        if (ok) setJoinModalTournament(null);
      })
      .finally(() => setActionInFlight(false));
  }, [joinModalTournament, loadTournament, openTable, router, setRoomForTable, showToast]);

  const handlePrimaryAction = useCallback(() => {
    if (!tournament) return;
    dispatchTournamentCta(tournament, actionHandlers);
  }, [tournament, actionHandlers]);

  const handleConfirmRegister = useCallback(async () => {
    if (!registerModalTournament) return;
    setRegisterBusy(true);
    const ok = await confirmTournamentRegister(
      registerModalTournament.id,
      {
        showToast,
        refreshTournament: refreshAll,
        refreshBankroll: () => { void refreshBankroll(); },
      },
      "tournament_detail_register_modal",
    );
    if (ok) setRegisterModalTournament(null);
    setRegisterBusy(false);
  }, [registerModalTournament, refreshAll, refreshBankroll, showToast]);

  return (
    <Screen>
      <HeaderStack>
        <Masthead />
        <AppTopNav
          username={profile.username ?? "Player"}
          onlineLabel="Lobby"
          onPressOnline={() => router.push("/lobby")}
          amountCents={bankroll}
          avatarUrl={profile.avatarUrl}
        />
      </HeaderStack>

      {loadBusy ? (
        <View className="flex-1 ui-center p-6">
          <Loader />
        </View>
      ) : loadError || !tournament ? (
        <View className="flex-1 ui-center ui-stack-4 p-6">
          <Text variant="h2">Tournament unavailable</Text>
          <Text variant="muted">{loadError ?? "This tournament could not be found."}</Text>
          <Button title="Back to lobby" onPress={() => router.push("/lobby")} />
          <Button title="Try again" variant="ghost" onPress={() => { setLoadBusy(true); void loadTournament(); }} />
        </View>
      ) : (
        <ScrollView className="flex-1">
          <TournamentDetailBody
            tournament={tournament}
            authenticated={Boolean(authToken)}
            actionInFlight={actionInFlight || registerBusy}
            rosterRows={rosterRows}
            rosterBusy={rosterBusy}
            rosterError={rosterError}
            onPrimaryAction={handlePrimaryAction}
          />
        </ScrollView>
      )}

      <TournamentRegisterModal
        visible={registerModalTournament != null}
        tournament={registerModalTournament}
        balanceCents={bankroll}
        busy={registerBusy}
        onClose={() => setRegisterModalTournament(null)}
        onConfirm={() => { void handleConfirmRegister(); }}
      />
      <TournamentJoinModal
        visible={joinModalTournament != null}
        tournament={joinModalTournament}
        busy={actionInFlight}
        onClose={() => setJoinModalTournament(null)}
        onConfirm={handleConfirmTournamentJoin}
      />

      <BottomBar active="lobby" />
    </Screen>
  );
}
