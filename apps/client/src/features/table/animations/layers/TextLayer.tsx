import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { EASING_OPACITY_IN, EASING_OPACITY_OUT, EASING_SCALE } from "../animationEasing";
import { USE_NATIVE_DRIVER } from "@/theme/animation";
import { textShadowStyle } from "@/theme/textShadow";

const FALLBACK_SIZE_MAP = {
  small: 24,
  medium: 32,
  large: 42,
  xlarge: 56,
  hero: 72,
} as const;

const FALLBACK_HEADLINE_COLOR = "#fff";
const FALLBACK_HEADLINE_SHADOW = "rgba(255, 100, 50, 0.9)";
const FALLBACK_AMOUNT_BG = "rgba(200, 60, 40, 0.85)";
const AMOUNT_FONT_SIZE_DEFAULT = 26;
const GLOW_TEXT_SHADOW_RADIUS = 16;
const GLOW_TEXT_SHADOW_RADIUS_OUTER = 26;
const GLOW_TEXT_SHADOW_RADIUS_BRIGHT = 8;
const GLOW_TEXT_SHADOW_OFFSET = { width: 0, height: 1 };
const TEXT_SHADOW_OFFSET_NONE = { width: 0, height: 0 };
// A flex-centered box shifts its centered content by paddingTop/2 (or paddingBottom/2 in the
// opposite direction), independent of container height. Headline and amount render as two
// independent full-bleed views, so this is how they're kept from stacking on top of each other
// when both appear together (e.g. ALL_IN_TIER_1+, POT_TIER_0+): headline is nudged up, amount is
// nudged down, by enough to clear the largest headline (xlarge, 56px) against the largest amount
// pill (large text + vertical padding) with a visible gap between them.
const HEADLINE_WRAP_PADDING_BOTTOM = 84;
const AMOUNT_WRAP_PADDING_TOP = 84;
const HEADLINE_SCALE_FROM = 0.82;
const AMOUNT_SCALE_FROM = 0.75;
const AMOUNT_BORDER_WIDTH = 2;

type TextRole = "headline" | "amount";
type TextSize = keyof typeof FALLBACK_SIZE_MAP;

type Props = {
  durationMs: number;
  delayMs?: number;
  role: TextRole;
  text: string;
  size?: TextSize;
  glow?: boolean;
  headlineColor?: string;
  glowColor?: string;
  headlineGlowSecondary?: string;
  headlineGlowBright?: string;
  amountBg?: string;
  amountText?: string;
  amountBorder?: string;
  fontSize?: number;
};

