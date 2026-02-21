import { View, Text } from "react-native";
import { Button } from "@/components/base/Button";

export interface ReplayControlsProps {
  currentStep: number;
  totalSteps: number;
  onPrev: () => void;
  onNext: () => void;
  onPlay: () => void;
  isPlaying: boolean;
}

/**
 * Replay controls component for hand navigation and playback.
 * 
 * Provides:
 * - Previous/Next step navigation
 * - Play/Pause toggle
 * - Step counter display
 * - Disabled state handling
 */
export function ReplayControls({
  currentStep,
  totalSteps,
  onPrev,
  onNext,
  onPlay,
  isPlaying,
}: ReplayControlsProps) {
  const canGoPrev = currentStep > 0;
  const canGoNext = currentStep < totalSteps - 1;

  return (
    <View className="bg-white border border-gray-200 rounded-lg p-4 m-4">
      {/* Step counter */}
      <View className="items-center mb-4">
        <Text className="text-gray-700 font-medium">
          Step {currentStep + 1}/{totalSteps}
        </Text>
      </View>
      
      {/* Navigation controls */}
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
      
      {/* Play/Pause control */}
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
