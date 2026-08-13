import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { useRouter } from "expo-router";

type ReplayQuickLinksProps = {
  lessonsEnabled?: boolean;
  onPokerSchool?: () => void;
};

/** Quiet HUD strip for secondary destinations — not marketing cards. */
export function ReplayQuickLinks({
  lessonsEnabled = false,
  onPokerSchool,
}: ReplayQuickLinksProps) {
  const router = useRouter();

  return (
    <View className="ui-row items-center flex-wrap gap-2 py-3 border-t border-border mt-2">
      <Text variant="muted" className="text-[11px] tracking-widest uppercase mr-1">
        More
      </Text>
      <Button
        title="Leaderboard"
        intent="secondary"
        size="sm"
        shape="hud"
        minWidth={0}
        onPress={() => router.push("/leaderboard")}
        className="h-8 min-h-[32px]"
      />
      {lessonsEnabled ? (
        <Button
          title="Poker School"
          intent="secondary"
          size="sm"
          shape="hud"
          minWidth={0}
          onPress={() => onPokerSchool?.()}
          className="h-8 min-h-[32px]"
        />
      ) : null}
    </View>
  );
}
