import { View } from "react-native";
import { Text } from "@/components/base/Text";

/**
 * Open chair on the rim — faint disc + plate stub so empty seats match
 * occupied pod silhouette without competing with live players.
 */
export function EmptySeatMarker({ width, height }: { width: number; height: number }) {
  const disc = Math.round(Math.min(width, height) * 0.38);
  const plateW = Math.round(Math.min(width * 0.72, disc + 48));
  const plateH = Math.max(22, Math.round(disc * 0.42));

  return (
    <View
      testID="empty-seat-marker"
      pointerEvents="none"
      style={{
        width,
        height,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "transparent",
      }}
    >
      <View
        style={{
          width: disc,
          height: disc,
          borderRadius: disc / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "hsla(220, 16%, 8%, 0.55)",
          borderWidth: 1.5,
          borderColor: "hsla(43, 40%, 55%, 0.35)",
          borderStyle: "dashed",
        }}
      >
        <View
          style={{
            width: disc * 0.55,
            height: disc * 0.55,
            borderRadius: disc,
            borderWidth: 1,
            borderColor: "hsla(0, 0%, 100%, 0.12)",
          }}
        />
      </View>
      <View
        style={{
          marginTop: -4,
          width: plateW,
          height: plateH,
          borderRadius: 7,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "hsla(220, 18%, 6%, 0.55)",
          borderWidth: 1,
          borderColor: "hsla(0, 0%, 100%, 0.1)",
        }}
      >
        <Text
          style={{
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 0.8,
            color: "hsla(0, 0%, 100%, 0.28)",
          }}
        >
          OPEN
        </Text>
      </View>
    </View>
  );
}
