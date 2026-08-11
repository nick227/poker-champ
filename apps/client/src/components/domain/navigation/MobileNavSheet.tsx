import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/base/Text";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { bottomBarScreens } from "@/registry/screen.registry";
import { useAuthStore } from "@/stores/auth.store";
import { getSettingsTargetPath } from "@/lib/authNavigation";
import type { PrimaryNavKey } from "@/lib/primaryNav";

type Props = {
  visible: boolean;
  onClose: () => void;
  active: PrimaryNavKey | null;
};

/**
 * Mobile primary navigation. Replaces the old persistent BottomBar: same screen
 * list as NavRail (desktop), surfaced on demand via the header's hamburger button.
 */
export function MobileNavSheet({ visible, onClose, active }: Props) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);

  return (
    <ModalSheet visible={visible} onClose={onClose} title="Menu" heightFraction={0.5}>
      <View className="ui-stack-2">
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
              onPress={() => {
                onClose();
                router.push(targetPath);
              }}
              className={`ui-touch flex-row items-center gap-3 rounded-2 px-3 py-3 ${
                isActive
                  ? "bg-panel-elevated border-l-2 border-gold"
                  : "border-l-2 border-transparent"
              }`}
              accessibilityRole="link"
              accessibilityLabel={screen.bottomBarLabel ?? screen.title}
              accessibilityState={{ selected: isActive }}
            >
              <Ionicons
                name={screen.icon || "home"}
                size={22}
                className={isActive ? "text-gold" : "text-muted"}
              />
              <Text
                variant={isActive ? "body" : "muted"}
                className={isActive ? "text-gold font-semibold" : ""}
              >
                {screen.bottomBarLabel ?? screen.title}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ModalSheet>
  );
}
