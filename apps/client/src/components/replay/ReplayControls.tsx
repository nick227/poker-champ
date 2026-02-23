import { useCallback, useState } from "react";
import { View, Pressable, LayoutChangeEvent, type GestureResponderEvent } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { getStepFromTrackPress } from "./replayScrubber";

export interface ReplayControlsProps {
  currentStep: number;
  totalSteps: number;
  onPrev: () => void;
  onNext: () => void;
  onGoTo: (step: number) => void;
  onPlay: () => void;
  isPlaying: boolean;
}

/**
 * Replay controls: step counter, prev/next, frame scrubber, play/pause.
 */
export function ReplayControls({
  currentStep,
  totalSteps,
  onPrev,
  onNext,
  onGoTo,
  onPlay,
  isPlaying,
}: ReplayControlsProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const canGoPrev = currentStep > 0;
  const canGoNext = currentStep < totalSteps - 1;

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const onTrackPress = useCallback(
    (e: GestureResponderEvent) => {
      const step = getStepFromTrackPress(
        e.nativeEvent.locationX,
        trackWidth,
        totalSteps,
      );
      onGoTo(step);
    },
    [totalSteps, trackWidth, onGoTo],
  );

  const pct = totalSteps > 1 ? (currentStep / (totalSteps - 1)) * 100 : 100;

  return (
    <View className="ui-surface border border-border rounded-lg p-4 m-4">
      <View className="items-center mb-2">
        <Text variant="body" className="font-medium">
          Step {currentStep + 1}/{totalSteps}
        </Text>
      </View>

      {/* Frame scrubber */}
      <View
        className="h-8 flex-row rounded-full border border-border bg-panel mb-4"
        onLayout={onTrackLayout}
      >
        <Pressable
          className="flex-1 flex-row"
          onPress={onTrackPress}
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
        >
          <View style={{ width: `${pct}%` }} className="rounded-l-full bg-brand min-w-0" />
          <View className="flex-1 rounded-r-full bg-panel min-w-0" />
        </Pressable>
      </View>

      <View className="flex-row justify-between items-center mb-4">
        <Button
          title="◀"
          onPress={onPrev}
          disabled={!canGoPrev}
          variant={canGoPrev ? "primary" : "ghost"}
        />
        <View className="flex-1 mx-4" />
        <Button
          title="▶"
          onPress={onNext}
          disabled={!canGoNext}
          variant={canGoNext ? "primary" : "ghost"}
        />
      </View>

      <View className="flex-row justify-center">
        <Button
          title={isPlaying ? "⏸" : "▶"}
          onPress={onPlay}
          variant="primary"
        />
      </View>
    </View>
  );
}
