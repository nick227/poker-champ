import { Animated, View, type LayoutChangeEvent } from "react-native";
import type { UiCard } from "../table.adapter";
import { CommunityBoard } from "./CommunityBoard";
import { PotChipStack } from "./PotChipStack";
import { Text } from "@/components/base/Text";
import { useTableMoneyDisplay } from "@/features/table/context/TableMoneyDisplayContext";
import type { Rect } from "@/features/table/animations/animationTypes";
import { BOARD_AREA_HEIGHT } from "../constants/table-layout.constants";
import { useTableLayoutHeight } from "../table-layout/TableLayoutHeightContext";
import { boardAreaStyles } from "./styles";
import { useEffect, useRef, useState } from "react";

export type BoardAreaProps = {
  cards: UiCard[];
  potCents: number;
  animateReset?: boolean;
  onCardSlotBounds?: (index: number, rect: Rect) => void;
  fitContent?: boolean;
};

export function BoardArea({
  cards,
  potCents,
  animateReset = false,
  onCardSlotBounds,
  fitContent = false,
}: BoardAreaProps) {
  const { formatPot } = useTableMoneyDisplay();
  const potValue = typeof potCents === "number" ? formatPot(potCents) : "--";
  const layoutHeights = useTableLayoutHeight();
  const fadeOpacity = useRef(new Animated.Value(1)).current;
  const [box, setBox] = useState({ width: 0, height: 0 });

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

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width === box.width && height === box.height) return;
    setBox({ width, height });
  };

  return (
    <View
      onLayout={onLayout}
      style={[
        boardAreaStyles.root,
        fitContent
          ? { width: "100%", height: "100%", justifyContent: "center" }
          : { height: feltHeight },
      ]}
    >
      <Animated.View collapsable={false} style={[boardAreaStyles.inner, { opacity: fadeOpacity }]}>
        <CommunityBoard
          cards={cards}
          onCardSlotBounds={onCardSlotBounds}
          targetWidth={box.width > 0 ? box.width : undefined}
          targetHeight={box.height > 0 ? box.height : undefined}
        />

        <View
          className="pot-container flex justify-center items-center"
          style={[
            boardAreaStyles.potContainer,
            {
              alignSelf: "center",
              width: "auto",
              maxWidth: "100%",
              borderRadius: 999,
              backgroundColor: "rgba(12,16,22,0.45)",
            },
          ]}
        >
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
    </View>
  );
}
