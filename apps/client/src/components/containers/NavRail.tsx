import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/base/Text";
import { bottomBarScreens } from "@/registry/screen.registry";
import { useAuthStore } from "@/stores/auth.store";
import { useNavRailStore } from "@/stores/navRail.store";
import { getSettingsTargetPath } from "@/lib/authNavigation";
import { APP_NAME } from "@/constants/copy";
import type { PrimaryNavKey } from "@/lib/primaryNav";

export function NavRail({ active }: { active: PrimaryNavKey | null }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  const expanded = useNavRailStore((s) => s.expanded);
  const toggle = useNavRailStore((s) => s.toggle);
  const setExpanded = useNavRailStore((s) => s.setExpanded);

  return (
    <View
      // @ts-expect-error dataSet is used by react-native-web
      dataSet={{ appNavRail: true }}
      className={`app-nav-rail${expanded ? "" : " app-nav-rail--collapsed"}`}
    >
      <View
        className={`ui-row items-center mb-2 ${
          expanded ? "justify-between gap-2 px-1" : "justify-center"
        }`}
      >
        <Pressable
          onPress={() => router.push("/lobby")}
          className={`ui-touch ui-row items-center ${expanded ? "gap-2 flex-1 min-w-0" : "p-2"}`}
          accessibilityRole="link"
          accessibilityLabel={APP_NAME}
        >
          <Text className="text-xl text-text">♠</Text>
          {expanded ? (
            <Text variant="h1" className="text-base" numberOfLines={1}>
              {APP_NAME}
            </Text>
          ) : null}
        </Pressable>
        {expanded ? (
          <Pressable
            onPress={() => setExpanded(false)}
            className="btn ui-touch items-center justify-center p-1.5"
            accessibilityLabel="Collapse navigation"
          >
            <Ionicons name="chevron-back" size={18} className="text-muted" />
          </Pressable>
        ) : null}
      </View>

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
              expanded ? "justify-start" : "justify-center px-2"
            } ${isActive ? "bg-panel-elevated" : ""}`}
            accessibilityLabel={screen.bottomBarLabel ?? screen.title}
          >
            <Ionicons name={screen.icon || "home"} size={22} className="text-white" />
            {expanded ? (
              <Text variant={isActive ? "body" : "muted"}>
                {screen.bottomBarLabel ?? screen.title}
              </Text>
            ) : null}
          </Pressable>
        );
      })}

      <Pressable
        onPress={toggle}
        className="btn app-nav-rail-toggle-hit"
        style={{ backgroundColor: "transparent", borderRadius: 0 }}
        accessibilityLabel={expanded ? "Collapse navigation" : "Expand navigation"}
      />
    </View>
  );
}