export function TextLayer({
  durationMs,
  delayMs = 0,
  role,
  text,
  size = "large",
  glow = false,
  headlineColor,
  glowColor,
  headlineGlowSecondary,
  headlineGlowBright,
  amountBg,
  amountText,
  amountBorder,
  fontSize: fontSizeProp,
}: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(role === "amount" ? AMOUNT_SCALE_FROM : HEADLINE_SCALE_FROM)).current;
  const fontSize = fontSizeProp ?? FALLBACK_SIZE_MAP[size] ?? FALLBACK_SIZE_MAP.large;

  useEffect(() => {
    const headlineOpacityIn = 0.14;
    const headlineScaleIn = 0.22;
    const amountOpacityIn = 0.2;
    const amountScaleIn = 0.22;
    const opacityOutFraction = 0.4;
    const run = () => {
      const opacityIn = role === "amount" ? amountOpacityIn : headlineOpacityIn;
      const scaleIn = role === "amount" ? amountScaleIn : headlineScaleIn;
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: durationMs * opacityIn,
          useNativeDriver: USE_NATIVE_DRIVER,
          easing: EASING_OPACITY_IN,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: durationMs * scaleIn,
          useNativeDriver: USE_NATIVE_DRIVER,
          easing: EASING_SCALE,
        }),
      ]).start(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: durationMs * opacityOutFraction,
          useNativeDriver: USE_NATIVE_DRIVER,
          easing: EASING_OPACITY_OUT,
        }).start();
      });
    };
    const t = delayMs > 0 ? setTimeout(run, delayMs) : run();
    return () => (typeof t === "number" ? clearTimeout(t) : undefined);
  }, [durationMs, delayMs, role, opacity, scale]);

  const isHeadline = role === "headline";
  const amountFontSize = fontSizeProp ?? AMOUNT_FONT_SIZE_DEFAULT;
  const useDualToneGlow = isHeadline && glow && (headlineGlowSecondary ?? headlineGlowBright);
  const useBrightInner = isHeadline && glow && headlineGlowBright;
  const textStyle = isHeadline
    ? [
        styles.headline,
        {
          color: headlineColor ?? FALLBACK_HEADLINE_COLOR,
          ...textShadowStyle({
            color: (glow ? glowColor : headlineColor) ?? FALLBACK_HEADLINE_SHADOW,
            offset: glow ? GLOW_TEXT_SHADOW_OFFSET : TEXT_SHADOW_OFFSET_NONE,
            radius: glow && !headlineGlowSecondary ? GLOW_TEXT_SHADOW_RADIUS : 5,
          }),
        },
      ]
    : [
        styles.amount,
        {
          color: amountText ?? FALLBACK_HEADLINE_COLOR,
          backgroundColor: amountBg ?? FALLBACK_AMOUNT_BG,
          ...(amountBorder && {
            borderWidth: AMOUNT_BORDER_WIDTH,
            borderColor: amountBorder,
          }),
        },
      ];

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.wrap,
        isHeadline ? styles.headlineWrap : styles.amountWrap,
        { opacity, transform: [{ scale }] },
      ]}
      pointerEvents="none"
    >
      {useDualToneGlow ? (
        <View style={styles.headlineStack}>
          {headlineGlowSecondary != null && (
            <Text
              style={[
                styles.headline,
                styles.headlineLayer,
                {
                  fontSize,
                  color: headlineGlowSecondary,
                  ...textShadowStyle({
                    color: headlineGlowSecondary,
                    offset: GLOW_TEXT_SHADOW_OFFSET,
                    radius: GLOW_TEXT_SHADOW_RADIUS_OUTER,
                  }),
                },
              ]}
              numberOfLines={1}
            >
              {text}
            </Text>
          )}
          <Text
            style={[
              styles.headline,
              styles.headlineLayer,
              {
                fontSize,
                color: glowColor ?? FALLBACK_HEADLINE_SHADOW,
                ...textShadowStyle({
                  color: glowColor ?? FALLBACK_HEADLINE_SHADOW,
                  offset: GLOW_TEXT_SHADOW_OFFSET,
                  radius: GLOW_TEXT_SHADOW_RADIUS,
                }),
              },
            ]}
            numberOfLines={1}
          >
            {text}
          </Text>
          {useBrightInner && (
            <Text
              style={[
                styles.headline,
                styles.headlineLayer,
                {
                  fontSize,
                  color: headlineGlowBright,
                  ...textShadowStyle({
                    color: headlineGlowBright ?? FALLBACK_HEADLINE_SHADOW,
                    offset: GLOW_TEXT_SHADOW_OFFSET,
                    radius: GLOW_TEXT_SHADOW_RADIUS_BRIGHT,
                  }),
                },
              ]}
              numberOfLines={1}
            >
              {text}
            </Text>
          )}
          <Text
            style={[
              styles.headline,
              styles.headlineLayer,
              { fontSize, color: headlineColor ?? FALLBACK_HEADLINE_COLOR },
            ]}
            numberOfLines={1}
          >
            {text}
          </Text>
        </View>
      ) : (
        <Text
          style={[textStyle, { fontSize: isHeadline ? fontSize : amountFontSize }]}
          numberOfLines={1}
        >
          {text}
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: "center",
    alignItems: "center",
  },
  headlineWrap: {
    paddingBottom: HEADLINE_WRAP_PADDING_BOTTOM,
  },
  amountWrap: {
    paddingTop: AMOUNT_WRAP_PADDING_TOP,
  },
  headline: {
    fontWeight: "800",
    color: FALLBACK_HEADLINE_COLOR,
    ...textShadowStyle({ color: FALLBACK_HEADLINE_SHADOW, radius: 5 }),
    letterSpacing: 3,
  },
  amount: {
    fontWeight: "700",
    color: FALLBACK_HEADLINE_COLOR,
    backgroundColor: FALLBACK_AMOUNT_BG,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    overflow: "hidden",
  },
  // Deliberately not StyleSheet.absoluteFillObject: an absolutely-positioned child ignores its
  // parent's padding, which would silently cancel the headlineWrap shift above for the glow
  // (multi-layer) headline path. Re-applying the same bottom inset here keeps both paths in sync.
  headlineStack: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: HEADLINE_WRAP_PADDING_BOTTOM,
    justifyContent: "center",
    alignItems: "center",
  },
  headlineLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
  },
});
