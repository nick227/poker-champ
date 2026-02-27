import { Image, View } from "react-native";
import { Text } from "@/components/base/Text";

type TableLoadingGraphicProps = {
  title: string;
  compact?: boolean;
};

const HERO_IMAGE = require("../../../../../assets/images/cardlogo.jpg");
const ACE_SPADES = require("../../../../../assets/cards/default/ace_of_spades.png");
const KING_HEARTS = require("../../../../../assets/cards/default/king_of_hearts.png");
const HERO_HEIGHT = 248;

export function TableLoadingGraphic({ title, compact = false }: TableLoadingGraphicProps) {
  const heroHeight = compact ? 206 : HERO_HEIGHT;
  const tagInset = compact ? 10 : 16;
  const cardWidth = compact ? 54 : 62;
  const cardHeight = compact ? 78 : 90;

  return (
    <View className="items-center">
      <View
        className="w-full overflow-hidden rounded-2xl border border-border-subtle bg-panel-elevated"
        style={{ height: heroHeight }}
      >
        <Image
          source={HERO_IMAGE}
          resizeMode="cover"
          style={{ width: "100%", height: "100%", opacity: 0.42 }}
          accessibilityIgnoresInvertColors
        />
        <View className="absolute inset-0 bg-black/35" />

        <View
          className="absolute rounded-full border border-white/25 bg-black/35 px-3 py-1"
          style={{ right: tagInset, top: tagInset }}
        >
          <Text variant="caption" className="text-white">
            Table Preview
          </Text>
        </View>

        <View
          className="absolute flex-row items-end justify-between"
          style={{ bottom: tagInset, left: tagInset, right: tagInset }}
        >
          <View className="min-w-0 flex-1">
            <Text variant="label" className="normal-case tracking-normal text-white/90">
              Poker Champ
            </Text>
            <Text variant="h2" className="text-white">
              {title}
            </Text>
          </View>
          <View className="relative ml-3 h-20 w-16">
            <Image
              source={KING_HEARTS}
              resizeMode="contain"
              style={{ width: cardWidth, height: cardHeight, position: "absolute", right: -8, top: -8 }}
            />
            <Image
              source={ACE_SPADES}
              resizeMode="contain"
              style={{ width: cardWidth, height: cardHeight, position: "absolute", left: -16, top: -12 }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
