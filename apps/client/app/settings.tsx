import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { Toggle } from "@/components/base/Toggle";
import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/components/domain/lobby/Masthead";
import { AppTopNav } from "@/components/domain/navigation/AppTopNav";
import { HeaderStack } from "@/components/containers/HeaderStack";
import { BottomBar } from "@/components/containers/BottomBar";
import { Button } from "@/components/base/Button";
import { OnlinePlayersSheet } from "@/components/domain/lobby/OnlinePlayersSheet";
import { HandHistorySection } from "@/components/domain/history/HandHistorySection";
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
import { AwardsSection } from "@/components/domain/settings/AwardsSection";

export default function SettingsScreen() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
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
      <HeaderStack>
        <Masthead />
        <AppTopNav
          username={profile.username ?? "Player"}
          amountCents={bankroll.cents}
          onlineLabel={onlineLabel}
          onPressOnline={openOnlineSheet}
          avatarUrl={profile.avatarUrl}
        />
      </HeaderStack>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <ProfileAvatarSection
          avatarUrl={profile.avatarUrl}
          username={profile.username}
          onUpdate={refetch}
        />
        <View className="ui-surface-card ui-p-4 ui-stack-2">
          <Text variant="label">Profile</Text>
          <Text variant="body">{profile.username ?? "Player"}</Text>
          {profile.email ? (
            <Text variant="muted" className="text-sm">{profile.email}</Text>
          ) : null}
        </View>
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
        <View className="mt-4">
          <AwardsSection />
        </View>
        <View className="mt-4">
          <Button title="Logout" variant="danger" onPress={handleLogout} />
        </View>
        <View className="mt-4 flex flex-col" style={{ height: 420 }}>
          <Text variant="label" className="mb-2">Hand History</Text>
          <View className="flex-1 min-h-0">
            <HandHistorySection currentUserId={profile.userId ?? ""} />
          </View>
        </View>
      </ScrollView>
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
