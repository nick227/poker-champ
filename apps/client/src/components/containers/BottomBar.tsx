import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { bottomBarScreens, type ScreenKey } from "@/registry/screen.registry";
import { Surface } from "@/components/containers/Surface";
import { Ionicons } from '@expo/vector-icons';

type Tab = Extract<ScreenKey, "lobby" | "table" | "lessons" | "leaderboard" | "settings">;

export function BottomBar({ active }: { active: Tab }) {
  const router = useRouter();

  const item = (key: Tab, label: string, href: string, icon?: keyof typeof Ionicons.glyphMap) => (
    <Pressable key={key} onPress={() => router.push(href)} className="flex-1 ui-touch items-center justify-center">
    <Ionicons name={icon || 'home'} size={24} className="text-white" />
      <Text variant={active === key ? "body" : "muted"}>{label}</Text>
    </Pressable>
  );

  return (
    <Surface styleId="surface.nav.bottom">
      {bottomBarScreens.map((screen) => {
        const key = screen.key as Tab;
        const targetPath = screen.path; // No special handling needed since table is not in bottom bar
        return item(key, screen.bottomBarLabel ?? screen.title, targetPath, screen.icon);
      })}
    </Surface>
  );
}
