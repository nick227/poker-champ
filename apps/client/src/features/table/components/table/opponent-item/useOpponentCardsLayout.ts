import { useCallback, useEffect, useRef, useState } from "react";
import { Animated } from "react-native";
import type { Opponent } from "../table.adapter";
import { CARDS } from "../opponent-strip/layout";
import { BASE_CARD_WIDTH, BASE_CARD_HEIGHT } from "../tokens/card-dimensions.tokens";

const ANGLE_RAD = (CARDS.FAN_ANGLE_DEG * Math.PI) / 180;
const ROTATED_WIDTH_PER_UNIT =
  BASE_CARD_WIDTH * Math.cos(ANGLE_RAD) + BASE_CARD_HEIGHT * Math.sin(ANGLE_RAD);
const ROTATED_HEIGHT_PER_UNIT =
  BASE_CARD_WIDTH * Math.sin(ANGLE_RAD) + BASE_CARD_HEIGHT * Math.cos(ANGLE_RAD);

export function useOpponentCardsLayout(opponent: Opponent) {
  const { cards } = opponent;
  const cardsVisible = Boolean(cards?.visible);
  const isRevealed = Boolean(cards?.visible && !cards?.faceDown);
  const revealProgress = useRef(new Animated.Value(isRevealed ? 1 : 0)).current;
  const [rowHeight, setRowHeight] = useState(CARDS.CELL_MIN_HEIGHT);

  const onViewportLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      setRowHeight(e.nativeEvent.layout.height as number as 56);
    },
    [],
  );

  useEffect(() => {
    Animated.timing(revealProgress, {
      toValue: isRevealed ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [isRevealed, revealProgress]);

  const liftY = revealProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6],
  });

  const scale = Math.min(1, (rowHeight * 0.9) / ROTATED_HEIGHT_PER_UNIT);
  const slotWidth = scale * ROTATED_WIDTH_PER_UNIT;
  const slotHeight = scale * ROTATED_HEIGHT_PER_UNIT;
  const pairWidth = Math.max(0, 2 * slotWidth - CARDS.PAIR_OVERLAP);

  return {
    cardsVisible,
    isRevealed,
    onViewportLayout,
    liftY,
    scale,
    slotWidth,
    slotHeight,
    pairWidth,
    rotationLeftDeg: -CARDS.FAN_ANGLE_DEG,
    rotationRightDeg: CARDS.FAN_ANGLE_DEG,
    hasCards: Boolean(cards),
  };
}
