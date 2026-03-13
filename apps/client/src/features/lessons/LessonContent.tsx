import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, View, Pressable, PanResponder, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { lessonService } from "./lesson.service";
import { ActiveTableView, ACTION_BAR_HEIGHT } from "@/features/table";
import { mapSeatsToOpponents } from "@/features/table";
import { buildTableSceneModel } from "@/features/table";
import { buildReplayDisabledSceneModel } from "@/components/replay/replaySceneModel";
import type { ActionBarOnAction } from "@/features/table";
import { isV2ConfiguredStep, useDecisionNodeRuntime } from "@/features/lessons-v2/runtime";
import { LessonInstructorPanel } from "./LessonInstructorPanel";
import { LessonQuestionPanel } from "./LessonQuestionPanel";
import { useLessonSession } from "./useLessonSession";
import type { LessonDefinition } from "./lesson.types";
import { useLessonContentViewModel } from "./useLessonContentViewModel";
import type { AwardGrant } from "@/types/awards";
import { AwardToaster } from "@/components/domain/awards/AwardToaster";
import { useAuthStore } from "@/stores/auth.store";
import {
  LESSON_CONTENT_BUTTON_KEYS,
  LESSON_CONTENT_COPY,
  getLessonButtonLabel,
} from "./lessonContent.data";

function LessonStateView({
  message,
  tone = "muted",
  onRetry,
}: {
  message: string;
  tone?: "muted" | "danger";
  onRetry?: () => void;
}) {
  return (
    <View className="p-4 gap-2">
      <Text variant="muted" className={tone === "danger" ? "text-danger" : undefined}>
        {message}
      </Text>
      {onRetry ? <Button title={getLessonButtonLabel(LESSON_CONTENT_BUTTON_KEYS.RETRY)} onPress={onRetry} /> : null}
    </View>
  );
}

