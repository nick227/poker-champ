import { View } from "react-native";
import type { UiCard } from "../table.adapter";
import { FeltBackground } from "./FeltBackground";
import { CommunityBoard } from "./CommunityBoard";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import type { Rect } from "@/features/table/animations/animationTypes";
import { BOARD_AREA_HEIGHT } from "../constants/table-layout.constants";
import { useTableLayoutHeight } from "../table-layout/TableLayoutHeightContext";
import { boardAreaStyles } from "./styles";

export type BoardAreaProps = {
  cards: UiCard[];
  potCents: number;
  /** When set, each community card slot (0..4) reports bounds for overlay. */
  onCardSlotBounds?: (index: number, rect: Rect) => void;
};

export function BoardArea({ cards, potCents, onCardSlotBounds }: BoardAreaProps) {
  const potValue = typeof potCents === "number" ? formatCents(potCents) : "--";
  const layoutHeights = useTableLayoutHeight();

  const feltHeight = layoutHeights?.boardAreaHeight ?? BOARD_AREA_HEIGHT;

  return (
    <FeltBackground
      className="rounded-xl overflow-hidden"
      style={[boardAreaStyles.root, { height: feltHeight }]}
    >
      <View collapsable={false} style={boardAreaStyles.inner}>
        <CommunityBoard cards={cards} onCardSlotBounds={onCardSlotBounds} />

        <View className="pot-container w-full flex justify-center items-center bg-panel rounded-sm" style={boardAreaStyles.potContainer}>
          <View className="items-center">
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
      </View>
    </FeltBackground>
  );
}
