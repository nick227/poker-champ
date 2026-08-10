import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import {
  FELT_RAIL_BEVEL_HIGHLIGHT,
  FELT_RAIL_BEVEL_SHADOW,
  FELT_RAIL_COLOR,
  FELT_RAIL_OUTER_RING,
} from "../tokens/felt.tokens";

type Props = {
  radius: number;
  compact: boolean;
};

/**
 * Multi-layer padded rail: outer ring, leatherette body, top bevel highlight.
 * Keeps the flat single-fill rail from reading as a UI stroke.
 */
export function FeltRailLayers({ radius, compact }: Props) {
  const bodyStyle: ViewStyle =
    Platform.OS === "web"
      ? ({
          backgroundImage: `linear-gradient(165deg, ${FELT_RAIL_BEVEL_HIGHLIGHT} 0%, ${FELT_RAIL_COLOR} 38%, ${FELT_RAIL_BEVEL_SHADOW} 100%)`,
        } as unknown as ViewStyle)
      : { backgroundColor: FELT_RAIL_COLOR };

  return (
    <View
      testID="table-felt-rail"
      collapsable={false}
      style={[StyleSheet.absoluteFillObject, { borderRadius: radius, overflow: "hidden" }]}
    >
      <View
        testID="table-felt-rail-ring"
        collapsable={false}
        style={[
          StyleSheet.absoluteFillObject,
          {
            borderRadius: radius,
            borderWidth: compact ? 1.5 : 3,
            borderColor: FELT_RAIL_OUTER_RING,
            backgroundColor: FELT_RAIL_BEVEL_SHADOW,
          },
        ]}
      />
      <View
        testID="table-felt-rail-body"
        collapsable={false}
        style={[
          StyleSheet.absoluteFillObject,
          {
            top: compact ? 1 : 2,
            left: compact ? 1 : 2,
            right: compact ? 1 : 2,
            bottom: compact ? 1 : 2,
            borderRadius: Math.max(0, radius - (compact ? 1 : 2)),
          },
          bodyStyle,
        ]}
      />
      {Platform.OS === "web" ? (
        <View
          testID="table-felt-rail-sheen"
          pointerEvents="none"
          collapsable={false}
          style={
            {
              position: "absolute",
              left: "8%",
              right: "8%",
              top: 0,
              height: "22%",
              borderRadius: radius,
              backgroundImage:
                "linear-gradient(180deg, hsla(45,40%,70%,0.22) 0%, hsla(45,40%,70%,0) 100%)",
            } as unknown as ViewStyle
          }
        />
      ) : null}
    </View>
  );
}
