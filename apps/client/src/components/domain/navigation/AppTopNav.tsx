import { View } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "@/components/base/Button";
import { Surface } from "@/components/containers/Surface";
import { useAuthStore } from "@/stores/auth.store";
import { getSettingsTargetPath } from "@/lib/authNavigation";
import { ProfilePill } from "./ProfilePill";

export type AppTopNavProps = {
  username: string;
  amountCents: number;
  onlineLabel: string;
  onPressOnline?: () => void;
  avatarUrl?: string | null;
};

export function AppTopNav({
  username,
  amountCents,
  onlineLabel,
  onPressOnline,
  avatarUrl,
}: AppTopNavProps) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  const settingsTargetPath = getSettingsTargetPath({ hydrated, token });

  return (
    <Surface styleId="surface.nav.top">
      <View className="ui-row items-center ui-inline-3 flex-1">
        <ProfilePill
          username={username}
          amountCents={amountCents}
          avatarUrl={avatarUrl}
          onPress={() => router.push(settingsTargetPath)}
        />
      </View>

      <Button
        variant="link"
        title={onlineLabel}
        onPress={onPressOnline ?? (() => {})}
        disabled={!onPressOnline}
      />
    </Surface>
  );
}