function LessonCompletionView({
  lesson,
  scorePct,
  ghostSummary = null,
  bootCampComplete,
  onApplyAtTable,
  onBackToBootCamp,
  awardsGranted,
  onDismissAwards,
}: {
  lesson: LessonDefinition;
  scorePct: number | null;
  ghostSummary?: { matchedProCount: number; totalDecisions: number; accuracyPercent: number } | null;
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

  const completionSections = useMemo(() => {
    const sections: Array<{ id: string; title: string; body: string }> = [];
    if (ghostSummary && ghostSummary.totalDecisions > 0) {
      sections.push({
        id: "ghost-match",
        title: "Decisions",
        body: `You matched the pro on ${ghostSummary.matchedProCount} / ${ghostSummary.totalDecisions} decisions`,
      });
      sections.push({
        id: "ghost-accuracy",
        title: "Accuracy",
        body: `${ghostSummary.accuracyPercent}%`,
      });
    }
    if (scorePct != null) {
      sections.push({
        id: "score",
        title: LESSON_CONTENT_COPY.completion.scoreHeading,
        body: `${Math.round(scorePct)}%`,
      });
    }
    if (disciplines.length > 0) {
      sections.push({
        id: "disciplines",
        title: LESSON_CONTENT_COPY.completion.disciplinesHeading,
        body: disciplines.join(" - "),
      });
    }
    return sections;
  }, [disciplines, scorePct, ghostSummary]);

  const relatedLinks = useMemo(() => {
    const links: Array<{ id: string; buttonKey: keyof typeof LESSON_CONTENT_BUTTON_KEYS; onPress: () => void }> = [];
    const blogPostSlug = lesson.blogPostSlug?.trim();
    if (blogPostSlug) {
      links.push({
        id: "blog-post",
        buttonKey: "READ_BLOG_POST",
        onPress: () => router.push(`/blog/${encodeURIComponent(blogPostSlug)}`),
      });
    }

    const replayHandId = lesson.replayHandId?.trim();
    if (replayHandId) {
      links.push({
        id: "replay-hand",
        buttonKey: ghostSummary ? "WATCH_FULL_HAND" : "REPLAY_HAND",
        onPress: () => router.push(`/replay/${encodeURIComponent(replayHandId)}`),
      });
    }

    return links;
  }, [lesson.blogPostSlug, lesson.replayHandId, router, ghostSummary]);

  const actionButtons = useMemo(() => {
    const buttons: Array<{
      id: string;
      key: keyof typeof LESSON_CONTENT_BUTTON_KEYS;
      onPress: () => void;
      variant?: "ghost";
      context?: { applyCtaText?: string | null };
    }> = [];

    if (onApplyAtTable) {
      buttons.push({
        id: "apply-at-table",
        key: "APPLY_AT_TABLE",
        onPress: onApplyAtTable,
        context: { applyCtaText: lesson.applyCtaText },
      });
    }

    buttons.push({
      id: "back-to-boot-camp",
      key: bootCampComplete ? "CONTINUE_ADVANCED_DRILLS" : "BACK_TO_BOOTCAMP",
      onPress: onBackToBootCamp,
      variant: "ghost",
    });

    return buttons;
  }, [bootCampComplete, lesson.applyCtaText, onApplyAtTable, onBackToBootCamp]);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }} showsVerticalScrollIndicator>
      {awardsGranted && awardsGranted.length > 0 && onDismissAwards ? (
        <View className="mb-3">
          <AwardToaster awards={awardsGranted} onDismiss={onDismissAwards} />
        </View>
      ) : null}

      <View className="rounded-2xl border-2 border-border bg-panel p-5">
        <Text variant="label" className="text-brand font-semibold uppercase tracking-wide">
          {LESSON_CONTENT_COPY.completion.badge}
        </Text>

        {bootCampComplete ? (
          <View className="mt-2 rounded-lg border border-brand/40 bg-brand/10 px-3 py-2">
            <Text variant="label" className="text-brand">
              {LESSON_CONTENT_COPY.completion.bootCampCertified}
            </Text>
          </View>
        ) : null}

        <Text variant="body" className="mt-2">
          {lesson.title}
        </Text>

        <View className="mt-3 rounded-xl border border-border bg-background p-3">
          <Text variant="label" className="text-xs">
            {LESSON_CONTENT_COPY.completion.completedSectionHeading}
          </Text>
          {completionSections.map((section) => (
            <View
              key={section.id}
              className={
                section.id === "score"
                  ? "mt-2 rounded-xl bg-panel p-3"
                  : "mt-2 rounded-xl border border-border bg-panel p-3"
              }
            >
              <Text variant="label">{section.title}</Text>
              <Text variant={section.id === "score" ? "h2" : "body"} className="mt-1">
                {section.body}
              </Text>
            </View>
          ))}

          <Text variant="muted" className="mt-3 text-sm">
            {LESSON_CONTENT_COPY.completion.applySummary}
          </Text>

          {relatedLinks.length > 0 ? (
            <View className="mt-3 rounded-xl border border-border bg-panel p-3">
              <Text variant="label" className="text-xs">
                {LESSON_CONTENT_COPY.completion.relatedHeading}
              </Text>
              <View className="mt-2 flex-row flex-wrap gap-2">
                {relatedLinks.map((link) => (
                  <Button
                    key={link.id}
                    title={getLessonButtonLabel(LESSON_CONTENT_BUTTON_KEYS[link.buttonKey])}
                    onPress={link.onPress}
                    intent="neutral"
                    size="sm"
                    textClassName="text-sm text-brand"
                    className="min-h-[32px] border-border bg-background px-3 py-2"
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>

        <View className="mt-3 rounded-xl border border-border bg-background p-3">
          <Text variant="label" className="text-xs">
            {LESSON_CONTENT_COPY.completion.continueSectionHeading}
          </Text>
          <View className="mt-2 gap-3">
            {actionButtons.map((button) => (
              <Button
                key={button.id}
                title={getLessonButtonLabel(LESSON_CONTENT_BUTTON_KEYS[button.key], button.context)}
                onPress={button.onPress}
                variant={button.variant}
              />
            ))}
          </View>
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
  const { height: windowHeight } = useWindowDimensions();
  const authHydrated = useAuthStore((s) => s.hydrated);
  const session = useLessonSession(lessonId, enabled && authHydrated);
  const [bootCampComplete, setBootCampComplete] = useState<boolean>(false);
  const [advancing, setAdvancing] = useState(false);
  const [sheetMinimized, setSheetMinimized] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

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
  const stepSnapshot = step?.snapshot ?? null;
  const isMigratedActionStep = Boolean(step && step.type === "ACTION_STEP" && isV2ConfiguredStep(step));
  const decisionRuntime = useDecisionNodeRuntime({
    step: isMigratedActionStep ? step : null,
    lessonId: lessonId ?? undefined,
    attemptId: session.attempt?.id,
  });
  const {
    state: decisionRuntimeState,
    error: decisionRuntimeError,
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

  const opponents = useMemo(() => (stepSnapshot ? mapSeatsToOpponents(stepSnapshot) : []), [stepSnapshot]);

  const sceneModel = useMemo(() => {
    if (!stepSnapshot || !step) return null;
    const base = buildTableSceneModel(stepSnapshot, null, "CONNECTED");
    if (step.type === "ACTION_STEP") return base;
    return buildReplayDisabledSceneModel(base);
  }, [stepSnapshot, step]);

  const handleAction = useCallback<ActionBarOnAction>(
    async (payload) => {
      if (!step) return;
      if (session.currentFeedback != null) return;
      const enriched =
        payload.type === "ALL_IN" &&
        payload.amount == null &&
        sceneModel?.heroStackCents != null
          ? { ...payload, amount: sceneModel.heroStackCents }
          : payload;
      if (!isMigratedActionStep) {
        await session.submitAction(enriched);
        return;
      }
      if (session.submitting || decisionRuntimeState === "SUBMITTING") return;
      await session.submitAction(enriched);
      if (decisionRuntimeState === "QUESTION") {
        await submitDecisionRuntime(payload);
      }
    },
    [step, isMigratedActionStep, session, decisionRuntimeState, submitDecisionRuntime, sceneModel?.heroStackCents],
  );

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
      const nextLessonId = await lessonService.getNextLessonId(lessonId);
      if (nextLessonId && onOpenLesson) {
        onOpenLesson(nextLessonId);
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

  const shouldShowCompletion =
    session.attempt?.status === "COMPLETED" &&
    step?.type === "INFO_STEP" &&
    session.currentFeedback == null;

  const isQuestionStep = step?.type === "ACTION_STEP" || step?.type === "MCQ_STEP";
  const awaitingQuestionAnswer = isQuestionStep && session.currentFeedback == null;
  const answeredQuestionStep = isQuestionStep && session.currentFeedback != null;
  const showInfoNavigation = step?.type === "INFO_STEP";
  const showQuestionNavigation = answeredQuestionStep;
  const showStepNavigation = showInfoNavigation || showQuestionNavigation;
  const showDecisionRuntimeError =
    isMigratedActionStep && decisionRuntimeState === "ERROR" && session.currentFeedback == null;

  const tierLabel =
    session.lesson?.tier === "elite" ? "Elite" : session.lesson?.tier === "pro" ? "Pro" : null;
  const streetLabel =
    stepSnapshot?.hand?.street != null
      ? (["PREFLOP", "FLOP", "TURN", "RIVER", "SHOWDOWN"] as const).includes(
          String(stepSnapshot.hand.street).toUpperCase() as "PREFLOP" | "FLOP" | "TURN" | "RIVER" | "SHOWDOWN",
        )
        ? { PREFLOP: "Preflop", FLOP: "Flop", TURN: "Turn", RIVER: "River", SHOWDOWN: "Showdown" }[
            String(stepSnapshot.hand.street).toUpperCase() as "PREFLOP" | "FLOP" | "TURN" | "RIVER" | "SHOWDOWN"
          ]
        : String(stepSnapshot.hand.street)
      : null;
  const reservedBottom = ACTION_BAR_HEIGHT + 24 + 80;
  const lessonSheetMaxHeight = Math.min(windowHeight * 0.7, Math.max(200, windowHeight - reservedBottom));
  const { headerBadges, navigationButtons } = useLessonContentViewModel({
    tierLabel,
    streetLabel,
    showStepNavigation,
    answeredQuestionStep,
    showInfoNavigation,
    canGoPrev: session.canGoPrev,
    isMigratedActionStep,
    advancing,
    onRetry: () => {
      session.retryCurrentStep();
      setRetryNonce((prev) => prev + 1);
    },
    onReloadDecisionRuntime: () => {
      resetDecisionRuntime();
      void loadDecisionRuntime();
    },
    onPrev: session.goPrev,
    onNext: () => void continueToNextQuestion(),
  });

  if (!enabled) {
    return <LessonStateView message={LESSON_CONTENT_COPY.states.disabled} tone="muted" />;
  }

  if (!authHydrated || session.loading) {
    return <LessonStateView message={LESSON_CONTENT_COPY.states.loading} tone="muted" />;
  }

  if (session.error) {
    return <LessonStateView message={session.error} tone="danger" onRetry={() => void session.refresh()} />;
  }

  if (!session.lesson) {
    return <LessonStateView message={LESSON_CONTENT_COPY.states.unavailable} tone="muted" />;
  }

  if (shouldShowCompletion) {
    return (
      <LessonCompletionView
        lesson={session.lesson}
        scorePct={session.attempt?.scorePct ?? null}
        ghostSummary={session.attempt?.summaryJson ?? null}
        bootCampComplete={bootCampComplete}
        onApplyAtTable={onApplyAtTable}
        onBackToBootCamp={() => onClose?.()}
        awardsGranted={session.lastAwardsGranted}
        onDismissAwards={session.clearLastAwardsGranted}
      />
    );
  }

  if (!step) {
    return <LessonStateView message={LESSON_CONTENT_COPY.states.unavailable} tone="muted" />;
  }
  if (!stepSnapshot) {
    return <LessonStateView message={LESSON_CONTENT_COPY.states.snapshotUnavailable} tone="muted" />;
  }

  return (
    <View className="flex-1">
      <View className="flex-1" style={{ minHeight: 0, overflow: "hidden", zIndex: 2 }} testID="lesson-table-wrapper">
        {sceneModel ? (
          <ActiveTableView
            key={`${step.id}:${retryNonce}`}
            snapshot={stepSnapshot}
            sceneModel={sceneModel}
            onAction={handleAction}
            opponents={opponents}
            balanceCents={balanceCents}
            tableStatus="LESSON"
            connectionStatus="CONNECTED"
            tableMode="live"
            showHeroStats={false}
            forceDisableActions={
              step.type === "ACTION_STEP" &&
              (session.currentFeedback != null ||
                session.submitting ||
                (isMigratedActionStep && decisionRuntimeState === "SUBMITTING"))
            }
            forceActionBarInteractive={
              step.type === "ACTION_STEP" &&
              session.currentFeedback == null &&
              !session.submitting &&
              !(isMigratedActionStep && decisionRuntimeState === "SUBMITTING")
            }
            disabledActionMessage={
              session.submitting ? LESSON_CONTENT_COPY.states.evaluatingDecision : LESSON_CONTENT_COPY.states.actionLocked
            }
          />
        ) : null}
      </View>

      <View
        className="mt-2"
        style={{ zIndex: 1 }}
        pointerEvents="none"
        testID="lesson-sheet"
      >
        {sheetMinimized ? (
          <View className="mx-3" style={{ zIndex: 3 }} pointerEvents="auto">
            <Pressable
              onPress={() => setSheetMinimized(false)}
              className="rounded-t-2xl border-t-2 border-border bg-panel-elevated px-4 py-3 shadow-lg"
              {...expandPanResponder.panHandlers}
            >
              <View className="items-center">
                <View className="h-1 w-10 rounded-full bg-border mb-2" />
              </View>
              <View className="flex-row items-center justify-between">
                <Text variant="label" className="text-sm">
                  {getLessonButtonLabel(LESSON_CONTENT_BUTTON_KEYS.SHOW_LESSON)}
                </Text>
                <Text variant="muted" className="text-xs">
                  {LESSON_CONTENT_COPY.panel.stepLabel} {session.currentVisibleStepNumber}/{session.visibleStepCount}
                </Text>
              </View>
            </Pressable>
          </View>
        ) : (
          <View
            className="mx-3 overflow-hidden rounded-t-2xl border-t-2 border-border bg-panel-elevated shadow-2xl"
            style={{ maxHeight: lessonSheetMaxHeight, zIndex: 3 }}
            pointerEvents="auto"
          >
            <View className="flex-col" style={{ maxHeight: lessonSheetMaxHeight }}>
              <View className="mx-4 mt-2 items-center" {...collapsePanResponder.panHandlers}>
                <View className="h-1 w-10 rounded-full bg-border" />
              </View>

              <View className="mx-4 mt-2 h-[1px] bg-border/60" />

              <View className="mx-4 mt-3 mb-2 flex-row items-center justify-between gap-2">
                <View className="flex-row items-center gap-2 flex-wrap">
                  {headerBadges.map((badge) =>
                    badge.type === "chip" ? (
                      <View key={badge.id} className="rounded-full border border-border bg-panel px-3 py-1">
                        <Text variant="label" className="text-xs">
                          {badge.content}
                        </Text>
                      </View>
                    ) : (
                      <Text key={badge.id} variant="muted" className="text-xs">
                        {badge.content}
                      </Text>
                    ),
                  )}
                </View>

                <Button
                  title={getLessonButtonLabel(LESSON_CONTENT_BUTTON_KEYS.MINIMIZE)}
                  onPress={() => setSheetMinimized(true)}
                  intent="neutral"
                  size="sm"
                  textClassName="text-xs text-muted"
                  className="min-h-[30px] bg-panel px-3 py-1"
                />
              </View>

              <View className="mx-4 mt-2">
                {[session.lesson.title, `${LESSON_CONTENT_COPY.panel.stepLabel} ${session.currentVisibleStepNumber}/${session.visibleStepCount}`].map(
                  (line, index) => (
                    <Text
                      key={`${line}-${index}`}
                      variant={index === 0 ? "h2" : "muted"}
                      className={index === 0 ? "text-base" : "text-xs mt-1"}
                    >
                      {line}
                    </Text>
                  ),
                )}
              </View>

              <View style={{ flexGrow: 1, flexShrink: 1 }}>
                <ScrollView
                  style={{ flexGrow: 1 }}
                  contentContainerStyle={{ paddingBottom: 12 }}
                  showsVerticalScrollIndicator
                >
                  <LessonInstructorPanel
                    step={step}
                    feedback={session.currentFeedback}
                    communityComparison={session.currentCommunityComparison}
                    communityStatus={session.currentCommunityStatus}
                    evaluating={isMigratedActionStep && (session.submitting || decisionRuntimeState === "SUBMITTING")}
                    revealResults={isMigratedActionStep && decisionRuntimeState === "COMPLETE" ? revealResults : []}
                  />

                  {showDecisionRuntimeError ? (
                    <View className="mx-4 mt-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
                      <Text variant="muted" className="text-xs">
                        {decisionRuntimeError || LESSON_CONTENT_COPY.states.runtimeUnavailable}
                      </Text>
                      <View className="mt-2">
                        <Button
                          title={getLessonButtonLabel(LESSON_CONTENT_BUTTON_KEYS.RETRY)}
                          onPress={() => {
                            resetDecisionRuntime();
                            void loadDecisionRuntime();
                          }}
                          intent="neutral"
                          size="sm"
                          className="min-h-[32px] self-start px-3"
                          textClassName="text-xs"
                        />
                      </View>
                    </View>
                  ) : null}

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
                        {LESSON_CONTENT_COPY.panel.actionHint}
                      </Text>
                    </View>
                  ) : null}
                </ScrollView>
              </View>

              {showStepNavigation ? (
                <View className="mx-4 mb-3 mt-3 flex-row gap-2" pointerEvents="box-none">
                  {navigationButtons.map((button) => (
                    <View key={button.id} className="flex-1">
                      <Button
                        title={getLessonButtonLabel(LESSON_CONTENT_BUTTON_KEYS[button.key])}
                        onPress={button.onPress}
                        disabled={button.disabled}
                        minWidth={0}
                        className="w-full"
                        variant={button.variant}
                      />
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

