import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";

type Props = {
  onPlay: () => void;
  onDismiss: () => void;
  showPlayCta?: boolean;
};

/** Post-lesson nudge into cash tables. */
export function LobbyLessonNudge({ onPlay, onDismiss, showPlayCta = true }: Props) {
  return (
    <View className="mb-3 flex-row items-center justify-between rounded-2 border border-brand/30 bg-brand/10 px-3 py-2">
      <Text variant="body" className="text-foreground flex-1 text-sm">
        Great work on that lesson — now test it at the tables!
      </Text>
      {showPlayCta ? (
        <Button
          title="Play now"
          onPress={onPlay}
          intent="accent"
          size="sm"
          shape="hud"
          className="min-h-[36px] h-9 px-3 ml-2"
        />
      ) : null}
      <Button
        title="Dismiss"
        onPress={onDismiss}
        intent="neutral"
        size="sm"
        shape="hud"
        className="min-h-[36px] h-9 px-2 ml-1"
        textClassName="text-muted"
      />
    </View>
  );
}
