import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { Surface } from "@/components/containers/Surface";
import {
  LESSONS_BUTTON_KEYS,
  LESSONS_PAGE_COPY,
  formatLessonsCadence,
  formatLessonsCompletedDate,
  formatLessonsProgress,
  formatLessonsScore,
  getLessonsButtonLabel,
} from "./_lessons.data";
import type { useLessonsPageViewModel } from "./_useLessonsPageViewModel";

type LessonsPageViewModel = ReturnType<typeof useLessonsPageViewModel>;

export type LessonsSectionId = "daily-challenges" | "recent-completed";

export const LESSONS_SECTION_ORDER: LessonsSectionId[] = [
  "daily-challenges",
];

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

export function ContinueSection({
  vm,
  onOpenLesson,
}: {
  vm: LessonsPageViewModel;
  onOpenLesson: (lessonId: string, enabled: boolean) => void;
}) {
  const currentLesson = vm.inProgressLesson;
  if (!currentLesson) return null;
  const stepNumber = Math.max(1, (currentLesson.currentStepIndex ?? 0) + 1);

  return (
    <Surface styleId="surface.list.panel" className="mt-5">
      <Text variant="h2" className="text-base">
        {LESSONS_PAGE_COPY.sections.continue.title}
      </Text>
      <Surface styleId="surface.list.row" className="mt-3" testID={`continue-card-${currentLesson.id}`}>
        <Text variant="label">{LESSONS_PAGE_COPY.sections.continue.cardHeading}</Text>
        <Text variant="body" className="mt-1 font-semibold">
          {currentLesson.title}
        </Text>
        <Text variant="muted" className="mt-1 text-xs">
          Step {stepNumber} {LESSONS_PAGE_COPY.sections.continue.stepSuffix}
        </Text>
        <View className="mt-3">
          <Button
            title={getLessonsButtonLabel(LESSONS_BUTTON_KEYS.LESSON_RESUME_STEP, { stepNumber })}
            onPress={() => onOpenLesson(currentLesson.id, currentLesson.enabled)}
            minWidth={0}
            className="w-full"
          />
        </View>
      </Surface>
    </Surface>
  );
}

export function DailyChallengesSection({
  vm,
  onOpenLesson,
}: {
  vm: LessonsPageViewModel;
  onOpenLesson: (lessonId: string, enabled: boolean) => void;
}) {
  if (vm.dailyChallenges.length === 0) return null;

  return (
    <Surface styleId="surface.list.panel" className="mt-5">
      <View className="flex-row items-center justify-between">
        <Text variant="h2" className="text-base">
          {LESSONS_PAGE_COPY.sections.dailyChallenges.title}
        </Text>
        <Text variant="caption">
          {vm.dailyChallenges.length} {LESSONS_PAGE_COPY.sections.dailyChallenges.availableSuffix}
        </Text>
      </View>
      <Text variant="muted" className="mt-1 text-xs">
        {LESSONS_PAGE_COPY.sections.dailyChallenges.subtitle}
      </Text>
      <View className="mt-3 gap-2">
        {vm.dailyChallenges.map((challenge) => {
          const lesson = challenge.lesson;
          const challengeButtonKey =
            lesson.state === "in_progress"
              ? LESSONS_BUTTON_KEYS.CHALLENGE_RESUME
              : LESSONS_BUTTON_KEYS.CHALLENGE_START;

          return (
            <Surface
              key={lesson.id}
              as={Pressable}
              styleId="surface.list.row"
              onPress={() => onOpenLesson(lesson.id, lesson.enabled)}
              className="active:opacity-85"
              testID={`daily-challenge-${lesson.id}`}
            >
              <View className="flex-row items-center justify-between">
                <Text variant="body" className="font-semibold flex-1">
                  {lesson.title}
                </Text>
                <View className="rounded-full border border-border bg-panel px-2 py-0.5">
                  <Text variant="caption">
                    {LESSONS_PAGE_COPY.sections.dailyChallenges.typeLabels[challenge.type]}
                  </Text>
                </View>
              </View>
              <View className="mt-2 flex-row items-center justify-between">
                <Text variant="muted" className="text-xs">
                  {lesson.outcome}
                </Text>
                <View className={`rounded-full px-2 py-0.5 ${lesson.stateChip.cls}`}>
                  <Text variant="caption">{lesson.stateChip.label}</Text>
                </View>
              </View>
              <View className="mt-2 flex-row flex-wrap gap-2">
                {[
                  {
                    id: `${lesson.id}-minutes`,
                    text: `${lesson.estimatedMinutes} ${LESSONS_PAGE_COPY.module.minutesSuffix}`,
                  },
                  {
                    id: `${lesson.id}-attempts`,
                    text: `${LESSONS_PAGE_COPY.sections.dailyChallenges.attemptsPrefix} ${lesson.completedAttempts ?? 0}`,
                  },
                  ...(lesson.bestScorePct != null
                    ? [
                        {
                          id: `${lesson.id}-best`,
                          text: `${LESSONS_PAGE_COPY.sections.dailyChallenges.bestPrefix} ${lesson.bestScorePct}%`,
                        },
                      ]
                    : []),
                ].map((chip) => (
                  <View key={chip.id} className="rounded-full bg-panel px-2 py-0.5">
                    <Text variant="caption">{chip.text}</Text>
                  </View>
                ))}
              </View>
              <View className="mt-3">
                <Button
                  title={getLessonsButtonLabel(challengeButtonKey)}
                  onPress={() => onOpenLesson(lesson.id, lesson.enabled)}
                  minWidth={0}
                  className="w-full"
                />
              </View>
            </Surface>
          );
        })}
      </View>
    </Surface>
  );
}

