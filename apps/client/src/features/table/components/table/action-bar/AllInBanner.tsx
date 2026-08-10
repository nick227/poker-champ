import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { HUD_ACTION } from "../tokens/hud.tokens";

export type AllInBannerProps = {
  visible: boolean;
};

export function AllInBanner({ visible }: AllInBannerProps) {
  if (!visible) return null;
  const paint = HUD_ACTION.allIn;

  return (
    <View
      testID="all-in-banner"
      style={{
        alignSelf: "center",
        borderRadius: 6,
        paddingHorizontal: 14,
        paddingVertical: 4,
        backgroundColor: paint.bg,
        borderWidth: 1,
        borderColor: paint.border,
      }}
    >
      <Text
        testID="all-in-banner-text"
        allowFontScaling={false}
        style={{
          color: paint.text,
          fontWeight: "800",
          fontSize: 13,
          letterSpacing: 1.2,
        }}
      >
        ALL-IN
      </Text>
    </View>
  );
}
