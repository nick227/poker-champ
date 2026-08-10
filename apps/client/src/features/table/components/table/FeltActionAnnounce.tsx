import { ActivityIndicator, View } from "react-native";
import { Text } from "@/components/base/Text";

type Props = {
  message?: string | null;
  showSpinner?: boolean;
};

/**
 * Borderless dealer/status line in the board stack (under community cards).
 * Not a control — no border, no panel chrome.
 */
export function FeltActionAnnounce({ message, showSpinner = false }: Props) {
  const text = (message ?? "").trim();
  if (!text && !showSpinner) return null;

  return (
    <View
      testID="felt-action-announce"
      pointerEvents="none"
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
        paddingVertical: 6,
        maxWidth: "92%",
        alignSelf: "center",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {showSpinner ? (
          <ActivityIndicator testID="felt-action-announce-spinner" size="small" color="#F5E6A8" />
        ) : null}
        {text ? (
          <Text
            testID="felt-action-announce-text"
            numberOfLines={1}
            allowFontScaling={false}
            style={{
              color: "#F5E6A8",
              fontSize: 16,
              fontWeight: "800",
              letterSpacing: 0.8,
              textAlign: "center",
              textShadowColor: "rgba(0,0,0,0.85)",
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 3,
            }}
          >
            {text.toUpperCase()}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
