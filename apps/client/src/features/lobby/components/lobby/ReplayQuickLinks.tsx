import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { useRouter } from "expo-router";
import { loginPathWithNext } from "@/lib/nav";

type ReplayQuickLinksProps = {
  latestHandId: string | null;
  latestHandLoading: boolean;
  latestHandError: string | null;
  onReplayLastHand: (handId: string) => void;
  onCommunityHand: () => void;
  lessonsEnabled?: boolean;
  onPokerSchool?: () => void;
};

export function ReplayQuickLinks({
  latestHandId,
  latestHandLoading,
  latestHandError,
  onReplayLastHand,
  onCommunityHand,
  lessonsEnabled = false,
  onPokerSchool,
}: ReplayQuickLinksProps) {
  const canPressReplayButton = !latestHandLoading && Boolean(latestHandId);
  const replayButtonTitle = latestHandLoading ? "Loading..." : "Replay hand";
  const router = useRouter();

  return (
    <View className="px-4 pb-2 mt-4">
      <View className="ui-row gap-3">
        <View className="flex-1 rounded-xl border border-border bg-panel p-3">
          <Text variant="label" className="text-[10px]">
            Champ
          </Text>
          <Text variant="h2" className="mt-1 text-base">
            Site leaderboard
          </Text>
          <Text variant="muted" className="mt-1 text-xs">
            Is your name among the best?
          </Text>
          <View className="mt-3">
            <Button
              title="Leaderboard"
              onPress={() => router.push("/leaderboard")}
              disabled={!canPressReplayButton}
              minWidth={0}
              className="w-full"
            />
          </View>
        </View>

        {lessonsEnabled ? (
          <View className="flex-1 rounded-xl border border-border bg-panel p-3">
            <Text variant="label" className="text-[10px]">
              School
            </Text>
            <Text variant="h2" className="mt-1 text-base">
              Poker School
            </Text>
            <Text variant="muted" className="mt-1 text-xs">
              Guided hands with feedback and quizzes.
            </Text>
            <View className="mt-3">
              <Button
                title="Start lesson"
                onPress={() => onPokerSchool?.()}
                minWidth={0}
                className="w-full"
              />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}
