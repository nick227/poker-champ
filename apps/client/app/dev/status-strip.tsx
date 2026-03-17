import { Redirect } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { Screen } from "@/components/containers/Screen";
import { Surface } from "@/components/containers/Surface";
import {
  BoardArea,
  TableStatusStrip,
  buildTableSceneModel,
  deriveTableViewState,
} from "@/features/table";
import type {
  ActionNotice,
  HandResultMessage,
} from "@/features/table";
import {
  BOARD_RESET_FADE_MS,
  DEALING_NEXT_HAND_COPY,
  WINNER_HOLD_MS,
  useLiveTableStatusStripState,
} from "@/features/table-page/useLiveTableStatusStripState";
import { deriveTableDisplayState } from "@/features/table-page/tableDisplayState";

type ScenarioId =
  | "inHand"
  | "heroTurn"
  | "winnerHold"
  | "boardReset"
  | "betweenHands"
  | "transport";

type ScenarioConfig = {
  id: ScenarioId;
  label: string;
  description: string;
  snapshot: TableSnapshotPayload;
  actionNotice: ActionNotice | null;
  handResultNotice: HandResultMessage | null;
  actionsInteractive: boolean;
  connectionStatus: "CONNECTED" | "RECONNECTING" | "DISCONNECTED";
  sceneMode: "idle" | "active";
  debugNowTs: number;
};

const BASE_NOW_TS = Date.UTC(2026, 2, 15, 18, 0, 0);
const DEBUG_TABLE_ID = "debug-status-strip";
const COMPLETED_HAND_ID = "debug-hand-1";

function makeSnapshot({
  handId = COMPLETED_HAND_ID,
  board = ["5d", "2d", "Kh"],
  potCents = 400,
}: {
  handId?: string | null;
  board?: string[];
  potCents?: number;
} = {}): TableSnapshotPayload {
  return {
    version: 1,
    snapshotId: `debug-snap-${handId ?? "idle"}`,
    snapshotSeq: 1,
    emittedAtTs: BASE_NOW_TS,
    serverTimeTs: BASE_NOW_TS,
    stateHash: "debug-hash",
    reason: "ACTION_ACCEPTED",
    table: {
      tableId: DEBUG_TABLE_ID,
      tableName: "Status Strip Harness",
      visibility: "PUBLIC",
      maxSeats: 6,
      smallBlindCents: 100,
      bigBlindCents: 200,
      minBuyInCents: 2000,
      maxBuyInCents: 20000,
      showStats: true,
    },
    seats: [
      {
        seat: 0,
        occupied: true,
        userId: "hero",
        name: "Hero Player",
        stackCents: 3800,
        roundBetCents: 0,
        committedCents: 0,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: false,
        status: "ACTIVE",
        isToAct: handId != null,
        isBot: false,
      },
      {
        seat: 1,
        occupied: true,
        userId: "villain",
        name: "Callie Doyle",
        stackCents: 3800,
        roundBetCents: 200,
        committedCents: 200,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: true,
        status: "ACTIVE",
        isToAct: false,
        isBot: false,
      },
    ],
    hero: {
      userId: "hero",
      youAreSeated: true,
      seat: 0,
      actionOptions:
        handId == null
          ? undefined
          : {
              canFold: true,
              canCheck: false,
              canCall: true,
              canBet: false,
              canRaise: true,
              canAllIn: true,
              primaryWagerAction: "RAISE",
              callAmount: 200,
              minRaiseTo: 600,
              maxRaiseTo: 3800,
            },
    },
    hand:
      handId == null
        ? undefined
        : {
            handId,
            handNumber: 99,
            street: board.length >= 3 ? "FLOP" : "PREFLOP",
            dealerSeat: 1,
            sbSeat: 0,
            bbSeat: 1,
            toActSeat: 0,
            actionCount: 2,
            roundCurrentBetCents: 200,
            minRaiseCents: 200,
            potCents,
            board,
          },
  };
}

function makeActionNotice(
  overrides: Partial<ActionNotice> & Pick<ActionNotice, "key" | "handId" | "message">,
): ActionNotice {
  return {
    actorUserId: overrides.actorUserId,
    ...overrides,
  };
}

function makeHandResultNotice(): HandResultMessage {
  return {
    handId: COMPLETED_HAND_ID,
    winnerName: "Hero Player",
    amountCents: 400,
    winningHandDescr: "Pair of kings",
  };
}

