import { useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/base/Text";
import { bottomBarScreens } from "@/registry/screen.registry";
import { useAuthStore } from "@/stores/auth.store";
import { getSettingsTargetPath } from "@/lib/authNavigation";
import type { PrimaryNavKey } from "@/lib/primaryNav";

export function NavRail({ active }: { active: PrimaryNavKey | null }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <Pressable
        onPress={() => setExpanded(true)}
        // @ts-expect-error dataSet is used by react-native-web
        dataSet={{ appNavRailReopen: true }}
        className="app-nav-rail-reopen ui-touch items-center justify-center rounded-lg p-2"
        accessibilityRole="button"
        accessibilityLabel="Expand navigation"
      >
        <Ionicons name="menu" size={22} className="text-white" />
      </Pressable>
    );
  }

  return (
    <View
      // @ts-expect-error dataSet is used by react-native-web
      dataSet={{ appNavRail: true }}
      className="app-nav-rail"
    >
      <Pressable
        onPress={() => setExpanded(false)}
        className="ui-touch items-center justify-center self-end rounded-lg p-2 mb-1"
        accessibilityRole="button"
        accessibilityLabel="Collapse navigation"
      >
        <Ionicons name="chevron-back" size={22} className="text-white" />
      </Pressable>

      {bottomBarScreens.map((screen) => {
        const key = screen.key as PrimaryNavKey;
        const targetPath =
          key === "settings" && (!hydrated || !token)
            ? getSettingsTargetPath({ hydrated, token })
            : screen.path;
        const isActive = active === key;
        return (
          <Pressable
            key={key}
            onPress={() => router.push(targetPath)}
            className={`ui-touch flex-row items-center gap-3 rounded-lg px-3 py-3 ${
              isActive ? "bg-panel-elevated" : ""
            }`}
          >
            <Ionicons name={screen.icon || "home"} size={22} className="text-white" />
            <Text variant={isActive ? "body" : "muted"}>
              {screen.bottomBarLabel ?? screen.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
