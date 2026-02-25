import { View } from "react-native";
import type { ReactNode } from "react";
import { Text } from "@/components/base/Text";
import { APP_NAME } from "@/constants/copy";

const LOGO_MARK = "♠";

export function Masthead({ rightAction }: { rightAction?: ReactNode }) {
  return (
    <View className="relative items-center ui-section py-2">
      <View className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand opacity-[0.06]" />
      {rightAction ? <View className="absolute right-3 top-3 z-20">{rightAction}</View> : null}
      <View className="ui-row ui-inline-2 ui-center z-10">
        <Text variant="h1" style={{ fontSize: 28 }}>{LOGO_MARK}</Text>
        <Text variant="h1">{APP_NAME}</Text>
      </View>
    </View>
  );
}
