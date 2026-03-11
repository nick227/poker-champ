import { Pressable, View } from "react-native";
import type { ReactNode } from "react";
import { useRouter, Link  } from "expo-router";
import { Text } from "@/components/base/Text";
import { Surface } from "@/components/containers/Surface";
import { APP_NAME } from "@/constants/copy";
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";

const LOGO_MARK = "♠";

export function Masthead({ rightAction }: { rightAction?: ReactNode }) {
  const router = useRouter();

  return (
    <Surface styleId="surface.sim.table.topbar">
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
      {rightAction ? <View className="absolute right-3 top-3 z-20">{rightAction}</View> : null}
      
    </Link>
    </Surface>
  );
}
