import { useState, type ReactNode } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import { FeltBackground, MeasuredBoundsReporter } from "../board-area";
import type { Opponent } from "../table.adapter";
import type { Rect } from "@/features/table/animations/animationTypes";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useTableMoneyDisplay } from "@/features/table/context/TableMoneyDisplayContext";
import {
  assignOpponentsToSlots,
  clampMaxSeats,
  seatAnchors,
  SEAT_PLATE,
  type StageSize,
} from "./stageGeometry";
import { opponentToSeatPlateProps, SeatPlate, type SeatPlateProps } from "./SeatPlate";

export type TableStageProps = {
  opponents: Opponent[];
  /** Hero seat plate props when seated on the ring (south). */
  heroPlate?: SeatPlateProps | null;
  maxSeats: number;
  board: ReactNode;
  winnerName?: string;
  onPlayerPress?: (opponent: Opponent) => void;
  onSeatBounds?: (seatIndex: number, rect: Rect) => void;
  onHeroBounds?: (rect: Rect) => void;
  activeTurnProgress?: number | null;
};

/**
 * Shared stage box: felt background + fixed ellipse SeatPlates + center board.
 * Seats sit on the rail; board owns the clear center.
 */
export function TableStage({
  opponents,
  heroPlate,
  maxSeats,
  board,
  onPlayerPress,
  onSeatBounds,
  onHeroBounds,
}: TableStageProps) {
  const [size, setSize] = useState<StageSize>({ width: 0, height: 0 });
  const cardFacePackId = usePreferencesStore((s) => s.cardFacePackId);
  const { formatStack } = useTableMoneyDisplay();
  const n = clampMaxSeats(maxSeats);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width === size.width && height === size.height) return;
    setSize({ width, height });
  };

  const anchors = size.width > 0 && size.height > 0 ? seatAnchors(n, size) : [];
  const opponentSlots = assignOpponentsToSlots(opponents, n);

  return (
    <View style={styles.host} onLayout={onLayout} collapsable={false}>
      <FeltBackground style={StyleSheet.absoluteFillObject} />
      {size.width > 0 ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.boardSafe,
            {
              left: size.width * 0.29,
              top: size.height * 0.35,
              width: size.width * 0.42,
              height: size.height * 0.3,
            },
          ]}
        >
          {board}
        </View>
      ) : null}
      {anchors.map((anchor) => {
        const halfW = SEAT_PLATE.WIDTH / 2;
        const halfH = SEAT_PLATE.HEIGHT / 2;
        const style = {
          position: "absolute" as const,
          left: anchor.x - halfW,
          top: anchor.y - halfH,
          width: SEAT_PLATE.WIDTH,
          height: SEAT_PLATE.HEIGHT + 28,
          zIndex: 2,
        };

        if (anchor.slotIndex === 0) {
          if (!heroPlate) return null;
          const plate = (
            <SeatPlate {...heroPlate} cardFacePackId={heroPlate.cardFacePackId || cardFacePackId} />
          );
          return onHeroBounds ? (
            <MeasuredBoundsReporter key="hero" onBounds={onHeroBounds} style={style}>
              {plate}
            </MeasuredBoundsReporter>
          ) : (
            <View key="hero" style={style}>
              {plate}
            </View>
          );
        }

        const opponent = opponentSlots[anchor.slotIndex];
        if (!opponent) {
          return <View key={`empty-${anchor.slotIndex}`} style={style} pointerEvents="none" />;
        }

        const props = opponentToSeatPlateProps(
          opponent,
          formatStack(opponent.stackCents ?? 0),
          cardFacePackId,
        );
        const plate = (
          <SeatPlate
            {...props}
            onPress={onPlayerPress ? () => onPlayerPress(opponent) : undefined}
          />
        );
        return onSeatBounds ? (
          <MeasuredBoundsReporter
            key={opponent.id}
            onBounds={(rect) => onSeatBounds(opponent.seat, rect)}
            style={style}
          >
            {plate}
          </MeasuredBoundsReporter>
        ) : (
          <View key={opponent.id} style={style}>
            {plate}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    position: "relative",
    overflow: "hidden",
  },
  boardSafe: {
    position: "absolute",
    zIndex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
