
import { View } from "react-native";
import type { DimensionValue } from "react-native";

export function Skeleton({
  height = 16,
  width = "100%",
  rounded = "rounded-md",
}: {
  height?: number;
  width?: DimensionValue;
  rounded?: string;
}) {
  return (
    <View
      style={{ height, width }}
      className={`bg-surface-lowest/60 ${rounded}`}
    />
  );
}
