import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { HUD_ALL_IN_BORDER, HUD_ALL_IN_GRADIENT } from "../tokens/hud.tokens";

export type AllInBannerProps = {
  /** Callers gate this on the relevant player's status (e.g. `heroStatus === "ALL_IN"`). */
  visible: boolean;
};

/**
 * Bold red/orange "ALL-IN" banner, matching GGPoker's seat-plate treatment. Renders nothing
 * when not visible so callers can drop it in unconditionally next to other status UI.
 */
export function AllInBanner({ visible }: AllInBannerProps) {
  if (!visible) return null;

  return (
    <View
      testID="all-in-banner"
      className={`self-center rounded-md px-4 py-1 shadow-md ${HUD_ALL_IN_GRADIENT} ${HUD_ALL_IN_BORDER}`}
    >
      <Text
        testID="all-in-banner-text"
        allowFontScaling={false}
        className="text-white font-extrabold text-sm tracking-widest"
      >
        ALL-IN
      </Text>
    </View>
  );
}