export function RecentCompletedSection({
  vm,
  onOpenLesson,
}: {
  vm: LessonsPageViewModel;
  onOpenLesson: (lessonId: string, enabled: boolean) => void;
}) {
  if (vm.recentCompletedLessons.length === 0) return null;

  return (
    <Surface styleId="surface.list.panel" className="mt-5">
      <Text variant="h2" className="text-base">
        {LESSONS_PAGE_COPY.sections.recentCompleted.title}
      </Text>
      <View className="mt-3 gap-2">
        {vm.recentCompletedLessons.map((lesson) => (
          <Surface
            key={lesson.id}
            as={Pressable}
            styleId="surface.list.row"
            onPress={() => onOpenLesson(lesson.id, lesson.enabled)}
            className="active:opacity-85"
            testID={`recent-completed-${lesson.id}`}
          >
            <View className="flex-row items-center justify-between">
              <Text variant="body" className="font-semibold">
                {lesson.title}
              </Text>
              <Text variant="caption">{formatLessonsScore(lesson.lastScorePct)}</Text>
            </View>
            <Text variant="muted" className="mt-1 text-xs">
              {formatLessonsCompletedDate(lesson.lastAttemptedAt)}
            </Text>
          </Surface>
        ))}
      </View>
    </Surface>
  );
}

export function ModulesSection({
  vm,
  onOpenLesson,
}: {
  vm: LessonsPageViewModel;
  onOpenLesson: (lessonId: string, enabled: boolean) => void;
}) {
  return (
    <View className="mt-5 gap-4">
      {vm.moduleCards.map((moduleCard) => (
        <Surface key={moduleCard.moduleCode} styleId="surface.list.panel">
          <View className="flex-row items-center justify-between">
            <Text variant="h2" className="text-base">
              {moduleCard.meta.title}
            </Text>
            <Text variant="caption">
              {moduleCard.done}/{moduleCard.total} ({moduleCard.pct}%)
            </Text>
          </View>
          <Text variant="muted" className="mt-1 text-xs">
            {moduleCard.meta.promise}
          </Text>
          <View className="mt-3 h-2 overflow-hidden rounded-full bg-background">
            <View className="h-full bg-brand" style={{ width: `${moduleCard.pct}%` }} />
          </View>

          <View className="mt-3 gap-2">
            {moduleCard.lessons.map((item) => {
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
                        id: `${item.id}-role`,
                        className: "bg-panel",
                        text: item.role,
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
        </Surface>
      ))}

      {vm.moduleCards.length === 0 ? (
        <Surface styleId="surface.list.panel">
          <Text variant="label">{LESSONS_PAGE_COPY.states.emptyModulesTitle}</Text>
          <Text variant="muted" className="mt-1 text-xs">
            {LESSONS_PAGE_COPY.states.emptyModulesBody}
          </Text>
        </Surface>
      ) : null}
    </View>
  );
}

export function StatusBanners({ vm }: { vm: LessonsPageViewModel }) {
  const banners = [
    vm.loadingCatalog
      ? {
          id: "loading",
          tone: "muted" as const,
          message: LESSONS_PAGE_COPY.states.refreshingCatalog,
        }
      : null,
    vm.catalogError
      ? {
          id: "error",
          tone: "danger" as const,
          message: vm.catalogError,
        }
      : null,
  ].filter((banner) => banner != null);

  return (
    <>
      {banners.map((banner) => (
        <Surface key={banner.id} styleId="surface.list.panel" className="mt-4">
          <Text variant={banner.tone === "danger" ? "danger" : "muted"}>{banner.message}</Text>
        </Surface>
      ))}
    </>
  );
}
