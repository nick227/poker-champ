import { View, useWindowDimensions } from "react-native";
import type { UiCard } from "./table.adapter";
import { FeltBackground } from "./FeltBackground";
import { CommunityBoard } from "./CommunityBoard";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import {
  BOARD_AREA_HEIGHT,
  COMMUNITY_CARD_SCALE,
  COMMUNITY_CARD_SCALE_LANDSCAPE,
  TABLE_SPACING,
} from "./constants/tableLayout.constants";
import { BASE_CARD_HEIGHT } from "./constants/cardDimensions.constants";

export type BoardAreaProps = {
  cards: UiCard[];
  potCents: number;
};

export function BoardArea({ cards, potCents }: BoardAreaProps) {
  const potValue = typeof potCents === "number" ? formatCents(potCents) : "--";
  const edgeSpacing = TABLE_SPACING.edge;
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  /** Match shell's feltArea height (always BOARD_AREA_HEIGHT) so centering is correct. */
  const feltHeight = BOARD_AREA_HEIGHT;
  const cardScale = isLandscape ? COMMUNITY_CARD_SCALE_LANDSCAPE : COMMUNITY_CARD_SCALE;
  const cardHeight = Math.round(BASE_CARD_HEIGHT * cardScale);

  // Vertically center cards inside felt. Apply a small visual adjustment to
  // account for card borders/shadows so the apparent center matches.
  const idealCardTop = (feltHeight - cardHeight) / 2;
  const visualAdjust = TABLE_SPACING.edge / 2;
  const cardTop = Math.max(0, idealCardTop - visualAdjust);
  const cardBottom = cardTop + cardHeight;

  // Approximate visual height of the pot chip badge.
  const potChipHeight = 32;
  // Center the pot chip halfway between card bottom and felt bottom.
  const potChipCenterY = (cardBottom + feltHeight) / 2;
  const potChipTop = potChipCenterY - potChipHeight / 2;

  return (
    <FeltBackground
      className="rounded-sm"
      style={{ width: "100%", flexDirection: "column", height: feltHeight }}
    >
      {/* Cards: fixed-height row, vertically centered in felt via computed top offset. */}
      <View
        collapsable={false}
        className="my-4"
      >
        <CommunityBoard cards={cards} />

      <View
        collapsable={false}
        className="my-4 w-full flex justify-center items-center"
        pointerEvents="none"
      >
        <View className="rounded-full border-2 border-border bg-emerald-900 px-4 py-1">
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

