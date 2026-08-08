import { Animated, View } from "react-native";
import type { UiCard } from "../table.adapter";
import { FeltBackground } from "./FeltBackground";
import { CommunityBoard } from "./CommunityBoard";
import { PotChipStack } from "./PotChipStack";
import { Text } from "@/components/base/Text";
import { useTableMoneyDisplay } from "@/features/table/context/TableMoneyDisplayContext";
import type { Rect } from "@/features/table/animations/animationTypes";
import { BOARD_AREA_HEIGHT } from "../constants/table-layout.constants";
import { useTableLayoutHeight } from "../table-layout/TableLayoutHeightContext";
import { boardAreaStyles } from "./styles";
import { useEffect, useRef } from "react";

export type BoardAreaProps = {
  cards: UiCard[];
  potCents: number;
  animateReset?: boolean;
  /** When set, each community card slot (0..4) reports bounds for overlay. */
  onCardSlotBounds?: (index: number, rect: Rect) => void;
};

export function BoardArea({
  cards,
  potCents,
  animateReset = false,
  onCardSlotBounds,
}: BoardAreaProps) {
  const { formatPot } = useTableMoneyDisplay();
  const potValue = typeof potCents === "number" ? formatPot(potCents) : "--";
  const layoutHeights = useTableLayoutHeight();
  const fadeOpacity = useRef(new Animated.Value(1)).current;

  const feltHeight = layoutHeights?.boardAreaHeight ?? BOARD_AREA_HEIGHT;

  useEffect(() => {
    if (!animateReset) {
      fadeOpacity.setValue(1);
      return;
    }
    fadeOpacity.setValue(0.72);
    Animated.timing(fadeOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [animateReset, fadeOpacity]);

  return (
    <FeltBackground
      style={[boardAreaStyles.root, { height: feltHeight }]}
    >
      <Animated.View collapsable={false} style={[boardAreaStyles.inner, { opacity: fadeOpacity }]}>
        <CommunityBoard cards={cards} onCardSlotBounds={onCardSlotBounds} />

        <View className="pot-container w-full flex justify-center items-center bg-panel rounded-sm" style={boardAreaStyles.potContainer}>
          <View className="items-center flex-row" style={{ gap: 8 }}>
            <PotChipStack potCents={typeof potCents === "number" ? potCents : 0} />
            <Text
              variant="body"
              className="text-white"
              allowFontScaling={false}
              style={{ fontVariant: ["tabular-nums"], minWidth: 0 }}
            >
              Pot: {potValue}
            </Text>
          </View>
        </View>
      </Animated.View>
    </FeltBackground>
  );
}
