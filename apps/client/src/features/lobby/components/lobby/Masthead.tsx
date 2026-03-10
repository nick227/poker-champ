import { Pressable, View } from "react-native";
import type { ReactNode } from "react";
import { useRouter, Link  } from "expo-router";
import { Text } from "@/components/base/Text";
import { APP_NAME } from "@/constants/copy";

const LOGO_MARK = "♠";

export function Masthead({ rightAction }: { rightAction?: ReactNode }) {
  const router = useRouter();

  return (
    <Link
      href="/lobby"
      className="relative items-center text-center py-2 w-full"
      accessibilityRole="link"
    >
      {rightAction ? <View className="absolute right-3 top-3 z-20">{rightAction}</View> : null}
      <View className="ui-row ui-inline-2 ui-center z-10">
        <Text variant="h1" style={{ fontSize: 28 }}>{LOGO_MARK}</Text>
        <Text variant="h1">{APP_NAME}</Text>
      </View>
    </Link>
  );
}
