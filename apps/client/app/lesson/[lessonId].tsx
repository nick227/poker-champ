import { useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useBankroll } from "@/hooks/useBankroll";
import { LessonContent } from "@/features/lessons/LessonContent";
import { DrillRunner } from "@/features/lessons/drills/DrillRunner";
import { lessonService } from "@/features/lessons/lesson.service";
import { Text } from "@/components/base/Text";

export default function LessonScreen() {
  const router = useRouter();
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const { cents: balanceCents } = useBankroll();

  const [formatLoading, setFormatLoading] = useState(true);
  const [format, setFormat] = useState<"STANDARD" | "DRILL">("STANDARD");
  const [lessonTitle, setLessonTitle] = useState("");

  useEffect(() => {
    if (!lessonId) return;
    let cancelled = false;
    void (async () => {
      setFormatLoading(true);
      try {
        const res = await lessonService.getLesson(lessonId);
        if (cancelled) return;
        setFormat(res.lesson.format === "DRILL" ? "DRILL" : "STANDARD");
        setLessonTitle(res.lesson.title);
      } catch {
        if (cancelled) return;
        setFormat("STANDARD");
      } finally {
        if (!cancelled) setFormatLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 bg-panel h-full">
        {formatLoading ? (
          <View className="flex-1 items-center justify-center">
            <Text variant="muted">Loading...</Text>
          </View>
        ) : format === "DRILL" ? (
          <DrillRunner
            lessonId={lessonId ?? ""}
            title={lessonTitle}
            onClose={() => router.replace("/lessons")}
          />
        ) : (
          <LessonContent
            lessonId={lessonId ?? null}
            enabled
            balanceCents={balanceCents}
            onClose={() => router.replace("/lessons")}
            onApplyAtTable={() => router.replace("/lessons")}
            onOpenLesson={(nextLessonId) => router.replace(`/lesson/${encodeURIComponent(nextLessonId)}`)}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
