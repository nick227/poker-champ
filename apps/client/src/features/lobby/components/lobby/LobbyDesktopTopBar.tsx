import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { useAuthStore } from "@/stores/auth.store";
import { getSettingsTargetPath } from "@/lib/authNavigation";
import { loginPathWithNext } from "@/lib/nav";
import { ProfilePill } from "@/components/domain/navigation/ProfilePill";

type Props = {
  username: string;
  amountCents: number;
  onlineLabel: string;
  onPressOnline?: () => void;
  avatarUrl?: string | null;
  authenticated: boolean;
};

/** Desktop lobby HUD status strip: presence + account (brand lives in NavRail). */
export function LobbyDesktopTopBar({
  username,
  amountCents,
  onlineLabel,
  onPressOnline,
  avatarUrl,
  authenticated,
}: Props) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  const settingsPath = getSettingsTargetPath({ hydrated, token });

  return (
    <View className="ui-row items-center justify-end border-b border-border pb-3 mb-3 gap-3">
      <Pressable
        onPress={onPressOnline}
        disabled={!onPressOnline}
        className="btn h-9 px-3 items-center justify-center rounded-2"
        style={{ backgroundColor: "transparent" }}
        accessibilityRole="button"
        accessibilityLabel={onlineLabel}
      >
        <View className="ui-row items-center gap-2">
          <View className="h-1.5 w-1.5 rounded-full bg-brand" />
          <Text variant="muted" className="text-[13px] tracking-wide">
            {onlineLabel}
          </Text>
        </View>
      </Pressable>
      {authenticated ? (
        <ProfilePill
          username={username}
          amountCents={amountCents}
          avatarUrl={avatarUrl}
          avatarSize={28}
          onPress={() => router.push(settingsPath)}
        />
      ) : (
        <Button
          title="Login / Register"
          intent="accent"
          size="sm"
          shape="hud"
          minWidth={0}
          onPress={() => router.push(loginPathWithNext("/lobby"))}
        />
      )}
    </View>
  );
}
