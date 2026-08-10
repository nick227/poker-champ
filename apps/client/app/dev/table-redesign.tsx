import { Redirect, useLocalSearchParams } from "expo-router";
import {
  ActionBar,
  BoardArea,
  TableSceneShell,
  type ActionContext,
  type Opponent,
  type SeatPlateProps,
} from "@/features/table";
import { usePreferencesStore } from "@/stores/preferences.store";

const FACE_DOWN = { faceDown: true, visible: true } as const;

const ALL_OPPONENTS: Opponent[] = [
  {
    seat: 1,
    id: "dex",
    name: "Dex_0",
    stackCents: 10_000_00,
    status: "folded",
    cards: FACE_DOWN,
  },
  { seat: 2, id: "rapper", name: "rappdo11", stackCents: 10_000_00, cards: FACE_DOWN, roundBetCents: 600 },
  { seat: 3, id: "osya", name: "Osyaac773", stackCents: 10_000_00, cards: FACE_DOWN },
  { seat: 4, id: "karaoke", name: "karaoke", stackCents: 10_000_00, cards: FACE_DOWN },
  {
    seat: 5,
    id: "three-sixty",
    name: "3060ti",
    stackCents: 10_000_00,
    isActive: true,
    cards: FACE_DOWN,
  },
  { seat: 6, id: "wanderer", name: "Wanderer99", stackCents: 10_000_00, cards: FACE_DOWN },
  { seat: 7, id: "nova", name: "NovaStrike", stackCents: 10_000_00, cards: FACE_DOWN },
  { seat: 8, id: "quiet", name: "QuietRiver", stackCents: 10_000_00, cards: FACE_DOWN },
];

const ACTION_CONTEXT: ActionContext = {
  showActions: true,
  showReconnectingOverlay: false,
  allowedActions: { FOLD: true, CHECK: false, CALL: true, WAGER: true, ALL_IN: true },
  capabilities: { canFold: true, canCheck: false, canCall: true, canWager: true, canAllIn: true },
  wager: {
    bounds: { min: 400, max: 10_000_00, increment: 100 },
    primaryVerb: "RAISE",
    resolveAmount: (amount) => amount,
    buildPayload: (amount) => ({ type: "RAISE", amount }),
  },
};

export default function TableRedesignHarnessPage() {
  const cardFacePackId = usePreferencesStore((s) => s.cardFacePackId);
  const params = useLocalSearchParams<{ maxSeats?: string; occupied?: string; heroSeat?: string }>();
  const maxSeats = params.maxSeats ? Math.max(2, Math.min(9, parseInt(params.maxSeats, 10) || 6)) : 6;
  const occupied = params.occupied ? Math.max(0, parseInt(params.occupied, 10) || 0) : ALL_OPPONENTS.length;
  const heroSeatParam = params.heroSeat ? parseInt(params.heroSeat, 10) || 0 : 0;
  const OPPONENTS = ALL_OPPONENTS.filter((o) => o.seat < maxSeats).slice(0, occupied);
  const heroPlate: SeatPlateProps = {
    name: "GOAT007",
    stackDisplay: "$10,000",
    userId: "hero",
    seat: heroSeatParam,
    cardFacePackId,
    cards: {
      left: { rank: "A", suit: "h" },
      right: { rank: "A", suit: "s" },
      faceDown: false,
      visible: true,
    },
  };

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <TableSceneShell
      tableName="Visual Parity Table"
      balanceCents={136_505_42}
      smallBlindCents={100}
      bigBlindCents={200}
      opponents={OPPONENTS}
      heroPlate={heroPlate}
      heroSeat={heroSeatParam}
      maxSeats={maxSeats}
      dealerBar={null}
      board={
        <BoardArea
          cards={[
            { rank: "9", suit: "s" },
            { rank: "J", suit: "c" },
            { rank: "3", suit: "c" },
            null,
            null,
          ]}
          potCents={2726}
          fitContent
        />
      }
      bottom={
        <ActionBar
          actionContext={ACTION_CONTEXT}
          heroStatus="ACTIVE"
          actionOptions={{
            canFold: true,
            canCheck: false,
            canCall: true,
            canBet: false,
            canRaise: true,
            canAllIn: true,
            primaryWagerAction: "RAISE",
            callAmount: 200,
            minRaiseTo: 400,
            maxRaiseTo: 10_000_00,
          }}
          potCents={2726}
          statusMessage="Your turn"
          showTurnCue
          onAction={() => {}}
          forceInteractive
        />
      }
      activeTurnProgress={0.68}
      revealed
      rootClassName="overflow-hidden"
    />
  );
}
