import { useCallback, useEffect, useRef } from "react";
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { normalizeReelPositions } from "../engine/reelMath";

const SYMBOL_HEIGHT = 152;
const PAD_ROWS = 2;
const BASE_COPY_INDEX = 2;
const EXTRA_LOOPS: readonly [number, number, number] = [1, 2, 2];
export const SPIN_DURATIONS = [900, 1150, 1400] as const;

function getReelOffsetForPosition(stripLen: number, reelPosition: number): number {
  return -((PAD_ROWS + BASE_COPY_INDEX * stripLen + reelPosition - 1) * SYMBOL_HEIGHT);
}

export function useSlotReelMotion(reelLens: readonly [number, number, number]) {
  const y0 = useSharedValue(0);
  const y1 = useSharedValue(0);
  const y2 = useSharedValue(0);
  const reelPosRef = useRef<[number, number, number]>([0, 0, 0]);

  useEffect(() => {
    const nextPos = normalizeReelPositions(reelPosRef.current, reelLens);
    reelPosRef.current = nextPos;
    y0.value = getReelOffsetForPosition(reelLens[0], nextPos[0]);
    y1.value = getReelOffsetForPosition(reelLens[1], nextPos[1]);
    y2.value = getReelOffsetForPosition(reelLens[2], nextPos[2]);
  }, [reelLens, y0, y1, y2]);

  const reelStyle0 = useAnimatedStyle(() => ({ transform: [{ translateY: y0.value }] }));
  const reelStyle1 = useAnimatedStyle(() => ({ transform: [{ translateY: y1.value }] }));
  const reelStyle2 = useAnimatedStyle(() => ({ transform: [{ translateY: y2.value }] }));

  const normalize = useCallback(() => {
    const nextPos = normalizeReelPositions(reelPosRef.current, reelLens);
    reelPosRef.current = nextPos;
    y0.value = getReelOffsetForPosition(reelLens[0], nextPos[0]);
    y1.value = getReelOffsetForPosition(reelLens[1], nextPos[1]);
    y2.value = getReelOffsetForPosition(reelLens[2], nextPos[2]);
  }, [reelLens, y0, y1, y2]);

  const spinTo = useCallback(
    async (stops: readonly [number, number, number]) => {
      const startPos = [...reelPosRef.current] as [number, number, number];
      const deltas = [
        (stops[0] - (startPos[0] % reelLens[0]) + reelLens[0]) % reelLens[0],
        (stops[1] - (startPos[1] % reelLens[1]) + reelLens[1]) % reelLens[1],
        (stops[2] - (startPos[2] % reelLens[2]) + reelLens[2]) % reelLens[2],
      ] as const;
      const steps = [
        deltas[0] + EXTRA_LOOPS[0] * reelLens[0],
        deltas[1] + EXTRA_LOOPS[1] * reelLens[1],
        deltas[2] + EXTRA_LOOPS[2] * reelLens[2],
      ] as const;
      const targets = [
        getReelOffsetForPosition(reelLens[0], startPos[0] + steps[0]),
        getReelOffsetForPosition(reelLens[1], startPos[1] + steps[1]),
        getReelOffsetForPosition(reelLens[2], startPos[2] + steps[2]),
      ] as const;

      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("Animation timeout")), 2000);
      });

      const animationPromise = new Promise<void>((resolve) => {
        let completed = 0;
        const onFinish = (reel: 0 | 1 | 2) => {
          reelPosRef.current[reel] = (startPos[reel] + steps[reel]) % reelLens[reel];
          completed += 1;
          if (completed === 3) resolve();
        };

        y0.value = withTiming(targets[0], { duration: SPIN_DURATIONS[0], easing: Easing.out(Easing.cubic) }, (f) => {
          if (f) runOnJS(onFinish)(0);
        });
        y1.value = withTiming(targets[1], { duration: SPIN_DURATIONS[1], easing: Easing.out(Easing.cubic) }, (f) => {
          if (f) runOnJS(onFinish)(1);
        });
        y2.value = withTiming(targets[2], { duration: SPIN_DURATIONS[2], easing: Easing.out(Easing.cubic) }, (f) => {
          if (f) runOnJS(onFinish)(2);
        });
      });

      try {
        await Promise.race([animationPromise, timeoutPromise]);
      } catch (error) {
        console.warn("[slot] Animation timeout or error", error);
      }
    },
    [reelLens, y0, y1, y2],
  );

  return { reelStyle0, reelStyle1, reelStyle2, spinTo, normalize };
}
