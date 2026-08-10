import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { Toggle } from "@/components/base/Toggle";
import { Screen } from "@/components/containers/Screen";
import { Button } from "@/components/base/Button";
import { HandHistorySection } from "@/components/domain/history/HandHistorySection";
import { useAuthStore } from "@/stores/auth.store";
import { postAuthLogout } from "@/services/post/auth.post";
import { useProfile } from "@/hooks/useProfile";
import { useBankroll } from "@/hooks/useBankroll";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useToastStore } from "@/stores/toast.store";
import { storeRegistry } from "@/registry/store.registry";
import { postEconomyDeposit } from "@/services/post/economy.post";
import { ProfileAvatarSection } from "@/components/domain/settings/ProfileAvatarSection";
import { AwardsSection } from "@/components/domain/settings/AwardsSection";
import { LoadingScreen } from "@/components/domain/loading/LoadingScreen";
import { getProtectedRouteRedirect } from "@/lib/authNavigation";
import { Input } from "@/components/base/Input";
import { postProfileDisplayName } from "@/services/profile.post";

export default function SettingsScreen() {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const { refetch, ...profile } = useProfile();
  const bankroll = useBankroll();
  const soundEnabled = usePreferencesStore((s) => s.soundEnabled);
  const setSoundEnabled = usePreferencesStore((s) => s.setSoundEnabled);
  const hapticsEnabled = usePreferencesStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = usePreferencesStore((s) => s.setHapticsEnabled);
  const notificationsEnabled = usePreferencesStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = usePreferencesStore((s) => s.setNotificationsEnabled);
  const [profileName, setProfileName] = useState(profile.username ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const redirectPath = getProtectedRouteRedirect({ hydrated, token }, "/settings");

  const handleLogout = async () => {
    if (token) await postAuthLogout().catch(() => {});
    logout();
    router.replace("/login");
  };

  const handleDeposit = useCallback(async () => {
    try {
      await postEconomyDeposit();
      await bankroll.refresh();
      useToastStore.getState().show("Deposited $1,000", "success");
    } catch (e) {
      useToastStore.getState().show((e as Error).message ?? "Deposit failed", "danger");
    }
  }, [bankroll]);

  const handleSaveProfile = useCallback(async () => {
    const nextName = profileName.trim();
    if (!nextName || savingProfile) return;
    setSavingProfile(true);
    try {
      const res = await postProfileDisplayName(nextName);
      if (!res.ok) {
        useToastStore.getState().show(res.error.message ?? "Update failed", "danger");
        return;
      }
      const currentProfile = storeRegistry.profile();
      currentProfile.setProfile({
        ...currentProfile.profile,
        username: nextName,
      });
      await refetch();
      useToastStore.getState().show("Profile updated", "success");
    } catch (e) {
      useToastStore
        .getState()
        .show((e as Error).message ?? "Update failed", "danger");
    } finally {
      setSavingProfile(false);
    }
  }, [profileName, savingProfile, refetch]);

  useEffect(() => {
    setProfileName(profile.username ?? "");
  }, [profile.username]);

  if (!hydrated) return <LoadingScreen />;
  if (redirectPath) return <Redirect href={redirectPath} />;

  return (
    <Screen>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <ProfileAvatarSection
          avatarUrl={profile.avatarUrl}
          username={profile.username}
          onUpdate={refetch}
        />
        <View className="ui-surface-card ui-p-4 ui-stack-2">
          <Text variant="label">Profile</Text>
          <View className="ui-row ui-inline-2 bg-panel-elevated rounded-sm p-2">
            {profile.email ? (
              <Text variant="muted" className="text-sm">{profile.email}</Text>
            ) : null}
          </View>
          <Input
            label="Username"
            value={profileName}
            onChangeText={setProfileName}
            editable={!savingProfile}
          />
          <View className="ui-row justify-end mt-2">
            <Button
              title={savingProfile ? "Saving…" : "Save"}
              variant="ghost"
              onPress={handleSaveProfile}
              disabled={savingProfile || !profileName.trim()}
            />
          </View>
        </View>
        <View className="ui-row justify-between ui-surface-card ui-p-4">
          <Text variant="body">Sound</Text>
          <Toggle value={soundEnabled} onValueChange={setSoundEnabled} />
        </View>
        <View className="ui-row justify-between ui-surface-card ui-p-4">
          <Text variant="body">Haptics</Text>
          <Toggle value={hapticsEnabled} onValueChange={setHapticsEnabled} />
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
    </Screen>
  );
}
