import { View } from "react-native";
import { LobbyCashListStage } from "../components/lobby/LobbyCashListStage";
import { LobbyPageHeader } from "../components/lobby/LobbyPageHeader";
import { LobbyPageShell } from "../components/lobby/LobbyPageShell";
import { useLobbyScreenModel } from "../hooks/useLobbyScreenModel";
import { usePageBoot } from "@/hooks/usePageBoot";
import { useAuthStore } from "@/stores/auth.store";

export function LobbyCashBrowseScreen() {
  const m = useLobbyScreenModel();
  const authHydrated = useAuthStore((s) => s.hydrated);
  const ready = usePageBoot(authHydrated && !m.busy && !m.tournamentsBusy, {
    busy: m.busy || m.tournamentsBusy,
  });
  const padded = !m.isDesktopWorkspace;
  const compact = !m.isDesktopWorkspace;

  return (
    <LobbyPageShell model={m} ready={ready} scroll={false}>
      <View className={`flex-1 min-h-0 ${padded ? "px-4" : ""}`}>
        <LobbyPageHeader title="Cash games" onNewCashTable={m.openCreateTable} />
        <View className="flex-1 min-h-0 pb-4">
          <LobbyCashListStage
            busy={m.busy}
            error={m.error}
            tables={m.sortedTables}
            pinnedTables={m.pinnedCashTables}
            sortKey={m.sortKey}
            sortDir={m.sortDir}
            onSort={m.handleSort}
            isJoining={m.isJoining}
            onJoin={m.openJoinModal}
            onResume={m.resumeCashTable}
            onWatch={m.watchCashTable}
            onRetry={() => {
              void m.refresh();
            }}
            onCreate={m.openCreateTable}
            scrollable
            compact={compact}
          />
        </View>
      </View>
    </LobbyPageShell>
  );
}
