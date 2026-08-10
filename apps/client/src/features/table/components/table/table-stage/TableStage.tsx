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
  resolveStageLayout,
  type StageSize,
} from "./stageGeometry";
import { EmptySeatMarker } from "./EmptySeatMarker";
import { opponentToSeatPlateProps, SeatPlate, type SeatPlateProps } from "./SeatPlate";

export type TableStageProps = {
  opponents: Opponent[];
  heroPlate?: SeatPlateProps | null;
  heroSeat: number;
  maxSeats: number;
  board: ReactNode;
  winnerName?: string;
  onPlayerPress?: (opponent: Opponent) => void;
  onSeatBounds?: (seatIndex: number, rect: Rect) => void;
  onHeroBounds?: (rect: Rect) => void;
  activeTurnProgress?: number | null;
};

export function TableStage({
  opponents,
  heroPlate,
  heroSeat,
  maxSeats,
  board,
  onPlayerPress,
  onSeatBounds,
  onHeroBounds,
  activeTurnProgress = null,
}: TableStageProps) {
  const [size, setSize] = useState<StageSize>({ width: 0, height: 0 });
  const cardFacePackId = usePreferencesStore((s) => s.cardFacePackId);
  const { formatStack, formatBet } = useTableMoneyDisplay();
  const n = clampMaxSeats(maxSeats);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width === size.width && height === size.height) return;
    setSize({ width, height });
  };

  const layout = size.width > 0 && size.height > 0 ? resolveStageLayout(n, size) : null;
  const opponentSlots = layout ? assignOpponentsToSlots(opponents, n, heroSeat) : [];

  return (
    <View style={styles.host} onLayout={onLayout} collapsable={false}>
      {layout ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: layout.felt.x,
            top: layout.felt.y,
            width: layout.felt.w,
            height: layout.felt.h,
            borderRadius: layout.feltRadius,
            overflow: "hidden",
          }}
        >
          <FeltBackground
            cornerRadius={layout.feltRadius}
            style={StyleSheet.absoluteFillObject}
          />
        </View>
      ) : null}
      {layout ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.boardSafe,
            {
              left: layout.board.x,
              top: layout.board.y,
              width: layout.board.w,
              height: layout.board.h,
            },
          ]}
        >
          {board}
        </View>
      ) : null}
      {layout
        ? layout.seats.map((anchor) => {
            const plateW = layout.plate.width;
            const plateH = layout.plate.height;
            // Anchor ≈ avatar band (lower half of tall card-dominant pod).
            const style = {
              position: "absolute" as const,
              left: anchor.x - plateW / 2,
              top: anchor.y - plateH * 0.62,
              width: plateW,
              height: plateH,
              zIndex: 2,
              // Allow hole cards to overhang — never clip the dominant cards.
              overflow: "visible" as const,
            };
            const isHero = anchor.slotIndex === 0;
            const sizeProps = {
              width: plateW,
              height: plateH,
              avatarSize: layout.avatarSize,
              cardScale: isHero ? layout.heroCardScale : layout.oppCardScale,
            };

            if (isHero) {
              if (!heroPlate) {
                return (
                  <View key="empty-hero" style={style} pointerEvents="none">
                    <EmptySeatMarker width={plateW} height={plateH} />
                  </View>
                );
              }
              const plate = (
                <SeatPlate
                  {...heroPlate}
                  {...sizeProps}
                  turnProgress={
                    heroPlate.isActiveTurn ? (heroPlate.turnProgress ?? activeTurnProgress) : null
                  }
                  cardFacePackId={heroPlate.cardFacePackId || cardFacePackId}
                />
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
              return (
                <View key={`empty-${anchor.slotIndex}`} style={style} pointerEvents="none">
                  <EmptySeatMarker width={plateW} height={plateH} />
                </View>
              );
            }

            const betCents = opponent.roundBetCents ?? 0;
            const props = opponentToSeatPlateProps(
              opponent,
              formatStack(opponent.stackCents ?? 0),
              cardFacePackId,
              {
                betDisplay: betCents > 0 ? formatBet(betCents) : null,
                turnProgress: opponent.isActive ? activeTurnProgress : null,
              },
            );
            const plate = (
              <SeatPlate
                {...props}
                {...sizeProps}
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
          })
        : null}
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
