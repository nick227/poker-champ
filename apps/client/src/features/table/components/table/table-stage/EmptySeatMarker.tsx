import { View } from "react-native";

/** Faint open chair — small disc only, matches compact seat footprint. */
export function EmptySeatMarker({ width, height }: { width: number; height: number }) {
  const disc = Math.round(Math.min(width, height) * 0.36);
  return (
    <View
      pointerEvents="none"
      style={{
        width,
        height,
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.35,
        backgroundColor: "transparent",
      }}
    >
      <View
        style={{
          width: disc,
          height: disc,
          borderRadius: disc / 2,
          borderWidth: 1.5,
          borderColor: "rgba(255,255,255,0.3)",
          borderStyle: "dashed",
        }}
      />
    </View>
  );
}
