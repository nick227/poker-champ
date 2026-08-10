import { View } from "react-native";
import type { ReactNode } from "react";
import { useRouter, Link } from "expo-router";
import { Text } from "@/components/base/Text";
import { Surface } from "@/components/containers/Surface";
import { APP_NAME } from "@/constants/copy";
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";
import { useIsDesktopWorkspace } from "@/hooks/useIsDesktopWorkspace";
import { useNavRailStore } from "@/stores/navRail.store";

export function Masthead({ rightAction }: { rightAction?: ReactNode }) {
  const router = useRouter();
  const isDesktopWorkspace = useIsDesktopWorkspace();
  const railExpanded = useNavRailStore((s) => s.expanded);
  const hideBrand = isDesktopWorkspace && railExpanded;

  if (hideBrand && !rightAction) {
    return null;
  }

  return (
    <Surface styleId="surface.sim.table.topbar">
      {hideBrand ? (
        <View className="relative items-center py-2 w-full">
          <View className="absolute right-3 top-3 z-20">{rightAction}</View>
        </View>
      ) : (
        <Link
          href="/lobby"
          className="relative items-center text-center py-2 w-full"
          accessibilityRole="link"
        >
          <View className="ui-row ui-inline-2 ui-center z-10">
            <IconButton
              intent="neutral"
              size="md"
              icon={<Icon name="logo" size={18} />}
              onPress={() => router.push("/lobby")}
            />
            <Text variant="h1">{APP_NAME}</Text>
          </View>
          {rightAction ? (
            <View className="absolute right-3 top-3 z-20">{rightAction}</View>
          ) : null}
        </Link>
      )}
    </Surface>
  );
}
