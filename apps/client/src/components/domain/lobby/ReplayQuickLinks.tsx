import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";

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
  const replayButtonTitle = latestHandLoading ? "Loading..." : "Replay last hand";

  return (
    <View className="px-4 pb-2">
      <View className="ui-row gap-3">
        <View className="flex-1 rounded-xl border border-border bg-panel p-3">
          <Text variant="label" className="text-[10px]">
            Replay
          </Text>
          <Text variant="h2" className="mt-1 text-base">
            Replay your last hand
          </Text>
          <Text variant="muted" className="mt-1 text-xs">
            Jump back into your latest replayable hand.
          </Text>
          {latestHandError ? (
            <Text variant="muted" className="mt-2 text-xs text-danger">
              Unable to fetch replay hand.
            </Text>
          ) : null}
          <View className="mt-3">
            <Button
              title={replayButtonTitle}
              onPress={() => {
                if (!latestHandId) return;
                onReplayLastHand(latestHandId);
              }}
              disabled={!canPressReplayButton}
              minWidth={0}
              className="w-full"
            />
          </View>
        </View>

        <View className="flex-1 rounded-xl border border-border bg-panel p-3">
          <Text variant="label" className="text-[10px]">
            Learn
          </Text>
          <Text variant="h2" className="mt-1 text-base">
            Community Hand
          </Text>
          <Text variant="muted" className="mt-1 text-xs">
            Walk through a hand with replay controls.
          </Text>
          <View className="mt-3">
            <Button
              title="Open community hand"
              onPress={onCommunityHand}
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
