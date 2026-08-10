import { useCallback, useState } from "react";
import { useBankroll } from "@/hooks/useBankroll";
import { useProfile } from "@/hooks/useProfile";
import { useLobbyRealtimeBridge } from "@/features/lobby/realtime/lobbyRealtimeBridge";
import { storeRegistry } from "@/registry/store.registry";
import { useAuthStore } from "@/stores/auth.store";

/** Shared model for the persistent workspace status bar + online sheet. */
export function useWorkspaceStatusChrome() {
  const profile = useProfile();
  const { cents: bankroll } = useBankroll();
  const authToken = useAuthStore((s) => s.token);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const authenticated = authHydrated && Boolean(authToken);
  const {
    onlineTotal,
    onlinePlayers,
    onlineBusy,
    onlineError,
  } = storeRegistry.use.lobby();
  const { requestOnlinePlayers } = useLobbyRealtimeBridge();
  const [onlineSheetVisible, setOnlineSheetVisible] = useState(false);

  const openOnlineSheet = useCallback(() => {
    setOnlineSheetVisible(true);
    requestOnlinePlayers();
  }, [requestOnlinePlayers]);

  const onlineLabel = onlineTotal === 1 ? "1 Online" : `${onlineTotal} Online`;

  return {
    username: profile.username ?? "Player",
    amountCents: bankroll,
    onlineLabel,
    onPressOnline: openOnlineSheet,
    avatarUrl: profile.avatarUrl,
    authenticated,
    onlineSheetVisible,
    closeOnlineSheet: () => setOnlineSheetVisible(false),
    onlinePlayers,
    onlineBusy,
    onlineError,
    requestOnlinePlayers,
  };
}
