import React, { useMemo } from "react";
import { View, Text, Image, ImageSourcePropType, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { casino } from "../../theme/casinoCabinet";
import type { SymbolKey } from "../../games/types";

const AnimatedText = Animated.createAnimatedComponent(Text);

export function ReelWindow({
  strip,
  symbols,
  symbolHeight,
  animatedStyle,
  repeatCount = 7,
  lit,
  litStyle,
}: {
  strip: SymbolKey[];
  symbols: Partial<Record<SymbolKey, ImageSourcePropType>>;
  symbolHeight: number;
  animatedStyle: StyleProp<ViewStyle>;
  repeatCount?: number;
  lit?: boolean;
  litStyle?: StyleProp<ViewStyle>;
}) {
  const repeated = useMemo(() => Array.from({ length: repeatCount }, () => strip).flat(), [repeatCount, strip]);
  const pad = symbolHeight * 2;
  const inset = Math.max(4, Math.round(symbolHeight * 0.08));

  return (
    <View style={[styles.clip, { height: symbolHeight * 3 }]}>
      <Animated.View style={[{ paddingTop: pad, paddingBottom: pad }, animatedStyle]}>
        {repeated.map((k, i) => {
          const src = symbols[k];
          return (
            <View key={`${k}-${i}`} style={[styles.cell, { height: symbolHeight, padding: inset }]}>
              <View style={styles.chrome}>
                {src ? (
                  <Image source={src} style={styles.image} resizeMode="contain" />
                ) : (
                  <View style={styles.fallbackTile}>
                    <AnimatedText style={[styles.fallbackText, { fontSize: Math.round(symbolHeight * 0.34) }]}>{k}</AnimatedText>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.centerHit,
          { top: symbolHeight, height: symbolHeight },
          lit ? styles.centerHitOn : styles.centerHitOff,
          litStyle,
        ]}
      />
    </View>
  );
}

const styles = {
  clip: {
    width: "100%" as const,
    overflow: "hidden" as const,
    backgroundColor: casino.reelFace,
  },
  cell: {
    width: "100%" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  chrome: {
    width: "100%" as const,
    height: "100%" as const,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(196,146,26,0.35)",
    backgroundColor: casino.reelFaceShade,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    overflow: "hidden" as const,
  },
  image: {
    width: "92%" as const,
    height: "92%" as const,
  },
  fallbackTile: {
    width: "86%" as const,
    height: "86%" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  fallbackText: {
    fontWeight: "900" as const,
    color: casino.goldHi,
    letterSpacing: 1,
  },
  centerHit: {
    position: "absolute" as const,
    left: 3,
    right: 3,
    borderRadius: 8,
    borderWidth: 2,
  },
  centerHitOff: {
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  centerHitOn: {
    borderColor: casino.goldHi,
    backgroundColor: "rgba(255,224,138,0.10)",
    shadowColor: casino.payline,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 10,
  },
};
