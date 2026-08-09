import { Animated, View } from "react-native";
import type { UiCard } from "../table.adapter";
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
  /** Stage center: size to content inside the safe zone (no fixed phone band height). */
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
    // No felt wrapper here: the board now sits inside the shared felt "stage" rendered by
    // OpponentStrip (one continuous surface behind seats + board — see seatArrangement.ts and
    // TableSceneShell's game-area-container), rather than wrapping its own separate felt patch.
    <View style={[boardAreaStyles.root, fitContent ? { height: undefined, maxHeight: "100%" } : { height: feltHeight }]}>
      <Animated.View collapsable={false} style={[boardAreaStyles.inner, { opacity: fadeOpacity }]}>
        <CommunityBoard cards={cards} onCardSlotBounds={onCardSlotBounds} />

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
