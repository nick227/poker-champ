import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { AvatarImage } from "@/components/base/AvatarImage";
import { formatCents } from "@/lib/format";
import { APP_NAME } from "@/constants/copy";
import { useAuthStore } from "@/stores/auth.store";
import { getSettingsTargetPath } from "@/lib/authNavigation";

const AVATAR = 36;

type Props = {
  username: string;
  amountCents: number;
  onlineLabel: string;
  onPressOnline?: () => void;
  avatarUrl?: string | null;
};

/** Desktop lobby top bar: brand left, utilities right — shared workspace left edge. */
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
  const initial = (username || "P").slice(0, 1).toUpperCase();
  const settingsPath = getSettingsTargetPath({ hydrated, token });

  return (
    <View className="ui-row items-center justify-between border-b border-border pb-3 mb-3">
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
        <Pressable
          onPress={() => router.push(settingsPath)}
          className="ui-row items-center gap-2 rounded-lg border border-border bg-panel px-2 py-1"
        >
          <AvatarImage
            avatarUrl={avatarUrl}
            initial={initial}
            onPress={() => router.push(settingsPath)}
            style={{
              width: AVATAR,
              height: AVATAR,
              borderRadius: AVATAR / 2,
              overflow: "hidden",
              backgroundColor: "#333",
              justifyContent: "center",
              alignItems: "center",
            }}
            imageStyle={{
              width: AVATAR,
              height: AVATAR,
              borderRadius: AVATAR / 2,
            }}
          />
          <View>
            <Text numberOfLines={1} variant="body" className="text-[13px]">
              {username}
            </Text>
            <Text numberOfLines={1} className="text-base font-bold text-text">
              {formatCents(amountCents)}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
