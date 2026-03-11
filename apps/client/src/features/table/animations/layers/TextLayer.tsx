import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { EASING_OPACITY_IN, EASING_OPACITY_OUT, EASING_SCALE } from "../animationEasing";

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
const AMOUNT_WRAP_PADDING_TOP = 56;
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
          useNativeDriver: true,
          easing: EASING_OPACITY_IN,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: durationMs * scaleIn,
          useNativeDriver: true,
          easing: EASING_SCALE,
        }),
      ]).start(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: durationMs * opacityOutFraction,
          useNativeDriver: true,
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
          textShadowColor: (glow ? glowColor : headlineColor) ?? FALLBACK_HEADLINE_SHADOW,
          textShadowOffset: glow ? GLOW_TEXT_SHADOW_OFFSET : TEXT_SHADOW_OFFSET_NONE,
        },
        glow && !headlineGlowSecondary && { textShadowRadius: GLOW_TEXT_SHADOW_RADIUS },
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
        isHeadline ? undefined : styles.amountWrap,
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
                  textShadowColor: headlineGlowSecondary,
                  textShadowRadius: GLOW_TEXT_SHADOW_RADIUS_OUTER,
                  textShadowOffset: GLOW_TEXT_SHADOW_OFFSET,
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
                textShadowColor: glowColor ?? FALLBACK_HEADLINE_SHADOW,
                textShadowRadius: GLOW_TEXT_SHADOW_RADIUS,
                textShadowOffset: GLOW_TEXT_SHADOW_OFFSET,
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
                  textShadowColor: headlineGlowBright,
                  textShadowRadius: GLOW_TEXT_SHADOW_RADIUS_BRIGHT,
                  textShadowOffset: GLOW_TEXT_SHADOW_OFFSET,
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
  amountWrap: {
    paddingTop: AMOUNT_WRAP_PADDING_TOP,
  },
  headline: {
    fontWeight: "800",
    color: FALLBACK_HEADLINE_COLOR,
    textShadowColor: FALLBACK_HEADLINE_SHADOW,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 5,
    letterSpacing: 3,
  },
  glow: {
    textShadowRadius: GLOW_TEXT_SHADOW_RADIUS,
    textShadowColor: "rgba(255, 180, 80, 1)",
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
  headlineStack: {
    ...StyleSheet.absoluteFillObject,
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