function makeScenarioConfig(id: ScenarioId): ScenarioConfig {
  const activeSnapshot = makeSnapshot();
  const idleSnapshot = makeSnapshot({ handId: null });
  const opponentNotice = makeActionNotice({
    key: `${COMPLETED_HAND_ID}:2`,
    handId: COMPLETED_HAND_ID,
    actorUserId: "villain",
    message: "Callie bets $2",
  });
  const handResultNotice = makeHandResultNotice();

  switch (id) {
    case "heroTurn":
      return {
        id,
        label: "Hero Turn",
        description: "Freeze the strip on the opponent action while actions are available.",
        snapshot: activeSnapshot,
        actionNotice: opponentNotice,
        handResultNotice: null,
        actionsInteractive: true,
        connectionStatus: "CONNECTED",
        sceneMode: "active",
        debugNowTs: BASE_NOW_TS,
      };
    case "winnerHold":
      return {
        id,
        label: "Winner Hold",
        description: "Winner text is visible before the board resets.",
        snapshot: idleSnapshot,
        actionNotice: null,
        handResultNotice,
        actionsInteractive: false,
        connectionStatus: "CONNECTED",
        sceneMode: "idle",
        debugNowTs: BASE_NOW_TS,
      };
    case "boardReset":
      return {
        id,
        label: "Board Reset",
        description: "Winner text persists while the board flips down and pot resets.",
        snapshot: idleSnapshot,
        actionNotice: null,
        handResultNotice,
        actionsInteractive: false,
        connectionStatus: "CONNECTED",
        sceneMode: "idle",
        debugNowTs: BASE_NOW_TS + WINNER_HOLD_MS,
      };
    case "betweenHands":
      return {
        id,
        label: "Between Hands",
        description: "Board stays face-down, pot is zero, and the dealing message spins.",
        snapshot: idleSnapshot,
        actionNotice: null,
        handResultNotice,
        actionsInteractive: false,
        connectionStatus: "CONNECTED",
        sceneMode: "idle",
        debugNowTs: BASE_NOW_TS + WINNER_HOLD_MS + BOARD_RESET_FADE_MS,
      };
    case "transport":
      return {
        id,
        label: "Transport",
        description: "Reconnect status takes precedence over all table messaging.",
        snapshot: activeSnapshot,
        actionNotice: opponentNotice,
        handResultNotice: null,
        actionsInteractive: false,
        connectionStatus: "RECONNECTING",
        sceneMode: "active",
        debugNowTs: BASE_NOW_TS,
      };
    case "inHand":
    default:
      return {
        id: "inHand",
        label: "In Hand",
        description: "Normal in-hand dealer messaging with no spinner and no turn text.",
        snapshot: activeSnapshot,
        actionNotice: opponentNotice,
        handResultNotice: null,
        actionsInteractive: false,
        connectionStatus: "CONNECTED",
        sceneMode: "active",
        debugNowTs: BASE_NOW_TS,
      };
  }
}

const SCENARIO_IDS: ScenarioId[] = [
  "inHand",
  "heroTurn",
  "winnerHold",
  "boardReset",
  "betweenHands",
  "transport",
];

export default function StatusStripHarnessPage() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("inHand");
  const scenario = useMemo(() => makeScenarioConfig(scenarioId), [scenarioId]);
  const statusStrip = useLiveTableStatusStripState({
    tableId: DEBUG_TABLE_ID,
    displayState: deriveTableDisplayState({
      viewState: {
        ...deriveTableViewState(
          scenario.snapshot,
          scenario.connectionStatus,
        ),
        turnCue: scenario.actionsInteractive,
      },
      actionNotice: scenario.actionNotice,
      handResultNotice: scenario.handResultNotice,
    }),
    debugNowTs: scenario.debugNowTs,
  });
  const tableModel = useMemo(
    () =>
      buildTableSceneModel(
        scenario.snapshot,
        scenario.connectionStatus,
      ),
    [scenario.connectionStatus, scenario.snapshot],
  );

  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View className="gap-y-2">
          <Text variant="h2">Status Strip Harness</Text>
          <Text className="text-muted">
            Dev-only route for visually checking live strip phases against the board and pot overrides.
          </Text>
        </View>

        <Surface styleId="surface.card.secondary" className="rounded-xl p-4 gap-y-3">
          <Text variant="label">Scenarios</Text>
          <View className="flex-row flex-wrap gap-2">
            {SCENARIO_IDS.map((id) => {
              const item = makeScenarioConfig(id);
              return (
                <Button
                  key={id}
                  title={item.label}
                  onPress={() => setScenarioId(id)}
                  size="sm"
                  intent="neutral"
                  selected={scenarioId === id}
                />
              );
            })}
          </View>
          <Text className="text-muted">{scenario.description}</Text>
        </Surface>

        <Surface styleId="surface.card.secondary" className="rounded-xl p-4 gap-y-4">
          <Text variant="label">Rendered Output</Text>
          <TableStatusStrip
            message={statusStrip.message}
            showSpinner={statusStrip.showSpinner}
            showTurnCue={statusStrip.showTurnCue}
          />
          <View className="w-full max-w-[420px] self-center">
            <BoardArea
              cards={statusStrip.boardCardsOverride ?? tableModel.communityCards}
              potCents={statusStrip.potCentsOverride ?? tableModel.potCents}
              animateReset={statusStrip.statusPhase === "boardReset"}
            />
          </View>
        </Surface>

        <Surface styleId="surface.card.secondary" className="rounded-xl p-4 gap-y-3">
          <Text variant="label">Debug State</Text>
          <Text>Phase: {statusStrip.statusPhase}</Text>
          <Text>Spinner: {statusStrip.showSpinner ? "on" : "off"}</Text>
          <Text>Turn cue: {statusStrip.showTurnCue ? "on" : "off"}</Text>
          <Text>Message: {statusStrip.message || "(empty)"}</Text>
          <Text>
            Board override: {statusStrip.boardCardsOverride ? "face-down x5" : "none"}
          </Text>
          <Text>
            Pot override: {statusStrip.potCentsOverride != null ? `$${(statusStrip.potCentsOverride / 100).toFixed(2)}` : "none"}
          </Text>
          <Text>
            Snapshot hand: {scenario.snapshot.hand?.handId ?? "none"}
          </Text>
          <Text>
            Next steady copy: {DEALING_NEXT_HAND_COPY}
          </Text>
        </Surface>
      </ScrollView>
    </Screen>
  );
}
