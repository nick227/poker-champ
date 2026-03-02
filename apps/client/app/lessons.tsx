import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { BottomBar } from "@/components/containers/BottomBar";
import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/components/domain/lobby/Masthead";
import { OnlinePlayersSheet } from "@/components/domain/lobby/OnlinePlayersSheet";
import { AppTopNav } from "@/components/domain/navigation/AppTopNav";
import { useBankroll } from "@/hooks/useBankroll";
import { useProfile } from "@/hooks/useProfile";
import { storeRegistry } from "@/registry/store.registry";
import { useLobbyRealtimeBridge } from "@/realtime/lobbyRealtimeBridge";
import { lessonService } from "@/features/lessons/lesson.service";

type LessonState = "not_started" | "in_progress" | "completed";
type LessonRole = "teaches" | "drills" | "tests";
type Difficulty = "Beginner" | "Core" | "Advanced";
type ModuleCode =
  | "A_STOP_BLEEDING_PREFLOP"
  | "B_WIN_MORE_FLOPS"
  | "C_CLOSE_HAND_PROFITABLY";

type LessonCatalogItem = {
  id: string;
  title: string;
  outcome: string;
  moduleCode: ModuleCode;
  difficulty: Difficulty;
  estimatedMinutes: number;
  role: LessonRole;
  tags: string[];
  state: LessonState;
  enabled: boolean;
  repeatable: boolean;
  completedAttempts?: number;
  bestScorePct?: number | null;
  currentStepIndex?: number;
  lastAttemptedAt?: string | null;
  lastScorePct?: number | null;
  tier?: string | null;
  applyCtaText?: string | null;
  recommendedOrder: number;
};

type RemoteLessonSummary = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  difficulty: string;
  estimatedMinutes?: number | null;
  version: number;
  totalSteps: number;
  progressState?: LessonState;
  inProgressAttemptId?: string | null;
  currentStepIndex?: number;
  lastScorePct?: number | null;
  lastAttemptedAt?: string | null;
  tier?: string | null;
  applyCtaText?: string | null;
  hasAccess?: boolean;
  moduleCode: ModuleCode;
  role: LessonRole;
  repeatable: boolean;
  completedAttempts?: number;
  bestScorePct?: number | null;
  recommendedOrder: number;
  conceptTags?: string[];
};

const MODULE_META: Record<ModuleCode, { title: string; promise: string }> = {
  A_STOP_BLEEDING_PREFLOP: {
    title: "Module A: Stop Bleeding Preflop",
    promise: "Fix high-frequency preflop leaks before they tax your winrate.",
  },
  B_WIN_MORE_FLOPS: {
    title: "Module B: Win More Flops",
    promise: "Improve c-bet, check-back, and defense decision quality.",
  },
  C_CLOSE_HAND_PROFITABLY: {
    title: "Module C: Close The Hand Profitably",
    promise: "Sharpen turn and river decisions where edges are thinner but valuable.",
  },
};

function normalizeDifficulty(value: string): Difficulty {
  const v = value.toLowerCase();
  if (v.includes("advanced")) return "Advanced";
  if (v.includes("core") || v.includes("intermediate")) return "Core";
  return "Beginner";
}

function stateChip(state: LessonState) {
  switch (state) {
    case "completed":
      return { label: "Completed", cls: "bg-success/20 text-success" };
    case "in_progress":
      return { label: "In Progress", cls: "bg-brand/20 text-brand" };
    default:
      return { label: "Not Started", cls: "bg-panel text-muted" };
  }
}

function difficultyChip(difficulty: Difficulty) {
  switch (difficulty) {
    case "Advanced":
      return "bg-danger/20 text-danger";
    case "Core":
      return "bg-warning/20 text-warning";
    default:
      return "bg-success/20 text-success";
  }
}

function actionLabel(item: LessonCatalogItem) {
  if (!item.enabled) return item.applyCtaText?.trim() || "Locked";
  if (item.state === "in_progress") {
    const step = Math.max(1, (item.currentStepIndex ?? 0) + 1);
    return `Resume Step ${step}`;
  }
  if (item.state === "completed") return "Review";
  return "Start Lesson";
}

