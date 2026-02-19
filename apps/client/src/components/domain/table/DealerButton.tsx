import { View } from "react-native";
import { Text } from "@/components/base/Text";

type DealerSize = "tiny" | "small" | "large";

const SIZE_STYLES: Record<DealerSize, { size: number; textClass: string }> = {
  tiny: { size: 16, textClass: "text-[10px]" },
  small: { size: 24, textClass: "text-xs" },
  large: { size: 32, textClass: "text-sm" },
};

export function DealerButton({ size = "small" }: { size?: DealerSize }) {
  const { size: px, textClass } = SIZE_STYLES[size ?? "small"];
  return (
    <View
      collapsable={false}
      style={{ width: px, height: px, borderRadius: '50%', justifyContent: "center", alignItems: "center" }}
      className="bg-blue-500"
      accessibilityLabel="Dealer button"
      accessibilityRole="button"
    >
      <Text className={`text-white font-bold ${textClass}`} allowFontScaling={false}>
        D
      </Text>
    </View>
  );
}
