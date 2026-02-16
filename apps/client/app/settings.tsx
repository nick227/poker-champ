import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { Toggle } from "@/components/base/Toggle";
import { useRouter } from "expo-router";
import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/components/domain/lobby/Masthead";
import { ProfileStrip } from "@/components/domain/lobby/ProfileStrip";
import { BottomBar } from "@/components/containers/BottomBar";
import { Button } from "@/components/base/Button";
import { useAuthStore } from "@/stores/auth.store";
import { postAuthLogout } from "@/services/post/auth.post";
import { useProfile } from "@/hooks/useProfile";
import { usePreferencesStore } from "@/stores/preferences.store";

export default function SettingsScreen() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const profile = useProfile();
  const soundEnabled = usePreferencesStore((s) => s.soundEnabled);
  const setSoundEnabled = usePreferencesStore((s) => s.setSoundEnabled);
  const notificationsEnabled = usePreferencesStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = usePreferencesStore((s) => s.setNotificationsEnabled);

  const handleLogout = async () => {
    const token = useAuthStore.getState().token;
    if (token) await postAuthLogout().catch(() => {});
    logout();
    router.replace("/login");
  };

  return (
    <Screen>
      <Masthead />
      <ProfileStrip username={profile.username ?? "Player"} location={profile.location} />
      <View className="flex-1 ui-stack-4 ui-p-4">
        <View className="ui-row justify-between ui-surface-card ui-p-4">
          <Text variant="body">Sound</Text>
          <Toggle value={soundEnabled} onValueChange={setSoundEnabled} />
        </View>
        <View className="ui-row justify-between ui-surface-card ui-p-4">
          <Text variant="body">Notifications</Text>
          <Toggle value={notificationsEnabled} onValueChange={setNotificationsEnabled} />
        </View>
        <Button title="Logout" variant="danger" onPress={handleLogout} />
      </View>
      <BottomBar active="settings" />
    </Screen>
  );
}