export default function LessonsScreen() {
  const router = useRouter();
  const profile = useProfile();
  const bankroll = useBankroll();
  const { onlineTotal, onlinePlayers, onlineBusy, onlineError } = storeRegistry.use.lobby();
  const { requestOnlinePlayers } = useLobbyRealtimeBridge();

  const [onlineSheetVisible, setOnlineSheetVisible] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [remoteLessons, setRemoteLessons] = useState<RemoteLessonSummary[]>([]);
  const [cadenceLast7Days, setCadenceLast7Days] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoadingCatalog(true);
      setCatalogError(null);
      try {
        const listRes = await lessonService.listLessons();
        if (cancelled) return;
        setCadenceLast7Days(listRes.cadence?.completedAttemptsLast7Days ?? 0);
        setRemoteLessons(
          (listRes.lessons ?? []).map((item) => ({
            id: item.id,
            slug: item.slug,
            title: item.title,
            description: item.description ?? null,
            difficulty: item.difficulty,
            estimatedMinutes: item.estimatedMinutes ?? null,
            version: item.version,
            totalSteps: item.totalSteps,
            progressState: item.progressState,
            inProgressAttemptId: item.inProgressAttemptId ?? null,
            currentStepIndex: item.currentStepIndex ?? 0,
            lastScorePct: item.lastScorePct ?? null,
            lastAttemptedAt: item.lastAttemptedAt ?? null,
            tier: item.tier ?? null,
            applyCtaText: item.applyCtaText ?? null,
            hasAccess: item.hasAccess ?? false,
            moduleCode: item.moduleCode,
            role: item.role,
            repeatable: item.repeatable,
            completedAttempts: item.completedAttempts ?? 0,
            bestScorePct: item.bestScorePct ?? null,
            recommendedOrder: item.recommendedOrder,
            conceptTags: item.conceptTags ?? [],
          })),
        );
      } catch (err) {
        if (cancelled) return;
        setCatalogError(err instanceof Error ? err.message : "Failed to load lessons catalog.");
      } finally {
        if (!cancelled) setLoadingCatalog(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const openOnlineSheet = useCallback(() => {
    setOnlineSheetVisible(true);
    requestOnlinePlayers();
  }, [requestOnlinePlayers]);

  const openLesson = useCallback(
    (lessonId: string, enabled: boolean) => {
      if (!enabled) return;
      router.push(`/lesson/${lessonId}`);
    },
    [router],
  );

  const onlineLabel = onlineTotal === 1 ? "1 Online" : `${onlineTotal} Online`;

  const catalog = useMemo(() => {
    return remoteLessons
      .map((remote) => ({
        id: remote.id,
        title: remote.title,
        outcome: remote.description ?? "Learn to make higher-EV decisions with practical correction loops.",
        moduleCode: remote.moduleCode,
        difficulty: normalizeDifficulty(remote.difficulty),
        estimatedMinutes: remote.estimatedMinutes ?? 8,
        role: remote.role,
        tags: remote.conceptTags ?? [],
        state: remote.progressState ?? "not_started",
        // Backward-compatible default: if older API payloads omit hasAccess,
        // keep lessons interactive and let server enforce on detail routes.
        enabled: remote.hasAccess !== false,
        repeatable: remote.repeatable,
        completedAttempts: remote.completedAttempts ?? 0,
        bestScorePct: remote.bestScorePct ?? null,
        currentStepIndex: remote.currentStepIndex ?? 0,
        lastAttemptedAt: remote.lastAttemptedAt ?? null,
        lastScorePct: remote.lastScorePct ?? null,
        tier: remote.tier ?? null,
        applyCtaText: remote.applyCtaText ?? null,
        recommendedOrder: remote.recommendedOrder,
      }))
      .sort((a, b) => {
        if (a.moduleCode !== b.moduleCode) {
          return a.moduleCode.localeCompare(b.moduleCode);
        }
        const aOrder = a.recommendedOrder;
        const bOrder = b.recommendedOrder;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.title.localeCompare(b.title);
      });
  }, [remoteLessons]);

  const startableLessons = useMemo(() => catalog.filter((item) => item.enabled), [catalog]);
  const completedCount = useMemo(() => catalog.filter((item) => item.state === "completed").length, [catalog]);

  const inProgressLesson = useMemo(
    () => catalog.find((item) => item.enabled && item.state === "in_progress") ?? null,
    [catalog],
  );

  const firstLesson = useMemo(
    () => startableLessons[0] ?? null,
    [startableLessons],
  );

  const recentCompletedLessons = useMemo(
    () =>
      catalog
        .filter((item) => item.enabled && item.state === "completed")
        .sort((a, b) => {
          const aTs = a.lastAttemptedAt ? new Date(a.lastAttemptedAt).getTime() : 0;
          const bTs = b.lastAttemptedAt ? new Date(b.lastAttemptedAt).getTime() : 0;
          return bTs - aTs;
        })
        .slice(0, 3),
    [catalog],
  );
  const liveDrills = useMemo(
    () =>
      catalog
        .filter((item) => item.enabled && (item.repeatable || item.role === "drills"))
        .sort((a, b) => {
          if (a.state !== b.state) {
            if (a.state === "in_progress") return -1;
            if (b.state === "in_progress") return 1;
          }
          return a.title.localeCompare(b.title);
        }),
    [catalog],
  );

  const moduleSections = useMemo(() => {
    const grouped: Record<ModuleCode, LessonCatalogItem[]> = {
      A_STOP_BLEEDING_PREFLOP: [],
      B_WIN_MORE_FLOPS: [],
      C_CLOSE_HAND_PROFITABLY: [],
    };
    for (const item of catalog) grouped[item.moduleCode].push(item);
    return grouped;
  }, [catalog]);

  const nonEmptyModuleCodes = useMemo(
    () =>
      (Object.keys(moduleSections) as ModuleCode[]).filter(
        (moduleCode) => moduleSections[moduleCode].length > 0,
      ),
    [moduleSections],
  );

  return (
    <Screen>
      <Masthead />
      <AppTopNav
        username={profile.username ?? "Player"}
        onlineLabel={onlineLabel}
        onPressOnline={openOnlineSheet}
        amountCents={bankroll.cents}
        avatarUrl={profile.avatarUrl}
      />

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 28 }} showsVerticalScrollIndicator>
        <View className="rounded-2xl border-2 border-border bg-panel p-5 shadow-sm">
          <Text variant="label" className="text-brand font-semibold uppercase tracking-wide">
            Poker School
          </Text>
          <Text variant="h1" className="mt-2 text-2xl font-bold leading-tight">
            Fix The Decisions Costing You Real Money.
          </Text>
          <Text variant="muted" className="mt-2">
            5-10 real decision reps per lesson. Immediate feedback. No fluff.
          </Text>

          <View className="mt-4 rounded-xl border border-border bg-background p-3">
            <Text variant="label">Progress</Text>
            <Text variant="body" className="mt-1">
              {completedCount}/{catalog.length} lessons completed
            </Text>
            {cadenceLast7Days > 0 ? (
              <Text variant="muted" className="mt-1 text-xs">
                Trained {cadenceLast7Days} time{cadenceLast7Days !== 1 ? "s" : ""} in the last 7 days.
              </Text>
            ) : null}
          </View>

          <View className="mt-4">
            <Button
              title={inProgressLesson ? "Continue Training" : "Start First Lesson"}
              onPress={() => {
                const target = inProgressLesson ?? firstLesson;
                if (!target) return;
                openLesson(target.id, target.enabled);
              }}
              disabled={!inProgressLesson && !firstLesson}
              minWidth={0}
              className="w-full"
            />
          </View>
        </View>

        {inProgressLesson || recentCompletedLessons.length > 0 ? (
          <View className="mt-5 rounded-xl border border-border bg-panel p-3">
            <Text variant="h2" className="text-base">
              Continue / Recently Completed
            </Text>

            {inProgressLesson ? (
              <View className="mt-3 rounded-lg border border-border bg-background p-3" testID={`continue-card-${inProgressLesson.id}`}>
                <Text variant="label">Continue where you left off</Text>
                <Text variant="body" className="mt-1 font-semibold">
                  {inProgressLesson.title}
                </Text>
                <Text variant="muted" className="mt-1 text-xs">
                  Step {Math.max(1, (inProgressLesson.currentStepIndex ?? 0) + 1)} in progress
                </Text>
                <View className="mt-3">
                  <Button
                    title={`Resume Step ${Math.max(1, (inProgressLesson.currentStepIndex ?? 0) + 1)}`}
                    onPress={() => openLesson(inProgressLesson.id, inProgressLesson.enabled)}
                    minWidth={0}
                    className="w-full"
                  />
                </View>
              </View>
            ) : null}

            {recentCompletedLessons.length > 0 ? (
              <View className="mt-3 gap-2">
                <Text variant="label">Recently completed</Text>
                {recentCompletedLessons.map((lesson) => (
                  <Pressable
                    key={lesson.id}
                    onPress={() => openLesson(lesson.id, lesson.enabled)}
                    className="rounded-lg border border-border bg-background p-3 active:opacity-85"
                    testID={`recent-completed-${lesson.id}`}
                  >
                    <View className="flex-row items-center justify-between">
                      <Text variant="body" className="font-semibold">
                        {lesson.title}
                      </Text>
                      <Text variant="caption">{lesson.lastScorePct != null ? `${lesson.lastScorePct}%` : "Completed"}</Text>
                    </View>
                    <Text variant="muted" className="mt-1 text-xs">
                      {lesson.lastAttemptedAt
                        ? `Completed ${new Date(lesson.lastAttemptedAt).toLocaleDateString()}`
                        : "Recently completed"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {liveDrills.length > 0 ? (
          <View className="mt-5 rounded-xl border border-border bg-panel p-3">
            <View className="flex-row items-center justify-between">
              <Text variant="h2" className="text-base">
                Live Drills
              </Text>
              <Text variant="caption">{liveDrills.length} available</Text>
            </View>
            <Text variant="muted" className="mt-1 text-xs">
              Repeatable reps tied to lesson concepts.
            </Text>
            <View className="mt-3 gap-2">
              {liveDrills.map((drill) => {
                const chip = stateChip(drill.state);
                return (
                  <Pressable
                    key={drill.id}
                    onPress={() => openLesson(drill.id, drill.enabled)}
                    className="rounded-lg border border-border bg-background p-3 active:opacity-85"
                    testID={`drill-card-${drill.id}`}
                  >
                    <View className="flex-row items-center justify-between">
                      <Text variant="body" className="font-semibold flex-1">
                        {drill.title}
                      </Text>
                      <View className={`rounded-full px-2 py-0.5 ${chip.cls}`}>
                        <Text variant="caption">{chip.label}</Text>
                      </View>
                    </View>
                    <Text variant="muted" className="mt-1 text-xs">
                      {drill.outcome}
                    </Text>
                    <View className="mt-2 flex-row flex-wrap gap-2">
                      <View className="rounded-full bg-panel px-2 py-0.5">
                        <Text variant="caption">{drill.estimatedMinutes} min</Text>
                      </View>
                      <View className="rounded-full bg-panel px-2 py-0.5">
                        <Text variant="caption">Attempts {drill.completedAttempts ?? 0}</Text>
                      </View>
                      {drill.bestScorePct != null ? (
                        <View className="rounded-full bg-panel px-2 py-0.5">
                          <Text variant="caption">Best {drill.bestScorePct}%</Text>
                        </View>
                      ) : null}
                    </View>
                    <View className="mt-3">
                      <Button
                        title={drill.state === "in_progress" ? "Resume Drill" : "Run Drill"}
                        onPress={() => openLesson(drill.id, drill.enabled)}
                        minWidth={0}
                        className="w-full"
                      />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View className="mt-5 gap-4">
          {nonEmptyModuleCodes.map((moduleCode) => {
            const lessons = moduleSections[moduleCode];
            const done = lessons.filter((item) => item.state === "completed").length;
            const pct = lessons.length > 0 ? Math.round((done / lessons.length) * 100) : 0;
            const meta = MODULE_META[moduleCode];

            return (
              <View key={moduleCode} className="rounded-xl border border-border bg-panel p-3">
                <View className="flex-row items-center justify-between">
                  <Text variant="h2" className="text-base">
                    {meta.title}
                  </Text>
                  <Text variant="caption">
                    {done}/{lessons.length} ({pct}%)
                  </Text>
                </View>
                <Text variant="muted" className="mt-1 text-xs">
                  {meta.promise}
                </Text>
                <View className="mt-3 h-2 overflow-hidden rounded-full bg-background">
                  <View className="h-full bg-brand" style={{ width: `${pct}%` }} />
                </View>

                <View className="mt-3 gap-2">
                  {lessons.map((item) => {
                    const chip = stateChip(item.state);
                    const tierLabel = item.tier === "elite" ? "Elite" : item.tier === "pro" ? "Pro" : null;

                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => openLesson(item.id, item.enabled)}
                        className="rounded-lg border border-border bg-background p-3 active:opacity-85"
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
                            <View className={`rounded-full px-2 py-0.5 ${chip.cls}`} testID={`lesson-state-${item.id}`}>
                              <Text variant="caption">{chip.label}</Text>
                            </View>
                          </View>
                        </View>
                        <Text variant="muted" className="mt-1 text-xs">
                          {item.outcome}
                        </Text>
                        <View className="mt-2 flex-row flex-wrap gap-2">
                          <View className={`rounded-full px-2 py-0.5 ${difficultyChip(item.difficulty)}`}>
                            <Text variant="caption">{item.difficulty}</Text>
                          </View>
                          <View className="rounded-full bg-panel px-2 py-0.5">
                            <Text variant="caption">{item.role}</Text>
                          </View>
                          <View className="rounded-full bg-panel px-2 py-0.5">
                            <Text variant="caption">{item.estimatedMinutes} min</Text>
                          </View>
                          {item.tags.slice(0, 2).map((tag) => (
                            <View key={`${item.id}-${tag}`} className="rounded-full bg-panel px-2 py-0.5">
                              <Text variant="caption">{tag}</Text>
                            </View>
                          ))}
                        </View>
                        <View className="mt-3">
                          <Button
                            title={actionLabel(item)}
                            onPress={() => openLesson(item.id, item.enabled)}
                            disabled={!item.enabled}
                            minWidth={0}
                            className="w-full"
                            variant={item.state === "in_progress" ? "primary" : "ghost"}
                          />
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}

          {nonEmptyModuleCodes.length === 0 ? (
            <View className="rounded-xl border border-border bg-panel p-3">
              <Text variant="label">No Lessons Loaded</Text>
              <Text variant="muted" className="mt-1 text-xs">
                Lessons will appear here after the catalog loads from the server seed.
              </Text>
            </View>
          ) : null}
        </View>

        {loadingCatalog ? (
          <View className="mt-4 rounded-xl border border-border bg-panel p-3">
            <Text variant="muted">Refreshing lesson catalog...</Text>
          </View>
        ) : null}
        {catalogError ? (
          <View className="mt-4 rounded-xl border border-border bg-panel p-3">
            <Text variant="danger">{catalogError}</Text>
          </View>
        ) : null}
      </ScrollView>

      <OnlinePlayersSheet
        visible={onlineSheetVisible}
        onClose={() => setOnlineSheetVisible(false)}
        players={onlinePlayers}
        loading={onlineBusy}
        error={onlineError}
        onRefresh={requestOnlinePlayers}
      />
      <BottomBar active="lessons" />
    </Screen>
  );
}
