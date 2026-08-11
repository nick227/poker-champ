import { Pressable, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { useAuthStore } from "@/stores/auth.store";
import { useTableChromeMenuStore } from "@/stores/tableChromeMenu.store";
import { getSettingsTargetPath } from "@/lib/authNavigation";
import { loginPathWithNext } from "@/lib/nav";
import { ProfilePill } from "@/components/domain/navigation/ProfilePill";
import { useActiveTableStatus } from "@/hooks/useActiveTableStatus";

type Props = {
  username: string;
  amountCents: number;
  onlineLabel: string;
  onPressOnline?: () => void;
  avatarUrl?: string | null;
  authenticated: boolean;
};

/** Persistent HUD status strip: presence + account (brand lives in NavRail / BottomBar). */
export function WorkspaceStatusBar({
  username,
  amountCents,
  onlineLabel,
  onPressOnline,
  avatarUrl,
  authenticated,
}: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? "/lobby";
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  const settingsPath = getSettingsTargetPath({ hydrated, token });
  const tableStatus = useActiveTableStatus();
  const tableMenu = useTableChromeMenuStore((s) => s.menu);

  const leadingLabel = tableStatus
    ? [tableStatus.tableName, tableStatus.stakesLine].filter(Boolean).join("  ·  ")
    : null;

  return (
    <View className="ui-row items-center justify-between border-b border-border pb-4 gap-3 shrink-0">
      <View className="flex-1 min-w-0 items-start justify-center">
        {leadingLabel ? (
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            allowFontScaling={false}
            className="text-text font-semibold text-[13px] tracking-wide"
          >
            {leadingLabel}
          </Text>
        ) : null}
      </View>
      <View className="ui-row items-center gap-3 shrink-0">
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
            onPress={() => router.push(loginPathWithNext(pathname))}
          />
        )}
        {tableMenu}
      </View>
    </View>
  );
}
