import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { bottomBarScreens, type ScreenKey } from "@/registry/screen.registry";
import { Surface } from "@/components/containers/Surface";
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from "@/stores/auth.store";
import { getSettingsTargetPath } from "@/lib/authNavigation";

type Tab = Extract<ScreenKey, "lobby" | "table" | "lessons" | "leaderboard" | "settings">;

export function BottomBar({ active }: { active: Tab }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);

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
        const targetPath =
          key === "settings" && (!hydrated || !token)
            ? getSettingsTargetPath({ hydrated, token })
            : screen.path;
        return item(key, screen.bottomBarLabel ?? screen.title, targetPath, screen.icon);
      })}
    </Surface>
  );
}
