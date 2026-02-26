import { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";
import { TABLE_TILE_RADIUS } from "./constants/style/tableRadii";

const RING_SIZE = 2;
const FLASH_DURATION = 450;
const FLASH_MIN_OPACITY = 0.2;
const FLASH_MAX_OPACITY = 1;

type PotWinRingProps = {
  radius?: number;
};

export function PotWinRing({ radius = TABLE_TILE_RADIUS }: PotWinRingProps = {}) {
  const flash = useRef(new Animated.Value(FLASH_MIN_OPACITY)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(flash, {
          toValue: FLASH_MAX_OPACITY,
          duration: FLASH_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(flash, {
          toValue: FLASH_MIN_OPACITY,
          duration: FLASH_DURATION,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [flash]);

  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.baseRing, { borderRadius: radius }]} />
      <Animated.View
        pointerEvents="none"
        style={[styles.flashRing, { borderRadius: radius, opacity: flash }]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  baseRing: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: RING_SIZE,
    borderColor: "rgba(255, 215, 0, 0.25)",
    zIndex: 2,
  },
  flashRing: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: RING_SIZE,
    borderColor: "rgba(255, 215, 0, 1)",
    zIndex: 3,
  },
});
