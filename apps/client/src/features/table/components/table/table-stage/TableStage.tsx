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
import { SeatFeltMarkers } from "./SeatFeltMarkers";
import { StageAtmosphere } from "./StageAtmosphere";
import { STAGE_TABLE_LIFT } from "../tokens/stage.tokens";

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
  turnCountdownSeconds?: number | null;
};

export function TableStage({
  opponents,
  heroPlate,
  heroSeat,
  maxSeats,
  board,
  winnerName,
  onPlayerPress,
  onSeatBounds,
  onHeroBounds,
  activeTurnProgress = null,
  turnCountdownSeconds = null,
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
  const feltCenter = layout
    ? { x: layout.felt.x + layout.felt.w / 2, y: layout.felt.y + layout.felt.h / 2 }
    : null;

  return (
    <View style={styles.host} onLayout={onLayout} collapsable={false}>
      <StageAtmosphere />
      {layout ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: layout.felt.x,
            top: layout.felt.y + 4,
            width: layout.felt.w,
            height: layout.felt.h,
            borderRadius: layout.feltRadius,
            backgroundColor: STAGE_TABLE_LIFT,
            opacity: 0.85,
            transform: [{ scaleX: 1.01 }, { scaleY: 1.02 }],
            zIndex: 0,
          }}
        />
      ) : null}
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
            zIndex: 1,
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
      {layout && feltCenter
        ? layout.seats.map((anchor) => {
            const plateW = layout.plate.width;
            const plateH = layout.plate.height;
            // Anchor = avatar center on the rail.
            const avatarCenterFromTop = layout.cardPeek + layout.avatarSize / 2;
            const style = {
              position: "absolute" as const,
              left: anchor.x - plateW / 2,
              top: anchor.y - avatarCenterFromTop,
              width: plateW,
              height: plateH,
              // Seats must paint above felt/board — avatars + hole cards are the top layer.
              zIndex: 20,
              overflow: "visible" as const,
              backgroundColor: "transparent" as const,
            };
            const isHero = anchor.slotIndex === 0;
            const sizeProps = {
              width: plateW,
              height: plateH,
              avatarSize: layout.avatarSize,
              cardScale: isHero ? layout.heroCardScale : layout.oppCardScale,
              cardPeek: layout.cardPeek,
              nameplateH: layout.nameplateH,
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
                  turnCountdownSeconds={
                    heroPlate.isActiveTurn
                      ? (heroPlate.turnCountdownSeconds ?? turnCountdownSeconds)
                      : null
                  }
                  cardFacePackId={heroPlate.cardFacePackId || cardFacePackId}
                />
              );
              return (
                <View
                  key="hero"
                  collapsable={false}
                  style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 20 }}
                  pointerEvents="box-none"
                >
                  <SeatFeltMarkers
                    seat={{ x: anchor.x, y: anchor.y }}
                    feltCenter={feltCenter}
                    avatarSize={layout.avatarSize}
                    nameplateH={layout.nameplateH}
                    isDealer={heroPlate.isDealer}
                    betDisplay={heroPlate.betDisplay}
                  />
                  {onHeroBounds ? (
                    <MeasuredBoundsReporter onBounds={onHeroBounds} style={style}>
                      {plate}
                    </MeasuredBoundsReporter>
                  ) : (
                    <View style={style}>{plate}</View>
                  )}
                </View>
              );
            }

            const opponent = opponentSlots[anchor.slotIndex];
            if (!opponent) {
              return null;
            }

            const betCents = opponent.roundBetCents ?? 0;
            const props = opponentToSeatPlateProps(
              opponent,
              formatStack(opponent.stackCents ?? 0),
              cardFacePackId,
              {
                betDisplay: betCents > 0 ? formatBet(betCents) : null,
                isWinner: winnerName != null && opponent.name === winnerName,
                turnProgress: opponent.isActive ? activeTurnProgress : null,
                turnCountdownSeconds: opponent.isActive ? turnCountdownSeconds : null,
              },
            );
            const plate = (
              <SeatPlate
                {...props}
                {...sizeProps}
                onPress={onPlayerPress ? () => onPlayerPress(opponent) : undefined}
              />
            );
            return (
              <View
                key={opponent.id}
                collapsable={false}
                style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 20 }}
                pointerEvents="box-none"
              >
                <SeatFeltMarkers
                  seat={{ x: anchor.x, y: anchor.y }}
                  feltCenter={feltCenter}
                  avatarSize={layout.avatarSize}
                  nameplateH={layout.nameplateH}
                  isDealer={opponent.isDealer}
                  betDisplay={props.betDisplay}
                />
                {onSeatBounds ? (
                  <MeasuredBoundsReporter
                    onBounds={(rect) => onSeatBounds(opponent.seat, rect)}
                    style={style}
                  >
                    {plate}
                  </MeasuredBoundsReporter>
                ) : (
                  <View style={style}>{plate}</View>
                )}
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
    // Visible so hero nameplate is not clipped into the action HUD band.
    overflow: "visible",
  },
  boardSafe: {
    position: "absolute",
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
