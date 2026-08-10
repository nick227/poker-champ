import { Animated, View, type LayoutChangeEvent, type ReactNode } from "react-native";
import type { UiCard } from "../table.adapter";
import { CommunityBoard } from "./CommunityBoard";
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
  /** Dealer/status copy — flows under community cards (not over seats). */
  announce?: ReactNode;
};

export function BoardArea({
  cards,
  potCents,
  animateReset = false,
  onCardSlotBounds,
  fitContent = false,
  announce = null,
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
      <Animated.View
        collapsable={false}
        style={[
          boardAreaStyles.inner,
          {
            opacity: fadeOpacity,
            flex: 1,
            width: "100%",
            alignItems: "center",
            justifyContent: "center",
          },
        ]}
      >
        {/* Pot sits in normal flow directly above the cards (fixed gap), not a percentage-based
            absolute offset -- that guessed at the cards' rendered height and, once the board
            shrank to stop dominating the felt, landed the pot badge on top of a card instead of
            above it. A column stack can never overlap regardless of board box size. */}
        <View
          pointerEvents="none"
          style={[
            boardAreaStyles.potContainer,
            {
              alignItems: "center",
              marginBottom: 10,
            },
          ]}
        >
          <View
            style={{
              paddingVertical: 6,
              paddingHorizontal: 18,
              borderRadius: 999,
              backgroundColor: "rgba(12,16,22,0.45)",
            }}
          >
            <Text
              variant="body"
              className="text-white"
              allowFontScaling={false}
              style={{
                fontVariant: ["tabular-nums"],
                fontSize: 16,
                fontWeight: "700",
              }}
            >
              Pot: {potValue}
            </Text>
          </View>
        </View>

        <CommunityBoard
          cards={cards}
          onCardSlotBounds={onCardSlotBounds}
          targetWidth={box.width > 0 ? box.width : undefined}
          targetHeight={box.height > 0 ? box.height : undefined}
        />

        {announce ? (
          <View pointerEvents="none" style={{ marginTop: 8, width: "100%", alignItems: "center" }}>
            {announce}
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}
