import { useCallback, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { Toggle } from "@/components/base/Toggle";
import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/components/domain/lobby/Masthead";
import { AppTopNav } from "@/components/domain/navigation/AppTopNav";
import { BottomBar } from "@/components/containers/BottomBar";
import { Button } from "@/components/base/Button";
import { OnlinePlayersSheet } from "@/components/domain/lobby/OnlinePlayersSheet";
import { useAuthStore } from "@/stores/auth.store";
import { postAuthLogout } from "@/services/post/auth.post";
import { useProfile } from "@/hooks/useProfile";
import { useBankroll } from "@/hooks/useBankroll";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useToastStore } from "@/stores/toast.store";
import { storeRegistry } from "@/registry/store.registry";
import { useLobbyRealtimeBridge } from "@/realtime/lobbyRealtimeBridge";
import { postEconomyDeposit } from "@/services/post/economy.post";
import { ProfileAvatarSection } from "@/components/domain/settings/ProfileAvatarSection";

export default function SettingsScreen() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const { refetch, ...profile } = useProfile();
  const bankroll = useBankroll();
  const soundEnabled = usePreferencesStore((s) => s.soundEnabled);
  const setSoundEnabled = usePreferencesStore((s) => s.setSoundEnabled);
  const notificationsEnabled = usePreferencesStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = usePreferencesStore((s) => s.setNotificationsEnabled);
  const {
    onlineTotal,
    onlinePlayers,
    onlineBusy,
    onlineError,
  } = storeRegistry.use.lobby();
  const { requestOnlinePlayers } = useLobbyRealtimeBridge();
  const [onlineSheetVisible, setOnlineSheetVisible] = useState(false);

  const handleLogout = async () => {
    const token = useAuthStore.getState().token;
    if (token) await postAuthLogout().catch(() => {});
    logout();
    router.replace("/login");
  };

  const openOnlineSheet = useCallback(() => {
    setOnlineSheetVisible(true);
    requestOnlinePlayers();
  }, [requestOnlinePlayers]);

  const onlineLabel = onlineTotal === 1 ? "1 Online" : `${onlineTotal} Online`;

  const handleDeposit = useCallback(async () => {
    try {
      await postEconomyDeposit();
      await bankroll.refresh();
      useToastStore.getState().show("Deposited $1,000", "success");
    } catch (e) {
      useToastStore.getState().show((e as Error).message ?? "Deposit failed", "danger");
    }
  }, [bankroll]);

  return (
    <Screen>
      <Masthead />
      <AppTopNav
        username={profile.username ?? "Player"}
        amountCents={bankroll.cents}
        onlineLabel={onlineLabel}
        onPressOnline={openOnlineSheet}
        avatarUrl={profile.avatarUrl}
      />
      <View className="flex-1 ui-stack-4 ui-p-4">
        <ProfileAvatarSection
          avatarUrl={profile.avatarUrl}
          username={profile.username}
          onUpdate={refetch}
        />
        <View className="ui-row justify-between ui-surface-card ui-p-4">
          <Text variant="body">Sound</Text>
          <Toggle value={soundEnabled} onValueChange={setSoundEnabled} />
        </View>
        <View className="ui-row justify-between ui-surface-card ui-p-4">
          <Text variant="body">Notifications</Text>
          <Toggle value={notificationsEnabled} onValueChange={setNotificationsEnabled} />
        </View>
        <View className="ui-row justify-between items-center ui-surface-card ui-p-4">
          <Text variant="body">Deposit</Text>
          <Button title="Add $1,000" variant="ghost" onPress={handleDeposit} />
        </View>
        <Button title="Logout" variant="danger" onPress={handleLogout} />
      </View>
      <OnlinePlayersSheet
        visible={onlineSheetVisible}
        onClose={() => setOnlineSheetVisible(false)}
        players={onlinePlayers}
        loading={onlineBusy}
        error={onlineError}
        onRefresh={requestOnlinePlayers}
      />
      <BottomBar active="settings" />
    </Screen>
  );
}
