import { useCallback, useMemo } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/components/containers/Screen";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { CategoryLessonList } from "@/features/lessons/lessons.components";
import { LESSONS_PAGE_COPY } from "@/features/lessons/lessons.data";
import { useLessonsPageViewModel } from "@/features/lessons/useLessonsPageViewModel";
import { usePageBoot } from "@/hooks/usePageBoot";

export default function LessonsCategoryScreen() {
  const router = useRouter();
  const { category } = useLocalSearchParams<{ category: string }>();
  const vm = useLessonsPageViewModel();
  const ready = usePageBoot(!vm.loadingCatalog, { busy: vm.loadingCatalog });

  const openLesson = useCallback(
    (lessonId: string, enabled: boolean) => {
      if (!enabled) return;
      router.push(`/lesson/${lessonId}`);
    },
    [router],
  );

  const panel = useMemo(
    () => vm.categoryPanels.find((p) => p.id === category) ?? null,
    [vm.categoryPanels, category],
  );

  return (
    <Screen ready={ready}>
      <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ padding: 16, paddingBottom: 28 }} showsVerticalScrollIndicator>
        <Button
          title="< Lessons"
          onPress={() => router.replace("/lessons")}
          intent="secondary"
          size="sm"
          minWidth={0}
        />

        {panel ? (
          <CategoryLessonList panel={panel} onOpenLesson={openLesson} />
        ) : !vm.loadingCatalog ? (
          <View className="mt-5 items-center gap-3">
            <Text variant="muted">{LESSONS_PAGE_COPY.states.categoryNotFound}</Text>
            <Button
              title={LESSONS_PAGE_COPY.states.backToLessons}
              onPress={() => router.replace("/lessons")}
              intent="secondary"
              minWidth={0}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
