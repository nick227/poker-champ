import { View } from "react-native";

/** Faint open-chair cue so empty rail slots hold the oval. */
export function EmptySeatMarker({ width, height }: { width: number; height: number }) {
  const disc = Math.round(Math.min(width, height) * 0.42);
  return (
    <View
      pointerEvents="none"
      style={{
        width,
        height,
        alignItems: "center",
        justifyContent: "flex-end",
        opacity: 0.35,
      }}
    >
      <View
        style={{
          width: disc,
          height: disc,
          borderRadius: disc / 2,
          borderWidth: 1.5,
          borderColor: "rgba(255,255,255,0.28)",
          borderStyle: "dashed",
          marginBottom: 4,
        }}
      />
      <View
        style={{
          width: width * 0.72,
          height: 10,
          borderRadius: 999,
          backgroundColor: "rgba(255,255,255,0.08)",
        }}
      />
    </View>
  );
}
