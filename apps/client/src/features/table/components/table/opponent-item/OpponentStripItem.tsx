import type { ReactNode } from "react";
import { PlayingCard } from "../PlayingCard";
import { formatCents } from "@/lib/format";
import type { Opponent } from "../table.adapter";
import type { CardFacePackId } from "@/assets/cards/packs";
import { useOpponentStripItem } from "./useOpponentStripItem";
import { useOpponentCardsLayout } from "./useOpponentCardsLayout";
import { OpponentCardsView } from "./OpponentCardsView";
import { OpponentStripItemView, type OpponentStripItemViewModel } from "./OpponentStripItemView";

export type OpponentStripItemProps = {
  opponent: Opponent;
  winnerName?: string;
  onPlayerPress?: (opponent: Opponent) => void;
  /** 0-1 when an opponent is to act (for countdown bar); null otherwise */
  activeTurnProgress?: number | null;
  cardFacePackId: CardFacePackId;
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
}: OpponentStripItemProps) {
  const { inactive, actionText, isWinner, showTurnBar } = useOpponentStripItem(
    opponent,
    winnerName,
    activeTurnProgress,
  );
  const layout = useOpponentCardsLayout(opponent);
  const { left: leftCard, right: rightCard } = renderCards(opponent, cardFacePackId);

  const cardsSlot = (
    <OpponentCardsView
      cardsVisible={layout.cardsVisible && layout.hasCards}
      isRevealed={layout.isRevealed}
      onLayout={layout.onViewportLayout}
      liftY={layout.liftY}
      scale={layout.scale}
      slotWidth={layout.slotWidth}
      slotHeight={layout.slotHeight}
      pairWidth={layout.pairWidth}
      rotationLeftDeg={layout.rotationLeftDeg}
      rotationRightDeg={layout.rotationRightDeg}
      leftCard={leftCard}
      rightCard={rightCard}
    />
  );

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
    stackFormatted: formatCents(opponent.stackCents ?? 0),
    actionText,
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
    />
  );
}
