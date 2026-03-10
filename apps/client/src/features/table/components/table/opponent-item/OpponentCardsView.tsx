import type { Animated } from "react-native";
import { Animated as RNAnimated, View } from "react-native";
import { CARDS } from "../opponent-strip/layout";
import { opponentStripStyles as s } from "../opponent-strip/styles";

type OpponentCardsViewProps = {
  cardsVisible: boolean;
  isRevealed: boolean;
  onLayout: (e: { nativeEvent: { layout: { width: number; height: number } } }) => void;
  liftY: Animated.AnimatedInterpolation<number>;
  scale: number;
  slotWidth: number;
  slotHeight: number;
  pairWidth: number;
  rotationLeftDeg: number;
  rotationRightDeg: number;
  leftCard: React.ReactNode;
  rightCard: React.ReactNode;
};

const cardSlotTransform = (scale: number, rotateDeg: number) => ({
  transform: [{ scale }, { rotate: `${rotateDeg}deg` }],
});

export function OpponentCardsView({
  cardsVisible,
  isRevealed,
  onLayout,
  liftY,
  scale,
  slotWidth,
  slotHeight,
  pairWidth,
  rotationLeftDeg,
  rotationRightDeg,
  leftCard,
  rightCard,
}: OpponentCardsViewProps) {
  if (!cardsVisible) {
    return (
      <View style={s.cardsViewport} onLayout={onLayout}>
        <View style={s.cardPlaceholder} />
      </View>
    );
  }

  const transformLeft = cardSlotTransform(scale, rotationLeftDeg);
  const transformRight = cardSlotTransform(scale, rotationRightDeg);
  return (
    <RNAnimated.View
      style={[s.cardsViewport, isRevealed && s.cardsViewportRevealed, { transform: [{ translateY: liftY }] }]}
      onLayout={onLayout}
    >
      <View style={s.cardsViewportContent}>
        <View style={[s.cardsRow, { width: pairWidth, alignSelf: "center" }]}>
          <View style={[s.cardSlot, { width: slotWidth, height: slotHeight }]}>
            <View style={[s.cardScaledInner, transformLeft]}>{leftCard}</View>
          </View>
          <View
            style={[
              s.cardSlot,
              { width: slotWidth, height: slotHeight, marginLeft: -CARDS.PAIR_OVERLAP },
            ]}
          >
            <View style={[s.cardScaledInner, transformRight]}>{rightCard}</View>
          </View>
        </View>
      </View>
    </RNAnimated.View>
  );
}
