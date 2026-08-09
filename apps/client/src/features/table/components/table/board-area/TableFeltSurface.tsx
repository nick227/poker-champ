import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import type { ResolvedBackground } from "@/theme/backgrounds/background.types";
import {
  FELT_RAIL_COLOR,
  FELT_RAIL_SEAM_COLOR,
  FELT_SHADING_DELTA,
  FELT_VIGNETTE_OPACITY,
  getFeltGeometry,
} from "../tokens/felt.tokens";
import {
  buildFeltRadialGradientCss,
  buildFeltShadingStops,
  hslTripletToCss,
  resolveFeltShadingBase,
} from "./feltShading";

export type TableFeltSurfaceProps = {
  /** Resolved felt background (drives shading tone). Omit to use the app's default felt tone. */
  resolved?: ResolvedBackground;
  /** Use the smaller rail/radius geometry tuned for narrow (phone) viewports. */
  compact?: boolean;
  /** Override rail/felt corner radius (stage-projected stadium oval). */
  cornerRadius?: number;
};

/**
 * Procedural "table surface" illusion layered on top of the resolved felt fill: an oval rail
 * (padded edge), radial shading (lighter center where the community cards sit, darker toward
 * the rail), and a soft vignette at the corners. Pure CSS/shape/gradient — no images, no
 * per-frame work, so it's cheap to mount on every table render.
 */
export function TableFeltSurface({
  resolved,
  compact = false,
  cornerRadius,
}: TableFeltSurfaceProps) {
  const { base, showTintedRadial } = resolveFeltShadingBase(resolved);
  const stops = buildFeltShadingStops(base, FELT_SHADING_DELTA);
  const { radius: tokenRadius, railWidth } = getFeltGeometry(compact);
  const radius = cornerRadius ?? tokenRadius;

  const radialStyle: ViewStyle = !showTintedRadial
    ? { backgroundColor: "transparent" }
    : Platform.OS === "web"
      ? ({ backgroundImage: buildFeltRadialGradientCss(stops) } as unknown as ViewStyle)
      : { backgroundColor: hslTripletToCss(base) };

  const vignetteStyle: ViewStyle =
    Platform.OS === "web"
      ? ({
          boxShadow: `inset 0 0 ${railWidth * 4}px ${railWidth}px rgba(0, 0, 0, ${FELT_VIGNETTE_OPACITY})`,
        } as unknown as ViewStyle)
      : {
          borderWidth: Math.round(railWidth * 0.8),
          borderColor: `rgba(0, 0, 0, ${FELT_VIGNETTE_OPACITY * 0.7})`,
        };

  return (
    <View
      testID="table-felt-surface"
      pointerEvents="none"
      collapsable={false}
      style={StyleSheet.absoluteFillObject}
    >
      {/* Rail: the padded outer edge. Own background clips to its rounded corners automatically. */}
      <View
        testID="table-felt-rail"
        collapsable={false}
        style={[StyleSheet.absoluteFillObject, { backgroundColor: FELT_RAIL_COLOR, borderRadius: radius }]}
      />
      {/* Felt: inset from the rail by railWidth, with a stitched seam border. */}
      <View
        testID="table-felt-inner"
        collapsable={false}
        style={[
          styles.inset,
          {
            top: railWidth,
            left: railWidth,
            right: railWidth,
            bottom: railWidth,
            borderRadius: Math.max(0, radius - railWidth / 2),
            borderWidth: 1.5,
            borderColor: FELT_RAIL_SEAM_COLOR,
          },
        ]}
      >
        <View testID="table-felt-radial" collapsable={false} style={[StyleSheet.absoluteFillObject, radialStyle]} />
        {Platform.OS !== "web" && showTintedRadial ? (
          // Native fallback: a soft centered highlight blob simulates the web radial gradient
          // (native View backgrounds can't render true gradients without an extra dependency).
          <View
            testID="table-felt-highlight"
            collapsable={false}
            style={[
              styles.nativeHighlight,
              { backgroundColor: stops.center },
            ]}
          />
        ) : null}
        <View testID="table-felt-vignette" collapsable={false} style={[StyleSheet.absoluteFillObject, vignetteStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inset: {
    position: "absolute",
    overflow: "hidden",
  },
  nativeHighlight: {
    position: "absolute",
    left: "18%",
    right: "18%",
    top: "4%",
    height: "46%",
    borderRadius: 9999,
    opacity: 0.38,
  },
});
