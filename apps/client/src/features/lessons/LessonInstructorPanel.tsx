import { View } from "react-native";
import { Text } from "@/components/base/Text";
import type { LessonCommunityComparison, LessonFeedback, LessonStep } from "./lesson.types";
import type { RevealLayerResult } from "@/features/lessons-v2/runtime";
import { RevealCard } from "./RevealCard";

const ACTION_LABELS: Record<string, string> = {
  fold: "Fold",
  check: "Check",
  call: "Call",
  bet: "Bet",
  raise: "Raise",
  all_in: "All-In",
};

function isPlaceholderInstructorMessage(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized.includes("placeholder");
}

function getCommunityFallbackRows(step: LessonStep): Array<[string, number]> {
  if (step.type === "MCQ_STEP" && step.options?.length) {
    return step.options.map((option) => [`mcq:${option.optionKey}`, 0]);
  }
  return [
    ["act:fold", 0],
    ["act:check", 0],
    ["act:call", 0],
    ["act:bet", 0],
    ["act:raise", 0],
    ["act:all_in", 0],
  ];
}

function mergeCommunityRows(
  step: LessonStep,
  communityComparison: LessonCommunityComparison | null,
): Array<[string, number]> {
  const merged = new Map<string, number>(getCommunityFallbackRows(step));
  for (const [key, value] of Object.entries(communityComparison?.responseDistribution ?? {})) {
    if (!merged.has(key)) continue;
    const num = Number(value);
    merged.set(key, Number.isFinite(num) ? num : 0);
  }
  return Array.from(merged.entries());
}

function formatCommunityResponseLabel(step: LessonStep, responseKey: string): string {
  if (responseKey.startsWith("act:")) {
    const actionKey = responseKey.slice(4);
    return ACTION_LABELS[actionKey] ?? actionKey;
  }
  if (responseKey.startsWith("mcq:") && step.type === "MCQ_STEP" && step.options) {
    const mcqKey = responseKey.slice(4);
    return (
      step.options.find((option) => option.optionKey.toUpperCase() === mcqKey.toUpperCase())?.label ?? `Option ${mcqKey}`
    );
  }
  if (step.type === "MCQ_STEP" && step.options) {
    return step.options.find((option) => option.optionKey === responseKey)?.label ?? responseKey;
  }
  return ACTION_LABELS[responseKey] ?? responseKey;
}

export function LessonInstructorPanel({
  step,
  feedback,
  communityComparison = null,
  communityStatus = "idle",
  evaluating = false,
  revealResults = [],
}: {
  step: LessonStep;
  feedback: LessonFeedback | null;
  communityComparison?: LessonCommunityComparison | null;
  communityStatus?: "idle" | "loading" | "ready";
  evaluating?: boolean;
  revealResults?: RevealLayerResult[];
}) {
  const followUpMessage =
    feedback && isPlaceholderInstructorMessage(feedback.followUpInstructorMessage)
      ? (step.followUpInstructorMessage ?? feedback.followUpInstructorMessage)
      : (feedback?.followUpInstructorMessage ?? null);
  const communityRows = mergeCommunityRows(step, communityComparison);
  const userPercentile = communityComparison?.userPercentile ?? null;

  return (
    <View className="p-4">
      {step.beforeInstructorMessage ? (
        <Text variant="body">
          {step.beforeInstructorMessage}
        </Text>
      ) : null}
      {feedback && !evaluating ? (
        <View className="mt-3 bg-background p-2">
          <Text
            variant="body"
            className={feedback.gradeBand ? "text-foreground" : feedback.isCorrect ? "text-success" : "text-danger"}
          >
            {feedback.response}
          </Text>
          {feedback.evBb != null && Number.isFinite(feedback.evBb) ? (
            <Text variant="label" className="text-xs">
              {feedback.evBb >= 0 ? "+" : ""}
              {Number(feedback.evBb).toFixed(1)} bb EV
            </Text>
          ) : null}
          {!feedback.gradeBand && !feedback.isCorrect && feedback.takeaway ? (
            <Text variant="label" className="text-xs">
              Takeaway: {feedback.takeaway}
            </Text>
          ) : null}
          {feedback.frequencyPerMonth != null && Number.isFinite(feedback.frequencyPerMonth) ? (
            <Text variant="muted" className="text-xs">
              You'll see this node ~{Math.round(Number(feedback.frequencyPerMonth) || 0)} times per month.
            </Text>
          ) : null}
          {followUpMessage ? (
            <Text variant="body">
              {followUpMessage}
            </Text>
          ) : null}

          {!evaluating && (communityStatus === "loading" || communityStatus === "ready") ? (
            <View className="mt-2">
              <Text variant="label" className="text-xs">
                Community
              </Text>
              {userPercentile != null ? (
                <Text variant="muted" className="mt-1 text-xs">
                  You are at the {Math.round(Number(userPercentile) || 0)}th percentile on this question.
                </Text>
              ) : null}
              <View className="gap-1 flex-row flex-wrap w-full py-4">
                {communityRows.map(([responseKey, pct]) => (
                  <Text key={`${responseKey}-${step.id}`} variant="muted" className="text-xs">
                    {formatCommunityResponseLabel(step, responseKey)}: {Math.round(Number(pct) || 0)}%
                  </Text>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
      {evaluating ? (
        <View className="py-3 border-t border-border bg-background">
          <Text variant="muted" className="text-xs">
            Evaluating decision...
          </Text>
        </View>
      ) : null}
      {revealResults.map((reveal, index) => (
        <RevealCard key={`reveal-${reveal.key}-${index}`} reveal={reveal} />
      ))}
    </View>
  );
}
