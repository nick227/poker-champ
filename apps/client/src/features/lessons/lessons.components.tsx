import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { Surface } from "@/components/containers/Surface";
import {
  LESSONS_BUTTON_KEYS,
  LESSONS_PAGE_COPY,
  formatLessonsCadence,
  formatLessonsProgress,
  getLessonsButtonLabel,
} from "./lessons.data";
import type { CategoryPanel, useLessonsPageViewModel } from "./useLessonsPageViewModel";

type LessonsPageViewModel = ReturnType<typeof useLessonsPageViewModel>;

export function LessonsHeroCard({
  vm,
  onOpenLesson,
}: {
  vm: LessonsPageViewModel;
  onOpenLesson: (lessonId: string, enabled: boolean) => void;
}) {
  const heroPrimaryTarget = vm.inProgressLesson ?? vm.firstLesson;
  const heroPrimaryButtonKey = vm.inProgressLesson
    ? LESSONS_BUTTON_KEYS.HERO_CONTINUE
    : LESSONS_BUTTON_KEYS.HERO_START_FIRST;

  return (
    <View className="rounded-2xl border-2 border-border bg-panel p-5 shadow-sm">
      <View>
        {[
          {
            id: "hero-badge",
            variant: "label" as const,
            className: "text-brand font-semibold uppercase tracking-wide",
            text: LESSONS_PAGE_COPY.hero.badge,
          },
          {
            id: "hero-title",
            variant: "h1" as const,
            className: "mt-2 text-2xl font-bold leading-tight",
            text: LESSONS_PAGE_COPY.hero.title,
          },
        ].map((line) => (
          <Text key={line.id} variant={line.variant} className={line.className}>
            {line.text}
          </Text>
        ))}
      </View>

      <View className="mt-4 rounded-xl border border-border bg-background p-3">
        {[
          {
            id: "progress-label",
            visible: true,
            variant: "label" as const,
            className: undefined,
            text: LESSONS_PAGE_COPY.hero.progressHeading,
          },
          {
            id: "progress-value",
            visible: true,
            variant: "body" as const,
            className: "mt-1",
            text: formatLessonsProgress(vm.completedCount, vm.catalogCount),
          },
          {
            id: "cadence",
            visible: vm.cadenceLast7Days > 0,
            variant: "muted" as const,
            className: "mt-1 text-xs",
            text: formatLessonsCadence(vm.cadenceLast7Days),
          },
        ]
          .filter((line) => line.visible)
          .map((line) => (
            <Text key={line.id} variant={line.variant} className={line.className}>
              {line.text}
            </Text>
          ))}
      </View>

      <View className="mt-4">
        <Button
          title={getLessonsButtonLabel(heroPrimaryButtonKey)}
          onPress={() => {
            if (!heroPrimaryTarget) return;
            onOpenLesson(heroPrimaryTarget.id, heroPrimaryTarget.enabled);
          }}
          disabled={!heroPrimaryTarget}
          minWidth={0}
          className="w-full"
        />
      </View>
    </View>
  );
}

export function LessonCategoryPanels({
  vm,
  onOpenCategory,
}: {
  vm: LessonsPageViewModel;
  onOpenCategory: (categoryId: string) => void;
}) {
  if (vm.categoryPanels.length === 0) {
    return (
      <Surface styleId="surface.list.panel" className="mt-5">
        <Text variant="label">{LESSONS_PAGE_COPY.states.emptyModulesTitle}</Text>
        <Text variant="muted" className="mt-1 text-xs">
          {LESSONS_PAGE_COPY.states.emptyModulesBody}
        </Text>
      </Surface>
    );
  }

  const rows: (typeof vm.categoryPanels)[] = [];
  for (let i = 0; i < vm.categoryPanels.length; i += 2) {
    rows.push(vm.categoryPanels.slice(i, i + 2));
  }

  return (
    <View className="mt-5 gap-3">
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} className="flex-row gap-3">
          {row.map((panel) => {
            const isDrills = panel.id === "DRILLS";
            return (
              <Pressable
                key={panel.id}
                onPress={() => onOpenCategory(panel.id)}
                className={`flex-1 rounded-2xl border-2 p-4 active:opacity-85 ${
                  isDrills ? "border-brand bg-brand/5" : "border-border bg-panel"
                }`}
                testID={`category-panel-${panel.id}`}
              >
                <Text variant="h2" className={`text-base ${isDrills ? "text-brand" : ""}`}>
                  {panel.meta.title}
                </Text>
                <Text variant="muted" className="mt-1 text-xs" numberOfLines={2}>
                  {panel.meta.promise}
                </Text>
                <View className="mt-3 h-2 overflow-hidden rounded-full bg-background">
                  <View className="h-full bg-brand" style={{ width: `${panel.pct}%` }} />
                </View>
                <Text variant="caption" className="mt-2">
                  {panel.done}/{panel.total} ({panel.pct}%)
                </Text>
              </Pressable>
            );
          })}
          {row.length === 1 ? <View className="flex-1" /> : null}
        </View>
      ))}
    </View>
  );
}

