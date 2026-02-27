import React, { useMemo } from "react";
import { View, Text, Image, ImageSourcePropType } from "react-native";
import Animated from "react-native-reanimated";
import { useTheme } from "../../theme/ThemeProvider";
import { makeStyles } from "../../theme/styleEngine";
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
  animatedStyle: any;
  repeatCount?: number;
}) {
  const { theme } = useTheme();
  const repeated = useMemo(() => Array.from({ length: repeatCount }, () => strip).flat(), [repeatCount, strip]);
  const pad = symbolHeight * 2;

  const s = makeStyles(theme, (t) => ({
    clip: {
      width: "100%",
      height: symbolHeight * 3,
      overflow: "hidden",
      backgroundColor: t.colors.bg0,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    cell: {
      width: "100%",
      height: symbolHeight,
      alignItems: "center",
      justifyContent: "center",
    },
    image: {
      width: "92%",
      height: "92%",
    },
    fallbackTile: {
      width: "100%",
      height: "100%",
      backgroundColor: t.colors.panel,
      borderWidth: 1,
      borderColor: t.colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    fallbackText: {
      fontSize: Math.round(symbolHeight * 0.38),
      fontWeight: t.type.weightHeavy,
      color: t.colors.text,
      letterSpacing: 1,
    },
  }));

  return (
    <View style={s.clip}>
      <Animated.View style={[{ paddingTop: pad, paddingBottom: pad }, animatedStyle]}>
        {repeated.map((k, i) => {
          const src = symbols[k];
          return (
            <View key={`${k}-${i}`} style={s.cell}>
              {src ? (
                <Image source={src} style={s.image} resizeMode="contain" />
              ) : (
                <View style={s.fallbackTile}>
                  <AnimatedText style={s.fallbackText}>{k}</AnimatedText>
                </View>
              )}
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
}
