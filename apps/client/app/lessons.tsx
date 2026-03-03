import { useCallback, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { BottomBar } from "@/components/containers/BottomBar";
import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/components/domain/lobby/Masthead";
import { OnlinePlayersSheet } from "@/components/domain/lobby/OnlinePlayersSheet";
import { AppTopNav } from "@/components/domain/navigation/AppTopNav";
import { useBankroll } from "@/hooks/useBankroll";
import { useProfile } from "@/hooks/useProfile";
import { storeRegistry } from "@/registry/store.registry";
import { useLobbyRealtimeBridge } from "@/realtime/lobbyRealtimeBridge";
import { LESSONS_PAGE_COPY } from "./lessons.data";
import {
  DailyChallengesSection,
  LESSONS_SECTION_ORDER,
  LessonsHeroCard,
  ModulesSection,
  RecentCompletedSection,
  StatusBanners,
} from "./lessons.components";
import { useLessonsPageViewModel } from "./useLessonsPageViewModel";

export default function LessonsScreen() {
  const router = useRouter();
  const profile = useProfile();
  const bankroll = useBankroll();
  const { onlineTotal, onlinePlayers, onlineBusy, onlineError } = storeRegistry.use.lobby();
  const { requestOnlinePlayers } = useLobbyRealtimeBridge();
  const vm = useLessonsPageViewModel();

  const [onlineSheetVisible, setOnlineSheetVisible] = useState(false);

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

  const onlineLabel =
    onlineTotal === 1
      ? LESSONS_PAGE_COPY.states.onlineSingle
      : `${onlineTotal} ${LESSONS_PAGE_COPY.states.onlineManySuffix}`;

  // Presentation Section Order:
  // Move items in LESSONS_SECTION_ORDER to safely re-order the page.
  const visibleSectionIds = useMemo(
    () =>
      LESSONS_SECTION_ORDER.filter((sectionId) => {
        if (sectionId === "daily-challenges") return vm.dailyChallenges.length > 0;
        return false;
      }),
    [vm.dailyChallenges.length],
  );

  // Flat section registry:
  // This keeps lessons.tsx as a layout/composition layer only.
  const sectionRegistry = {
    "daily-challenges": <DailyChallengesSection vm={vm} onOpenLesson={openLesson} />,
    "recent-completed": <RecentCompletedSection vm={vm} onOpenLesson={openLesson} />,
  };

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
        <LessonsHeroCard vm={vm} onOpenLesson={openLesson} />

        {visibleSectionIds.map((sectionId) => (
          <View key={sectionId}>
            {sectionRegistry[sectionId]}
          </View>
        ))}

        <ModulesSection vm={vm} onOpenLesson={openLesson} />
        <RecentCompletedSection vm={vm} onOpenLesson={openLesson} />
        <StatusBanners vm={vm} />
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
