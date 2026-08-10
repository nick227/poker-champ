import { View } from "react-native";
import { Text } from "@/components/base/Text";

/** GG-style status strip across the nameplate (All-In, etc.). */
export function SeatStatusBanner({
  label,
  compact,
}: {
  label: string;
  compact: boolean;
}) {
  return (
    <View
      testID="seat-status-banner"
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        height: compact ? 14 : 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "hsla(0, 78%, 42%, 0.95)",
        borderTopLeftRadius: compact ? 6 : 9,
        borderTopRightRadius: compact ? 6 : 9,
        zIndex: 2,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontSize: compact ? 9 : 11,
          fontWeight: "900",
          letterSpacing: 0.6,
          color: "#fff",
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function isBannerStatus(statusLabel: string | null | undefined): boolean {
  if (!statusLabel) return false;
  const n = statusLabel.trim().toLowerCase();
  return n === "all in" || n === "all-in" || n === "allin";
}
