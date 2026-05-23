import type { ReactNode } from "react";
import { View } from "react-native";
import { PlayingCard } from "../PlayingCard";
import { useTableMoneyDisplay } from "@/features/table/context/TableMoneyDisplayContext";
import type { Opponent } from "../table.adapter";
import type { CardFacePackId } from "@/assets/cards/packs";
import { CARDS } from "../opponent-strip/layout";
import { useOpponentStripItem } from "./useOpponentStripItem";
import { OpponentStripItemView, type OpponentStripItemViewModel } from "./OpponentStripItemView";

export type OpponentStripItemProps = {
  opponent: Opponent;
  winnerName?: string;
  onPlayerPress?: (opponent: Opponent) => void;
  /** 0-1 when an opponent is to act (for countdown bar); null otherwise */
  activeTurnProgress?: number | null;
  cardFacePackId: CardFacePackId;
  /** When true, item fills its slot (e.g. inside MeasuredBoundsReporter); avoids double 50% = 25%. */
  fillSlot?: boolean;
};

function renderCards(opponent: Opponent, packId: CardFacePackId): { left: ReactNode; right: ReactNode } {
  const { cards } = opponent;
  if (!cards?.visible) {
    const placeholder = <PlayingCard faceDown />;
    return { left: placeholder, right: placeholder };
  }
  const left = cards.faceDown
    ? <PlayingCard faceDown />
    : cards.left
      ? <PlayingCard rank={cards.left.rank} suit={cards.left.suit} packId={packId} />
      : <PlayingCard faceDown />;
  const right = cards.faceDown
    ? <PlayingCard faceDown />
    : cards.right
      ? <PlayingCard rank={cards.right.rank} suit={cards.right.suit} packId={packId} />
      : <PlayingCard faceDown />;
  return { left, right };
}

export function OpponentStripItem({
  opponent,
  winnerName,
  onPlayerPress,
  activeTurnProgress,
  cardFacePackId,
  fillSlot = false,
}: OpponentStripItemProps) {
  const { formatStack, formatBet } = useTableMoneyDisplay();
  const { inactive, actionText, isWinner, showTurnBar } = useOpponentStripItem(
    opponent,
    winnerName,
    activeTurnProgress,
  );
  const { left: leftCard, right: rightCard } = renderCards(opponent, cardFacePackId);

  const showCards = Boolean(opponent.cards);
  const cardsSlot = showCards ? (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          marginRight: -CARDS.PAIR_OVERLAP,
          transform: [{ rotate: `-${CARDS.FAN_ANGLE_DEG}deg` }],
        }}
      >
        {leftCard}
      </View>
      <View
        style={{
          transform: [{ rotate: `${CARDS.FAN_ANGLE_DEG}deg` }],
        }}
      >
        {rightCard}
      </View>
    </View>
  ) : null;

  const viewModel: OpponentStripItemViewModel = {
    opponentId: opponent.id,
    opponentName: opponent.name,
    stackCents: opponent.stackCents ?? 0,
    avatarUrl: opponent.avatarUrl,
    initial: opponent.name.slice(0, 1).toUpperCase(),
    nameDisplay: opponent.name + (opponent.isBot ? " [BOT]" : ""),
    isDealer: opponent.isDealer,
    isActive: opponent.isActive,
    inactive,
    stackFormatted: formatStack(opponent.stackCents ?? 0),
    actionText:
      opponent.roundBetCents != null && opponent.roundBetCents > 0
        ? `Bet ${formatBet(opponent.roundBetCents)}`
        : actionText,
    actionTextClassName: opponent.status === "folded" ? "text-danger" : undefined,
    isWinner,
    showTurnBar,
    activeTurnProgress,
    cardsSlot,
  };

  return (
    <OpponentStripItemView
      model={viewModel}
      onPress={onPlayerPress ? () => onPlayerPress(opponent) : undefined}
      fillSlot={fillSlot}
    />
  );
}
