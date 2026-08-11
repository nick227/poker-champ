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
      <Animated.View style={[{ paddingTop: pad, paddingBottom: pad }, animatedStyle]}>
        {repeated.map((k, i) => {
          const src = symbols[k];
          return (
            <View key={`${k}-${i}`} style={[styles.cell, { height: symbolHeight }]}>
              {src ? (
                <Image source={src} style={styles.image} resizeMode="contain" />
              ) : (
                <View style={styles.fallbackTile}>
                  <AnimatedText style={[styles.fallbackText, { fontSize: Math.round(symbolHeight * 0.38) }]}>{k}</AnimatedText>
                </View>
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
    borderWidth: 0,
  },
  cell: {
    width: "100%" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(230,180,34,0.12)",
  },
  image: {
    width: "86%" as const,
    height: "86%" as const,
    borderRadius: 10,
  },
  fallbackTile: {
    width: "86%" as const,
    height: "86%" as const,
    backgroundColor: casino.reelFaceShade,
    borderWidth: 1,
    borderColor: casino.goldLo,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 10,
  },
  fallbackText: {
    fontWeight: "900" as const,
    color: casino.goldHi,
    letterSpacing: 1,
  },
};
