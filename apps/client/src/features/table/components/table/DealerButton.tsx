import { Platform, View, type ViewStyle } from "react-native";
import { Text } from "@/components/base/Text";

type DealerSize = "tiny" | "small" | "large";

const SIZE_STYLES: Record<DealerSize, { size: number; textClass: string }> = {
  tiny: { size: 16, textClass: "text-[10px]" },
  small: { size: 24, textClass: "text-xs" },
  large: { size: 32, textClass: "text-sm" },
};

/** Puck face + rim tones — a warm ivory disc with a gold rim, like a real dealer button token
 *  rather than a flat UI dot. */
const PUCK_FACE_TOP = "hsl(45, 55%, 92%)";
const PUCK_FACE_BOTTOM = "hsl(40, 35%, 78%)";
const PUCK_RIM_COLOR = "hsl(43, 70%, 45%)";
const PUCK_TEXT_COLOR = "hsl(28, 60%, 22%)";

/**
 * Dealer button: a beveled puck/token (gold rim + shaded ivory face) rather than a flat colored
 * dot, so it reads as a physical chip-like token consistent with the felt/chip visual language.
 */
export function DealerButton({ size = "small" }: { size?: DealerSize }) {
  const { size: px, textClass } = SIZE_STYLES[size ?? "small"];
  const rimWidth = Math.max(2, Math.round(px * 0.12));

  const faceStyle: ViewStyle =
    Platform.OS === "web"
      ? ({
          background: `linear-gradient(155deg, ${PUCK_FACE_TOP} 0%, ${PUCK_FACE_BOTTOM} 100%)`,
        } as unknown as ViewStyle)
      : { backgroundColor: PUCK_FACE_TOP };

  return (
    <View
      collapsable={false}
      testID="dealer-button"
      style={{
        width: px,
        height: px,
        borderRadius: px / 2,
        borderWidth: rimWidth,
        borderColor: PUCK_RIM_COLOR,
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
      }}
      className="dealer-button"
      accessibilityLabel="Dealer button"
      accessibilityRole="button"
    >
      <View
        collapsable={false}
        testID="dealer-button-face"
        style={[
          { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center" },
          faceStyle,
        ]}
      >
        <Text
          className={`font-extrabold ${textClass}`}
          allowFontScaling={false}
          style={{ color: PUCK_TEXT_COLOR }}
        >
          D
        </Text>
      </View>
    </View>
  );
}
