import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { Screen } from "@/components/containers/Screen";
import { Surface } from "@/components/containers/Surface";
import { TableStatusStrip, TournamentResultBanner } from "@/features/table";
import type { TableDisplayState } from "@/features/table-page/tableDisplayState";
import {
  BOARD_RESET_FADE_MS,
  WINNER_HOLD_MS,
  useLiveTableStatusStripState,
} from "@/features/table-page/useLiveTableStatusStripState";

type FixtureId = "eliminated" | "winner";

const BASE_NOW_TS = Date.UTC(2026, 4, 23, 12, 0, 0);
const COMPLETED_HAND_ID = "hand-final";

const tournamentOverlay = {
  tournamentId: "t-e2e-freezeout",
  status: "FINISHED" as const,
  currentLevel: 1,
  smallBlindCents: 50,
  bigBlindCents: 100,
  anteCents: 0,
  playFormat: "FREEZEOUT" as const,
};

const FIXTURES: Record<
  FixtureId,
  {
    label: string;
    tournamentStatus: "FINISHED";
    tournamentViewer: {
      isEliminated: boolean;
      isWinner: boolean;
      finishPlace: number;
      payoutCents: number;
    };
  }
> = {
  eliminated: {
    label: "Busted player",
    tournamentStatus: "FINISHED",
    tournamentViewer: {
      isEliminated: true,
      isWinner: false,
      finishPlace: 2,
      payoutCents: 0,
    },
  },
  winner: {
    label: "Tournament winner",
    tournamentStatus: "FINISHED",
    tournamentViewer: {
      isEliminated: false,
      isWinner: true,
      finishPlace: 1,
      payoutCents: 2000,
    },
  },
};

function makeWinnerHoldDisplay(): TableDisplayState {
  return {
    phase: "inHand",
    handId: null,
    completedHandId: COMPLETED_HAND_ID,
    heroUserId: "hero",
    notice: null,
    winnerMessage: "Hand complete",
    heroPrompt: null,
    passiveMessage: "Waiting for next hand",
    showTurnCue: false,
    boardReset: false,
    connectionLabel: null,
  };
}

function makeBoardResetDisplay(): TableDisplayState {
  return { ...makeWinnerHoldDisplay(), boardReset: true };
}

function makeSteadyBetweenHandsDisplay(): TableDisplayState {
  return {
    phase: "betweenHands",
    handId: null,
    completedHandId: COMPLETED_HAND_ID,
    heroUserId: "hero",
    notice: null,
    winnerMessage: null,
    heroPrompt: null,
    passiveMessage: "Waiting for next hand",
    showTurnCue: false,
    boardReset: true,
    connectionLabel: null,
  };
}

function useTournamentBustStrip(fixtureId: FixtureId) {
  const fixture = FIXTURES[fixtureId];
  const [step, setStep] = useState(0);

  useEffect(() => {
    const boardResetTimer = setTimeout(() => setStep(1), 20);
    const betweenHandsTimer = setTimeout(() => setStep(2), 40);
    return () => {
      clearTimeout(boardResetTimer);
      clearTimeout(betweenHandsTimer);
    };
  }, []);

  const displayState = useMemo(() => {
    if (step >= 2) return makeSteadyBetweenHandsDisplay();
    if (step >= 1) return makeBoardResetDisplay();
    return makeWinnerHoldDisplay();
  }, [step]);

  const debugNowTs =
    step >= 2
      ? BASE_NOW_TS + WINNER_HOLD_MS + BOARD_RESET_FADE_MS + 50
      : step >= 1
        ? BASE_NOW_TS + WINNER_HOLD_MS + 50
        : BASE_NOW_TS;

  return useLiveTableStatusStripState({
    tableId: `e2e-tournament-bust-${fixtureId}`,
    displayState,
    tournamentStatus: fixture.tournamentStatus,
    tournamentViewer: fixture.tournamentViewer,
    debugNowTs,
  });
}

function isFixtureId(value: string | string[] | undefined): value is FixtureId {
  return value === "eliminated" || value === "winner";
}

function TournamentBustFixturePanel({ fixtureId }: { fixtureId: FixtureId }) {
  const fixture = FIXTURES[fixtureId];
  const statusStrip = useTournamentBustStrip(fixtureId);

  return (
    <View testID={`tournament-bust-fixture-${fixtureId}`} className="gap-y-3">
      <Text variant="label">{fixture.label}</Text>
      <TableStatusStrip
        message={statusStrip.message}
        showSpinner={statusStrip.showSpinner}
        showTurnCue={statusStrip.showTurnCue}
      />
      <TournamentResultBanner
        tournament={tournamentOverlay}
        tournamentViewer={fixture.tournamentViewer}
        onViewStandings={() => {}}
        onBackToLobby={() => {}}
      />
    </View>
  );
}

export default function TournamentBustE2EPage() {
  const params = useLocalSearchParams<{ fixture?: string }>();
  const rawFixture = Array.isArray(params.fixture) ? params.fixture[0] : params.fixture;

  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  if (isFixtureId(rawFixture)) {
    return (
      <Screen>
        <View className="p-4">
          <TournamentBustFixturePanel fixtureId={rawFixture} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View testID="tournament-bust-e2e-index" className="p-4 gap-y-4">
        <Text variant="h2">Tournament bust E2E</Text>
        <Text className="text-muted">
          Dev-only harness. Use ?fixture=eliminated or ?fixture=winner.
        </Text>
        <Surface styleId="surface.card.secondary" className="rounded-xl p-4 gap-y-6">
          <TournamentBustFixturePanel fixtureId="eliminated" />
          <TournamentBustFixturePanel fixtureId="winner" />
        </Surface>
      </View>
    </Screen>
  );
}
