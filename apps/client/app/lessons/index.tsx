import { useCallback } from "react";
import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/containers/Screen";
import { LessonCategoryPanels, LessonsHeroCard } from "@/features/lessons/lessons.components";
import { useLessonsPageViewModel } from "@/features/lessons/useLessonsPageViewModel";
import { usePageBoot } from "@/hooks/usePageBoot";

export default function LessonsScreen() {
  const router = useRouter();
  const vm = useLessonsPageViewModel();
  const ready = usePageBoot(!vm.loadingCatalog, { busy: vm.loadingCatalog });

  const openLesson = useCallback(
    (lessonId: string, enabled: boolean) => {
      if (!enabled) return;
      router.push(`/lesson/${lessonId}`);
    },
    [router],
  );

  const openCategory = useCallback(
    (categoryId: string) => {
      router.push(`/lessons/${categoryId}`);
    },
    [router],
  );

  return (
    <Screen ready={ready}>
      <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ padding: 16, paddingBottom: 28 }} showsVerticalScrollIndicator>
        <LessonsHeroCard vm={vm} onOpenLesson={openLesson} />
        <LessonCategoryPanels vm={vm} onOpenCategory={openCategory} />
      </ScrollView>
    </Screen>
  );
}
