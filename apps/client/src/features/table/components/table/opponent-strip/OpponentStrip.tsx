import type { ReactNode } from "react";
import { View } from "react-native";
import type { Opponent } from "../table.adapter";
import type { Rect } from "@/features/table/animations/animationTypes";
import { FeltBackground, MeasuredBoundsReporter } from "../board-area";
import { arrangeSeatsAroundTable, nearestSeatPairIndex } from "./seatArrangement";
import { opponentStripStyles as s, sideSeatSlot, topSeatSlot } from "./styles";
import { usePreferencesStore } from "@/stores/preferences.store";
import { OpponentStripItem } from "../opponent-item";

export type { Opponent } from "../table.adapter";

export type OpponentStripProps = {
  opponents: Opponent[];
  winnerName?: string;
  onPlayerPress?: (opponent: Opponent) => void;
  /** Report seat rect by index for SEAT-anchored FX. */
  onSeatBounds?: (seatIndex: number, rect: Rect) => void;
  /** 0-1 when an opponent is to act (for countdown bar); null otherwise */
  activeTurnProgress?: number | null;
  /** Board/pot content, rendered in the visual center of the seating arc — see seatArrangement.ts. */
  centerSlot: ReactNode;
};

/**
 * Renders opponents positioned around an oval felt (see seatArrangement.ts): a top-center seat,
 * then left/right columns flanking a vertical stack that has the board in its visual center —
 * one pair-row sits between the board and the hero (closest seats), the rest sit above the board.
 * The whole arrangement — seats + board — shares one continuous felt surface (FeltBackground),
 * reusing its existing gradient/rail/vignette treatment rather than a separate strip.
 */
export function OpponentStrip({
  opponents,
  winnerName,
  onPlayerPress,
  onSeatBounds,
  activeTurnProgress,
  centerSlot,
}: OpponentStripProps) {
  const cardFacePackId = usePreferencesStore((state) => state.cardFacePackId);
  const arrangement = arrangeSeatsAroundTable(opponents);
  const nearIndex = nearestSeatPairIndex(arrangement);
  const farIndices = nearIndex == null ? [] : arrangement.left.slice(0, nearIndex).map((_, i) => i);

  const renderSeat = (opponent: Opponent, slotStyle: typeof sideSeatSlot) => {
    const item = (
      <OpponentStripItem
        opponent={opponent}
        winnerName={winnerName}
        onPlayerPress={onPlayerPress}
        activeTurnProgress={activeTurnProgress}
        cardFacePackId={cardFacePackId}
        fillSlot
      />
    );
    return onSeatBounds ? (
      <MeasuredBoundsReporter
        key={opponent.id}
        onBounds={(rect) => onSeatBounds(opponent.seat, rect)}
        style={slotStyle}
      >
        {item}
      </MeasuredBoundsReporter>
    ) : (
      <View key={opponent.id} style={slotStyle}>
        {item}
      </View>
    );
  };

  const renderPairRow = (index: number) => (
    <View key={`pair-${index}`} style={s.pairRow}>
      {renderSeat(arrangement.left[index], sideSeatSlot)}
      {renderSeat(arrangement.right[index], sideSeatSlot)}
    </View>
  );

  return (
    <FeltBackground style={s.stage}>
      {arrangement.top.length > 0 ? (
        <View style={s.topRow}>{renderSeat(arrangement.top[0], topSeatSlot)}</View>
      ) : null}
      {farIndices.map(renderPairRow)}
      <View style={s.centerBoardRow}>{centerSlot}</View>
      {nearIndex != null ? renderPairRow(nearIndex) : null}
    </FeltBackground>
  );
}
