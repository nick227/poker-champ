import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import type { LessonEvaluation } from "@/lib/lessons/lessonEvaluator";

interface LessonPanelProps {
  evaluation: LessonEvaluation;
  onNextLesson?: () => void;
}

/**
 * LessonPanel displays evaluation results and feedback.
 * 
 * Only consumes evaluation results, never reads snapshot directly.
 * Shows correctness, explanation, and optional navigation.
 */
export function LessonPanel({ evaluation, onNextLesson }: LessonPanelProps) {
  const isCorrect = evaluation.correct;

  return (
    <View className="bg-white border border-gray-200 rounded-lg p-4 m-4 shadow-sm">
      {/* Status Header */}
      <View className="flex-row items-center mb-3">
        <Text 
          className={`text-lg font-bold ${
            isCorrect ? "text-green-600" : "text-red-600"
          }`}
        >
          {isCorrect ? "✓ Correct!" : "✗ Incorrect"}
        </Text>
      </View>

      {/* Explanation */}
      <View className="mb-4">
        <Text className="text-gray-700 text-sm leading-relaxed">
          {evaluation.explanation}
        </Text>
      </View>

      {/* Expected Action (for incorrect answers) */}
      {!isCorrect && evaluation.expected && (
        <View className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <Text className="text-yellow-800 text-sm font-medium">
            Expected action: {evaluation.expected}
          </Text>
        </View>
      )}

      {/* Next Lesson Button */}
      {onNextLesson && (
        <View className="mt-4">
          <Button 
            title="Continue to Next Lesson"
            onPress={onNextLesson}
            variant="primary"
          />
        </View>
      )}
    </View>
  );
}
