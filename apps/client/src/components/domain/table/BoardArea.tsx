import { View } from "react-native";
import type { UiCard } from "./table.adapter";
import { FeltBackground } from "./FeltBackground";
import { CommunityBoard } from "./CommunityBoard";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import {
  BOARD_AREA_HEIGHT,
  TABLE_SPACING,
} from "./constants/tableLayout.constants";
import { useTableLayoutHeight } from "./shell/TableLayoutHeightContext";

export type BoardAreaProps = {
  cards: UiCard[];
  potCents: number;
};

export function BoardArea({ cards, potCents }: BoardAreaProps) {
  const potValue = typeof potCents === "number" ? formatCents(potCents) : "--";
  const layoutHeights = useTableLayoutHeight();

  /** Match shell's feltArea height (orientation-based so cards and board grow together). */
  const feltHeight = layoutHeights?.boardAreaHeight ?? BOARD_AREA_HEIGHT;

  return (
    <FeltBackground
      className="rounded-sm"
      style={{ width: "100%", flexDirection: "column", height: feltHeight }}
    >
      <View
        collapsable={false}
        className="my-4"
      >
        <CommunityBoard cards={cards} />

        <View className="pot-container w-full flex justify-center items-center pt-2">
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
    </FeltBackground>
  );
}
