import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useBankroll } from "@/hooks/useBankroll";
import { LessonContent } from "@/features/lessons/LessonContent";

export default function LessonScreen() {
  const router = useRouter();
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const { cents: balanceCents } = useBankroll();

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 bg-panel h-full">
        <LessonContent
          lessonId={lessonId ?? null}
          enabled
          balanceCents={balanceCents}
          onClose={() => router.replace("/lessons")}
          onApplyAtTable={() => router.replace("/lessons")}
          onOpenLesson={(nextLessonId) => router.replace(`/lesson/${encodeURIComponent(nextLessonId)}`)}
        />
      </View>
    </SafeAreaView>
  );
}
