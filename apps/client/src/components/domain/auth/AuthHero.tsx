import { View } from "react-native";
import { Text } from "@/components/base/Text";

const LOGO_MARK = "♠";
const APP_NAME = "Poker Champ";
const TAGLINE = "Multi-platform poker";

export function AuthHero() {
  return (
    <View className="relative items-center justify-center py-10 min-h-[200px]">
      <View className="absolute left-1/2 top-1/2 h-64 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand opacity-[0.12]" />
      <View className="absolute left-1/2 top-1/2 h-48 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand opacity-[0.08]" />
      <View className="ui-col ui-center ui-stack-4 z-10">
        <Text variant="h1" style={{ fontSize: 48 }}>{LOGO_MARK}</Text>
        <Text variant="h1">{APP_NAME}</Text>
        <Text variant="muted">{TAGLINE}</Text>
      </View>
    </View>
  );
}
