import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, View, Pressable, PanResponder } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { lessonService } from "./lesson.service";
import { ActiveTableView } from "@/components/domain/table/views/ActiveTableView";
import { mapSeatsToOpponents } from "@/components/domain/table/table.adapter";
import { buildTableSceneModel } from "@/components/domain/table/model/useTableSceneModel";
import { buildReplayDisabledSceneModel } from "@/components/replay/replaySceneModel";
import type { ActionBarOnAction } from "@/components/domain/table/ActionBar";
import { isV2ConfiguredStep, useDecisionNodeRuntime } from "@/features/lessons-v2/runtime";
import { LessonInstructorPanel } from "./LessonInstructorPanel";
import { LessonQuestionPanel } from "./LessonQuestionPanel";
import { useLessonSession } from "./useLessonSession";
import type { LessonDefinition } from "./lesson.types";
import type { AwardGrant } from "@/types/awards";
import { AwardToaster } from "@/components/domain/awards/AwardToaster";
import { ACTION_BAR_HEIGHT } from "@/components/domain/table/constants/tableLayout.constants";
import { useAuthStore } from "@/stores/auth.store";

function LessonCompletionView({
  lesson,
  scorePct,
  bootCampComplete,
  onApplyAtTable,
  onBackToBootCamp,
  awardsGranted,
  onDismissAwards,
}: {
  lesson: LessonDefinition;
  scorePct: number | null;
  bootCampComplete?: boolean;
  onApplyAtTable?: () => void;
  onBackToBootCamp: () => void;
  awardsGranted?: AwardGrant[];
  onDismissAwards?: () => void;
}) {
  const router = useRouter();
  const disciplines = useMemo(() => {
    const categories = new Set<string>();
    for (const s of lesson.steps) {
      if (s.displayCategory && typeof s.displayCategory === "string") categories.add(s.displayCategory);
    }
    return Array.from(categories);
  }, [lesson.steps]);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }} showsVerticalScrollIndicator>
      {awardsGranted && awardsGranted.length > 0 && onDismissAwards ? (
        <View className="mb-3">
          <AwardToaster awards={awardsGranted} onDismiss={onDismissAwards} />
        </View>
      ) : null}
      <View className="rounded-2xl border-2 border-border bg-panel p-5">
        <Text variant="label" className="text-brand font-semibold uppercase tracking-wide">
          Lesson complete
        </Text>
        {bootCampComplete ? (
          <View className="mt-2 rounded-lg border border-brand/40 bg-brand/10 px-3 py-2">
            <Text variant="label" className="text-brand">
              Boot Camp Certified
            </Text>
          </View>
        ) : null}
        <Text variant="h1" className="mt-2 text-xl font-bold">
          {lesson.title}
        </Text>
        {scorePct != null ? (
          <View className="mt-3 rounded-xl bg-background p-3">
            <Text variant="label">Score</Text>
            <Text variant="h2" className="mt-1 text-2xl">
              {Math.round(scorePct)}%
            </Text>
          </View>
        ) : null}
        {disciplines.length > 0 ? (
          <View className="mt-3 rounded-xl border border-border bg-background p-3">
            <Text variant="label">Disciplines practiced</Text>
            <Text variant="body" className="mt-1">
              {disciplines.join(" · ")}
            </Text>
          </View>
        ) : null}
        <Text variant="muted" className="mt-3 text-sm">
          Apply this at the table. Same interface, same decisions—now with clearer intent.
        </Text>
        {(lesson.blogPostSlug?.trim() || lesson.replayHandId?.trim()) ? (
          <View className="mt-3 rounded-xl border border-border bg-background p-3">
            <Text variant="label" className="text-xs">
              Related
            </Text>
            <View className="mt-2 flex-row flex-wrap gap-2">
              {lesson.blogPostSlug?.trim() ? (
                <Pressable
                  onPress={() => router.push(`/blog/${encodeURIComponent(lesson.blogPostSlug!.trim())}`)}
                  className="rounded-lg border border-border bg-panel px-3 py-2 active:opacity-80"
                >
                  <Text variant="body" className="text-sm text-brand">
                    Read blog post
                  </Text>
                </Pressable>
              ) : null}
              {lesson.replayHandId?.trim() ? (
                <Pressable
                  onPress={() => router.push(`/replay/${encodeURIComponent(lesson.replayHandId!.trim())}`)}
                  className="rounded-lg border border-border bg-panel px-3 py-2 active:opacity-80"
                >
                  <Text variant="body" className="text-sm text-brand">
                    Replay hand
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
        <View className="mt-5 gap-3">
          {onApplyAtTable ? (
            <Button
              title={lesson.applyCtaText?.trim() || "Apply at the table"}
              onPress={onApplyAtTable}
            />
          ) : null}
          <Button
            title={bootCampComplete ? "Continue with Advanced Drills" : "Back to Boot Camp"}
            variant="ghost"
            onPress={onBackToBootCamp}
          />
        </View>
      </View>
    </ScrollView>
  );
}

export function LessonContent({
  lessonId,
  enabled,
  balanceCents,
  onClose,
  onApplyAtTable,
  onOpenLesson,
}: {
  lessonId: string | null;
  enabled: boolean;
  balanceCents: number;
  onClose?: () => void;
  onApplyAtTable?: () => void;
  onOpenLesson?: (nextLessonId: string) => void;
}) {
  const authHydrated = useAuthStore((s) => s.hydrated);
  const session = useLessonSession(lessonId, enabled && authHydrated);
  const [bootCampComplete, setBootCampComplete] = useState<boolean>(false);
  const [advancing, setAdvancing] = useState(false);
  const [sheetMinimized, setSheetMinimized] = useState(false);

  useEffect(() => {
    // Re-open the lesson sheet when advancing/retrying so users don't miss new prompts.
    setSheetMinimized(false);
  }, [lessonId, session.currentStepIndex]);

  useEffect(() => {
    if (!enabled || session.attempt?.status !== "COMPLETED") return;
    let cancelled = false;
    lessonService
      .listLessons()
      .then((res) => {
        if (cancelled) return;
        const lessons = res.lessons ?? [];
        const completed = lessons.filter((l) => l.progressState === "completed").length;
        setBootCampComplete(lessons.length > 0 && completed === lessons.length);
      })
      .catch(() => {
        if (!cancelled) setBootCampComplete(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, session.attempt?.status]);

  const step = session.currentStep;
  const isMigratedActionStep = Boolean(step && step.type === "ACTION_STEP" && isV2ConfiguredStep(step));
  const decisionRuntime = useDecisionNodeRuntime({
    step: isMigratedActionStep ? step : null,
    lessonId: lessonId ?? undefined,
    attemptId: session.attempt?.id,
  });
  const {
    state: decisionRuntimeState,
    revealResults,
    submit: submitDecisionRuntime,
    load: loadDecisionRuntime,
    reset: resetDecisionRuntime,
  } = decisionRuntime;

  useEffect(() => {
    if (!step || !isMigratedActionStep) {
      resetDecisionRuntime();
      return;
    }
    void loadDecisionRuntime();
  }, [step, isMigratedActionStep, loadDecisionRuntime, resetDecisionRuntime]);

  const handleAction = useCallback<ActionBarOnAction>(
    async (payload) => {
      if (!step) return;
      if (session.currentFeedback != null) return;
      if (!isMigratedActionStep) {
        await session.submitAction(payload);
        return;
      }
      if (session.submitting || decisionRuntimeState !== "QUESTION") return;
      await session.submitAction(payload);
      await submitDecisionRuntime(payload);
    },
    [step, isMigratedActionStep, session, decisionRuntimeState, submitDecisionRuntime],
  );

  const opponents = useMemo(() => {
    if (!step?.snapshot) return [];
    return mapSeatsToOpponents(step.snapshot);
  }, [step?.snapshot]);

  const sceneModel = useMemo(() => {
    if (!step?.snapshot) return null;
    const base = buildTableSceneModel(step.snapshot, null, "CONNECTED");
    if (step.type === "ACTION_STEP") return base;
    return buildReplayDisabledSceneModel(base);
  }, [step]);

  const continueToNextQuestion = useCallback(async () => {
    if (session.canGoNext) {
      session.goNext();
      return;
    }
    if (!lessonId) {
      onClose?.();
      return;
    }

    setAdvancing(true);
    try {
      const listRes = await lessonService.listLessons();
        const sortedLessons = [...(listRes.lessons ?? [])]
          .filter((item) => item.hasAccess !== false)
          .sort((a, b) => {
          const aModule = a.moduleCode;
          const bModule = b.moduleCode;
          if (aModule !== bModule) return aModule.localeCompare(bModule);
          const aOrder = a.recommendedOrder;
          const bOrder = b.recommendedOrder;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.title.localeCompare(b.title);
        });

      const currentIndex = sortedLessons.findIndex((item) => item.id === lessonId);
      const nextLesson = currentIndex >= 0 ? sortedLessons[currentIndex + 1] : null;
      if (nextLesson && onOpenLesson) {
        onOpenLesson(nextLesson.id);
        return;
      }
      onClose?.();
    } catch {
      onClose?.();
    } finally {
      setAdvancing(false);
    }
  }, [lessonId, onClose, onOpenLesson, session]);

  const collapsePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gestureState) => Math.abs(gestureState.dy) > 8,
        onPanResponderRelease: (_evt, gestureState) => {
          if (gestureState.dy > 36 || gestureState.vy > 0.55) {
            setSheetMinimized(true);
          }
        },
      }),
    [],
  );
  const expandPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gestureState) => Math.abs(gestureState.dy) > 8,
        onPanResponderRelease: (_evt, gestureState) => {
          if (gestureState.dy < -24 || gestureState.vy < -0.45) {
            setSheetMinimized(false);
          }
        },
      }),
    [],
  );

  if (!enabled) {
    return (
      <View className="p-4">
        <Text variant="body">Poker School is disabled.</Text>
      </View>
    );
  }

  if (!authHydrated) {
    return (
      <View className="p-4">
        <Text variant="muted">Loading lesson...</Text>
      </View>
    );
  }

  if (session.loading) {
    return (
      <View className="p-4">
        <Text variant="muted">Loading lesson...</Text>
      </View>
    );
  }

  if (session.error) {
    return (
      <View className="p-4 gap-2">
        <Text variant="muted" className="text-danger">
          {session.error}
        </Text>
        <Button title="Retry" onPress={() => void session.refresh()} />
      </View>
    );
  }

  if (!session.lesson) {
    return (
      <View className="p-4">
        <Text variant="muted">Lesson unavailable.</Text>
      </View>
    );
  }

  const shouldShowCompletion =
    session.attempt?.status === "COMPLETED" &&
    step?.type === "INFO_STEP" &&
    session.currentFeedback == null;

  if (shouldShowCompletion) {
    return (
      <LessonCompletionView
        lesson={session.lesson}
        scorePct={session.attempt?.scorePct ?? null}
        bootCampComplete={bootCampComplete}
        onApplyAtTable={onApplyAtTable}
        onBackToBootCamp={() => onClose?.()}
        awardsGranted={session.lastAwardsGranted}
        onDismissAwards={session.clearLastAwardsGranted}
      />
    );
  }

  if (!step) {
    return (
      <View className="p-4">
        <Text variant="muted">Lesson unavailable.</Text>
      </View>
    );
  }

  const isQuestionStep = step.type === "ACTION_STEP" || step.type === "MCQ_STEP";
  const awaitingQuestionAnswer = isQuestionStep && session.currentFeedback == null;
  const answeredQuestionStep = isQuestionStep && session.currentFeedback != null;
  const showInfoNavigation = step.type === "INFO_STEP";
  const showQuestionNavigation = answeredQuestionStep;
  const showStepNavigation = showInfoNavigation || showQuestionNavigation;
  const needsActionBarSpace = step.type === "ACTION_STEP" && awaitingQuestionAnswer;

  const tierLabel = session.lesson.tier === "elite" ? "Elite" : session.lesson.tier === "pro" ? "Pro" : null;
  const lessonSheetBottom = needsActionBarSpace ? ACTION_BAR_HEIGHT + 10 : 12;

  return (
    <View className="flex-1">
      <View className="flex-1">
        {step.snapshot && sceneModel ? (
          <ActiveTableView
            snapshot={step.snapshot}
            sceneModel={sceneModel}
            onAction={handleAction}
            opponents={opponents}
            balanceCents={balanceCents}
            tableStatus="LESSON"
            connectionStatus="CONNECTED"
            tableMode={step.type === "ACTION_STEP" ? "live" : "replay"}
            forceDisableActions={
              step.type === "ACTION_STEP" &&
              (session.currentFeedback != null ||
                session.submitting ||
                (isMigratedActionStep && decisionRuntimeState !== "QUESTION"))
            }
            disabledActionMessage={
              session.submitting ? "Evaluating decision..." : "Action locked. Continue in the lesson panel."
            }
          />
        ) : (
          <View className="p-4">
            <Text variant="muted">Lesson snapshot unavailable.</Text>
          </View>
        )}
      </View>

      <View className="absolute inset-x-0" style={{ bottom: lessonSheetBottom }}>
        {sheetMinimized ? (
          <View className="mx-3">
            <Pressable
              onPress={() => setSheetMinimized(false)}
              className="rounded-2xl border border-border bg-panel/95 px-4 py-3"
              {...expandPanResponder.panHandlers}
            >
              <View className="items-center">
                <View className="h-1 w-10 rounded-full bg-border mb-2" />
              </View>
              <View className="flex-row items-center justify-between">
                <Text variant="label" className="text-sm">
                  Show Lesson
                </Text>
                <Text variant="muted" className="text-xs">
                  Step {session.currentVisibleStepNumber}/{session.visibleStepCount}
                </Text>
              </View>
            </Pressable>
          </View>
        ) : (
          <View className="mx-3 max-h-[58%] overflow-hidden rounded-2xl border border-border bg-panel/95">
            <ScrollView contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator>
              <View className="mx-4 mt-2 items-center" {...collapsePanResponder.panHandlers}>
                <View className="h-1 w-10 rounded-full bg-border" />
              </View>
              <View className="mx-4 mt-3 flex-row items-center justify-between gap-2">
                <View className="flex-row items-center gap-2 flex-wrap">
                  <View className="rounded-full border border-border bg-panel px-3 py-1">
                    <Text variant="label" className="text-xs">
                      Poker School
                    </Text>
                  </View>
                  {tierLabel ? (
                    <Text variant="muted" className="text-xs">
                      Included in: {tierLabel}
                    </Text>
                  ) : null}
                </View>
                <Pressable onPress={() => setSheetMinimized(true)} className="rounded-full border border-border bg-panel px-3 py-1">
                  <Text variant="muted" className="text-xs">
                    Minimize
                  </Text>
                </Pressable>
              </View>
              <View className="mx-4 mt-2">
                <Text variant="h2" className="text-base">
                  {session.lesson.title}
                </Text>
                <Text variant="muted" className="text-xs mt-1">
                  Step {session.currentVisibleStepNumber}/{session.visibleStepCount}
                </Text>
              </View>

              <LessonInstructorPanel
                step={step}
                feedback={session.currentFeedback}
                communityComparison={session.currentCommunityComparison}
                communityStatus={session.currentCommunityStatus}
                evaluating={isMigratedActionStep && (session.submitting || decisionRuntimeState === "SUBMITTING")}
                revealResults={isMigratedActionStep && decisionRuntimeState === "COMPLETE" ? revealResults : []}
              />

              <LessonQuestionPanel
                step={step}
                selectedOptionKey={session.selectedOptionKey}
                onSelectOption={(optionKey) => void session.submitMcqOption(step.id, optionKey)}
                loading={session.submitting}
                disabled={session.currentFeedback != null}
              />

              {step.type === "ACTION_STEP" && session.currentFeedback == null ? (
                <View className="mx-4 mt-2 rounded-lg border border-border bg-panel p-3">
                  <Text variant="muted" className="text-xs">
                    Answer with the live table action controls below.
                  </Text>
                </View>
              ) : null}

              {showStepNavigation ? (
                <View className="mx-4 mt-3 flex-row gap-2">
                  <View className="flex-1">
                    <Button
                      title={answeredQuestionStep ? "Retry" : "Prev"}
                      onPress={() => {
                        if (answeredQuestionStep) {
                          session.retryCurrentStep();
                          if (isMigratedActionStep) {
                            resetDecisionRuntime();
                            void loadDecisionRuntime();
                          }
                          return;
                        }
                        if (showInfoNavigation) {
                          session.goPrev();
                          return;
                        }
                      }}
                      disabled={showInfoNavigation ? !session.canGoPrev : false}
                      minWidth={0}
                      className="w-full"
                      variant="ghost"
                    />
                  </View>
                  <View className="flex-1">
                    <Button
                      title="Next"
                      onPress={() => void continueToNextQuestion()}
                      disabled={advancing}
                      minWidth={0}
                      className="w-full"
                    />
                  </View>
                </View>
              ) : null}
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );
}
