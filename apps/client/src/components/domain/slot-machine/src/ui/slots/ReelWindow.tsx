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
}: {
  strip: SymbolKey[];
  symbols: Partial<Record<SymbolKey, ImageSourcePropType>>;
  symbolHeight: number;
  animatedStyle: StyleProp<ViewStyle>;
  repeatCount?: number;
}) {
  const repeated = useMemo(() => Array.from({ length: repeatCount }, () => strip).flat(), [repeatCount, strip]);
  const pad = symbolHeight * 2;

  return (
    <View style={[styles.clip, { height: symbolHeight * 3 }]}>
      <Animated.View style={[styles.strip, { paddingTop: pad, paddingBottom: pad }, animatedStyle]}>
        {repeated.map((k, i) => {
          const src = symbols[k];
          return (
            <View key={`${k}-${i}`} style={[styles.cell, { height: symbolHeight }]}>
              {src ? (
                <Image source={src} style={styles.image} resizeMode="contain" />
              ) : (
                <AnimatedText style={[styles.fallbackText, { fontSize: Math.round(symbolHeight * 0.42) }]}>{k}</AnimatedText>
              )}
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = {
  clip: {
    width: "100%" as const,
    overflow: "hidden" as const,
    backgroundColor: casino.reelFace,
  },
  strip: {
    backfaceVisibility: "hidden" as const,
  },
  cell: {
    width: "100%" as const,
    overflow: "hidden" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: casino.reelFace,
  },
  image: {
    width: "100%" as const,
    height: "100%" as const,
  },
  fallbackText: {
    fontWeight: "900" as const,
    color: casino.goldHi,
    letterSpacing: 1,
  },
};
