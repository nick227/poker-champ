import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { lessonService } from "@/features/lessons/lesson.service";
import type { DrillQuestion } from "./drill.types";

type AnswerRecord = { questionId: string; selectedIndex: number };

const CATEGORY_LABELS: Record<string, string> = {
  MATCHUP_EQUITY: "Matchup Equity",
  OUT_COUNTING: "Out Counting",
  BET_SIZING: "Bet Sizing",
  RULE_OF_2_4: "Rule of 2 & 4",
  POT_ODDS: "Pot Odds",
};

const SUIT_GLYPH: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

function DrillCard({ card }: { card: string }) {
  const rank = card.slice(0, -1);
  const suit = card.slice(-1).toLowerCase();
  const isRed = suit === "h" || suit === "d";
  return (
    <View className="min-w-[34px] items-center rounded-md border border-border bg-panel px-2 py-1">
      <Text variant="h2" className={`text-base ${isRed ? "text-danger" : "text-text"}`}>
        {rank}
        {SUIT_GLYPH[suit] ?? suit}
      </Text>
    </View>
  );
}

function CardRow({ label, cards }: { label: string; cards: string[] }) {
  return (
    <View className="items-center gap-1">
      <Text variant="caption" className="text-muted">
        {label}
      </Text>
      <View className="flex-row gap-1.5">
        {cards.map((card, i) => (
          <DrillCard key={`${card}-${i}`} card={card} />
        ))}
      </View>
    </View>
  );
}

export function DrillRunner({
  lessonId,
  title,
  onClose,
}: {
  lessonId: string;
  title: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<DrillQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [finished, setFinished] = useState(false);
  const [result, setResult] = useState<{ correctCount: number; totalCount: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await lessonService.startDrillSession(lessonId);
        if (cancelled) return;
        setSessionId(res.sessionId);
        setQuestions(res.questions);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load drill.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  const question = questions[questionIndex] ?? null;
  const isLast = questions.length > 0 && questionIndex === questions.length - 1;

  const handleSelect = (idx: number) => {
    if (revealed || !question) return;
    setSelectedIndex(idx);
    setRevealed(true);
    setAnswers((prev) => [...prev, { questionId: question.id, selectedIndex: idx }]);
  };

  const handleNext = async () => {
    if (!question) return;
    if (!isLast) {
      setQuestionIndex((i) => i + 1);
      setSelectedIndex(null);
      setRevealed(false);
      return;
    }
    if (!sessionId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await lessonService.completeDrillSession(lessonId, { sessionId, answers });
      setResult({ correctCount: res.correctCount, totalCount: res.totalCount });
      setFinished(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit drill.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text variant="muted">Loading drill...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center gap-4 p-6">
        <Text variant="danger">{error}</Text>
        <Button title="Back" onPress={onClose} intent="secondary" />
      </View>
    );
  }

  if (finished && result) {
    const pct = result.totalCount > 0 ? Math.round((result.correctCount / result.totalCount) * 100) : 0;
    return (
      <View className="flex-1 items-center justify-center gap-3 p-6">
        <Text variant="label">{title}</Text>
        <Text variant="h1" className="text-6xl">
          {pct}%
        </Text>
        <Text variant="muted">
          {result.correctCount} / {result.totalCount} correct
        </Text>
        <Button title="Done" onPress={onClose} intent="primary" size="lg" className="mt-4 w-full" />
      </View>
    );
  }

  if (!question) {
    return (
      <View className="flex-1 items-center justify-center gap-4 p-6">
        <Text variant="muted">No questions available.</Text>
        <Button title="Back" onPress={onClose} intent="secondary" />
      </View>
    );
  }

  const optionRows = [
    [0, 1],
    [2, 3],
  ];

  return (
    <View className="flex-1 p-4">
      <View className="flex-row items-center justify-between">
        <Text variant="label">{CATEGORY_LABELS[question.category] ?? title}</Text>
        <Text variant="muted" className="text-xs">
          {questionIndex + 1} / {questions.length}
        </Text>
      </View>

      <View className="flex-1 items-center justify-center gap-4">
        <Text variant="h1" className="text-center text-3xl">
          {question.prompt}
        </Text>

        {question.heroHand ? <CardRow label="Hero" cards={question.heroHand} /> : null}
        {question.villainHand ? <CardRow label="Villain" cards={question.villainHand} /> : null}
        {question.board ? <CardRow label="Board" cards={question.board} /> : null}

        {question.contextLines ? (
          <View className="items-center gap-1">
            {question.contextLines.map((line, i) => (
              <Text key={i} variant="h2" className="text-xl">
                {line}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      <View className="gap-3">
        {optionRows.map((row, rowIdx) => (
          <View key={rowIdx} className="flex-row gap-3">
            {row.map((idx) => {
              const option = question.options[idx];
              if (option === undefined) return <View key={idx} className="flex-1" />;
              const isSelected = selectedIndex === idx;
              const isCorrectOpt = idx === question.correctIndex;
              let stateClass = "border-border bg-panel";
              if (revealed) {
                if (isCorrectOpt) stateClass = "border-success bg-success/20";
                else if (isSelected) stateClass = "border-danger bg-danger/20";
                else stateClass = "border-border bg-panel opacity-50";
              }
              return (
                <Pressable
                  key={idx}
                  onPress={() => handleSelect(idx)}
                  disabled={revealed}
                  className={`flex-1 items-center justify-center rounded-2xl border-2 px-4 py-6 ${stateClass}`}
                >
                  <Text variant="h2" className="text-2xl">
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}

        {revealed ? (
          <View className="gap-3">
            <Text variant="muted" className="text-center text-sm">
              {question.explanation}
            </Text>
            <Button
              title={isLast ? "Finish" : "Next"}
              onPress={() => void handleNext()}
              intent="primary"
              size="lg"
              loading={submitting}
              className="w-full"
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}