export function CategoryLessonList({
  panel,
  onOpenLesson,
}: {
  panel: CategoryPanel;
  onOpenLesson: (lessonId: string, enabled: boolean) => void;
}) {
  return (
    <View className="mt-4">
      <Text variant="h1" className="text-2xl font-bold">
        {panel.meta.title}
      </Text>
      <Text variant="muted" className="mt-1 text-sm">
        {panel.meta.promise}
      </Text>
      <View className="mt-3 flex-row items-center justify-between">
        <View className="h-2 flex-1 overflow-hidden rounded-full bg-background">
          <View className="h-full bg-brand" style={{ width: `${panel.pct}%` }} />
        </View>
        <Text variant="caption" className="ml-3">
          {panel.done}/{panel.total} ({panel.pct}%)
        </Text>
      </View>

      <View className="mt-4 gap-2">
        {panel.lessons.map((item) => {
          const tierLabel = item.tier === "elite" ? "Elite" : item.tier === "pro" ? "Pro" : null;
          return (
            <Surface
              key={item.id}
              as={Pressable}
              styleId="surface.list.row"
              onPress={() => onOpenLesson(item.id, item.enabled)}
              className="active:opacity-85"
              testID={`lesson-card-${item.id}`}
            >
              <View className="flex-row items-center justify-between flex-wrap gap-1">
                <Text variant="body" className="font-semibold flex-1">
                  {item.title}
                </Text>
                <View className="flex-row items-center gap-1.5">
                  {tierLabel ? (
                    <View className="rounded-full border border-border bg-panel px-2 py-0.5">
                      <Text variant="caption">{tierLabel}</Text>
                    </View>
                  ) : null}
                  <View className={`rounded-full px-2 py-0.5 ${item.stateChip.cls}`} testID={`lesson-state-${item.id}`}>
                    <Text variant="caption">{item.stateChip.label}</Text>
                  </View>
                </View>
              </View>
              <Text variant="muted" className="mt-1 text-xs">
                {item.outcome}
              </Text>
              <View className="mt-2 flex-row flex-wrap gap-2">
                {[
                  {
                    id: `${item.id}-difficulty`,
                    className: item.difficultyChipClass,
                    text: item.difficulty,
                  },
                  {
                    id: `${item.id}-minutes`,
                    className: "bg-panel",
                    text: `${item.estimatedMinutes} ${LESSONS_PAGE_COPY.module.minutesSuffix}`,
                  },
                  ...item.tags.slice(0, 2).map((tag) => ({
                    id: `${item.id}-${tag}`,
                    className: "bg-panel",
                    text: tag,
                  })),
                ].map((chip) => (
                  <View key={chip.id} className={`rounded-full px-2 py-0.5 ${chip.className}`}>
                    <Text variant="caption">{chip.text}</Text>
                  </View>
                ))}
              </View>
              <View className="mt-3">
                <Button
                  title={getLessonsButtonLabel(item.actionButton.key, item.actionButton.context)}
                  onPress={() => onOpenLesson(item.id, item.enabled)}
                  disabled={item.actionButton.disabled ?? !item.enabled}
                  minWidth={0}
                  className="w-full"
                  variant={item.actionButton.variant}
                />
              </View>
            </Surface>
          );
        })}
      </View>
    </View>
  );
}
