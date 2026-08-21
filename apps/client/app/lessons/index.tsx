import { useCallback, useMemo } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/containers/Screen";
import {
  DailyChallengesSection,
  DrillsSection,
  LESSONS_SECTION_ORDER,
  LessonsHeroCard,
  ModulesSection,
  RecentCompletedSection,
  StatusBanners,
} from "@/features/lessons/lessons.components";
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

  const visibleSectionIds = useMemo(
    () =>
      LESSONS_SECTION_ORDER.filter((sectionId) => {
        if (sectionId === "daily-challenges") return vm.dailyChallenges.length > 0;
        return false;
      }),
    [vm.dailyChallenges.length],
  );

  const sectionRegistry = {
    "daily-challenges": <DailyChallengesSection vm={vm} onOpenLesson={openLesson} />,
    "recent-completed": <RecentCompletedSection vm={vm} onOpenLesson={openLesson} />,
  };

  return (
    <Screen ready={ready}>
      <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ padding: 16, paddingBottom: 28 }} showsVerticalScrollIndicator>
        <LessonsHeroCard vm={vm} onOpenLesson={openLesson} />

        <DrillsSection vm={vm} onOpenLesson={openLesson} />

        {visibleSectionIds.map((sectionId) => (
          <View key={sectionId}>
            {sectionRegistry[sectionId]}
          </View>
        ))}

        <ModulesSection vm={vm} onOpenLesson={openLesson} />
        <RecentCompletedSection vm={vm} onOpenLesson={openLesson} />
        <StatusBanners vm={vm} />
      </ScrollView>
    </Screen>
  );
}
