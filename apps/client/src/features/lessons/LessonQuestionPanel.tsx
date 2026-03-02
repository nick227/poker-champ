import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import type { LessonStep } from "./lesson.types";

export function LessonQuestionPanel({
  step,
  selectedOptionKey,
  onSelectOption,
  loading,
  disabled,
}: {
  step: LessonStep;
  selectedOptionKey: string | null;
  onSelectOption: (optionKey: string) => void;
  loading: boolean;
  disabled: boolean;
}) {
  if (step.type !== "MCQ_STEP") return null;

  return (
    <View className="mx-4 mt-3 rounded-xl border border-border bg-panel p-3">
      <Text variant="label" className="text-[10px]">
        Multiple Choice
      </Text>
      <View className="mt-2 gap-2">
        {step.options.map((option) => {
          const selected = selectedOptionKey === option.optionKey;
          return (
            <Button
              key={option.optionKey}
              title={option.label}
              onPress={() => onSelectOption(option.optionKey)}
              variant={selected ? "primary" : "ghost"}
              disabled={disabled || loading}
              minWidth={0}
              className="w-full"
            />
          );
        })}
      </View>
      {loading ? (
        <Text variant="muted" className="mt-3 text-xs">
          Evaluating answer...
        </Text>
      ) : null}
    </View>
  );
}
