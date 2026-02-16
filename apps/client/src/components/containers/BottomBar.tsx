import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { bottomBarScreens, type ScreenKey } from "@/registry/screen.registry";
import { tablePath, lobbyPath } from "@/lib/nav";
import { storeRegistry } from "@/registry/store.registry";

type Tab = Extract<ScreenKey, "lobby" | "table" | "settings">;

export function BottomBar({ active }: { active: Tab }) {
  const router = useRouter();
  const openTableIds = storeRegistry.use.tables((s) => s.openTableIds);
  const activeTableId = storeRegistry.use.tables((s) => s.activeTableId);
  const targetTableId = activeTableId ?? openTableIds[0];
  const tableHref = targetTableId ? tablePath(targetTableId) : lobbyPath();

  const item = (key: Tab, label: string, href: string) => (
    <Pressable key={key} onPress={() => router.push(href)} className="flex-1 ui-touch items-center justify-center">
      <Text variant={active === key ? "body" : "muted"}>{label}</Text>
    </Pressable>
  );

  return (
    <View className="ui-row ui-bottom-bar">
      {bottomBarScreens.map((screen) => {
        const key = screen.key as Tab;
        const targetPath = screen.key === "table" ? tableHref : screen.path;
        return item(key, screen.bottomBarLabel ?? screen.title, targetPath);
      })}
    </View>
  );
}
