import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { APP_NAME } from "@/constants/copy";
import { useAuthStore } from "@/stores/auth.store";
import { useNavRailStore } from "@/stores/navRail.store";
import { getSettingsTargetPath } from "@/lib/authNavigation";
import { ProfilePill } from "@/components/domain/navigation/ProfilePill";

type Props = {
  username: string;
  amountCents: number;
  onlineLabel: string;
  onPressOnline?: () => void;
  avatarUrl?: string | null;
};

/** Desktop lobby top bar: brand left (when rail collapsed), utilities right. */
export function LobbyDesktopTopBar({
  username,
  amountCents,
  onlineLabel,
  onPressOnline,
  avatarUrl,
}: Props) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  const railExpanded = useNavRailStore((s) => s.expanded);
  const settingsPath = getSettingsTargetPath({ hydrated, token });

  return (
    <View className="ui-row items-center justify-between border-b border-border pb-3 mb-3">
      {railExpanded ? (
        <View />
      ) : (
        <Pressable
          onPress={() => router.push("/lobby")}
          className="ui-row items-center gap-2"
          accessibilityRole="link"
        >
          <Text className="text-xl text-text">♠</Text>
          <Text variant="h1" className="text-lg">
            {APP_NAME}
          </Text>
        </Pressable>
      )}

      <View className="ui-row items-center gap-4">
        <Pressable
          onPress={onPressOnline}
          disabled={!onPressOnline}
          className="px-2 py-1"
        >
          <Text variant="muted" className="text-[13px]">
            {onlineLabel}
          </Text>
        </Pressable>
        <ProfilePill
          username={username}
          amountCents={amountCents}
          avatarUrl={avatarUrl}
          onPress={() => router.push(settingsPath)}
        />
      </View>
    </View>
  );
}
