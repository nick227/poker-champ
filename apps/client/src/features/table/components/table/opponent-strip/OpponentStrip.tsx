import { Platform, ScrollView, View, useWindowDimensions } from "react-native";
import type { Opponent } from "../table.adapter";
import { CONTAINER } from "./layout";
import { opponentStripStyles as s } from "./styles";
import { usePreferencesStore } from "@/stores/preferences.store";
import { OpponentStripItem } from "../opponent-item";

export type { Opponent } from "../table.adapter";

export type OpponentStripProps = {
  opponents: Opponent[];
  winnerName?: string;
  onPlayerPress?: (opponent: Opponent) => void;
  /** 0-1 when an opponent is to act (for countdown bar); null otherwise */
  activeTurnProgress?: number | null;
};

export function OpponentStrip({
  opponents,
  winnerName,
  onPlayerPress,
  activeTurnProgress,
}: OpponentStripProps) {
  const cardFacePackId = usePreferencesStore((state) => state.cardFacePackId);
  const { height: windowHeight } = useWindowDimensions();
  if (opponents.length === 0) return null;
  const maxHeightStyle =
    Platform.OS === "web"
      ? { maxHeight: `${CONTAINER.MAX_HEIGHT_VH}vh` as unknown as number }
      : { maxHeight: Math.round(windowHeight * CONTAINER.MAX_HEIGHT_RATIO) };
  return (
    <View
      collapsable={false}
      style={[s.strip, maxHeightStyle]}
    >
      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={true}
        bounces={false}
        overScrollMode="never"
        scrollEventThrottle={16}
      >
          {opponents.map((opponent) => (
            <OpponentStripItem
              key={opponent.id}
              opponent={opponent}
              winnerName={winnerName}
              onPlayerPress={onPlayerPress}
              activeTurnProgress={activeTurnProgress}
              cardFacePackId={cardFacePackId}
            />
          ))}
      </ScrollView>
    </View>
  );
}
