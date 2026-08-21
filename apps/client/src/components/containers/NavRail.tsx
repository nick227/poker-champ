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

const RAIL_WIDTH_EXPANDED = 220;
const RAIL_WIDTH_COLLAPSED = 52;

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
      dataSet={{ appNavRail: true, collapsed: expanded ? "false" : "true" }}
      className={
        expanded
          ? "app-nav-rail border-r border-border bg-panel/85"
          : "app-nav-rail app-nav-rail-collapsed border-r border-border/40 bg-transparent"
      }
      style={{
        width: expanded ? RAIL_WIDTH_EXPANDED : RAIL_WIDTH_COLLAPSED,
        flexShrink: 0,
        alignSelf: "stretch",
        paddingVertical: 12,
        paddingHorizontal: expanded ? 10 : 4,
      }}
    >
      <View
        className={`ui-row items-center mb-2 ${
          expanded ? "justify-between gap-2 px-1" : "justify-center"
        }`}
      >
        <Pressable
          onPress={() => {
            if (expanded) {
              router.push("/lobby");
              return;
            }
            setExpanded(true);
          }}
          className={`ui-touch ui-row items-center ${expanded ? "gap-2 flex-1 min-w-0" : "p-2"}`}
          accessibilityRole="link"
          accessibilityLabel={expanded ? APP_NAME : `Expand ${APP_NAME} navigation`}
        >
          <Text className="text-xl text-gold">♠</Text>
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
            style={{ backgroundColor: "transparent" }}
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
            className={`ui-touch flex-row items-center gap-3 rounded-2 px-3 py-3 ${
              expanded ? "justify-start" : "justify-center px-2"
            } ${isActive ? "bg-panel-elevated" : "border-transparent"}`}
            accessibilityLabel={screen.bottomBarLabel ?? screen.title}
            accessibilityState={{ selected: isActive }}
          >
            <Ionicons
              name={screen.icon || "home"}
              size={22}
              className={isActive ? "text-gold" : "text-muted"}
            />
            {expanded ? (
              <Text variant={isActive ? "body" : "muted"} className={isActive ? "text-gold font-semibold" : ""}>
                {screen.bottomBarLabel ?? screen.title}
              </Text>
            ) : null}
          </Pressable>
        );
      })}

      <Pressable
        onPress={toggle}
        style={{ flex: 1, minHeight: 24, backgroundColor: "transparent" }}
        accessibilityLabel={expanded ? "Collapse navigation" : "Expand navigation"}
      />
    </View>
  );
}
