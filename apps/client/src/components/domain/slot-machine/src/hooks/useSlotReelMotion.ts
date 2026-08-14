import { useCallback, useEffect, useRef } from "react";
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { normalizeReelPositions } from "../engine/reelMath";

const PAD_ROWS = 2;
const BASE_COPY_INDEX = 2;
const EXTRA_LOOPS: readonly [number, number, number] = [1, 2, 2];
export const SPIN_DURATIONS = [780, 1140, 1520] as const;
export const REEL_SETTLE_MS = 150;
export const NEAR_WIN_LINGER_MS = 420;
export const LONGEST_SPIN_MS = SPIN_DURATIONS[2] + REEL_SETTLE_MS + NEAR_WIN_LINGER_MS;

const REEL_STOP = Easing.bezier(0.12, 0.72, 0.18, 1);

function getReelOffsetForPosition(symbolHeight: number, stripLen: number, reelPosition: number): number {
  return -((PAD_ROWS + BASE_COPY_INDEX * stripLen + reelPosition - 1) * symbolHeight);
}

export type SpinToOptions = {
  lingerMs?: number;
  reducedMotion?: boolean;
};

export function useSlotReelMotion(
  reelLens: readonly [number, number, number],
  symbolHeight: number,
) {
  const y0 = useSharedValue(0);
  const y1 = useSharedValue(0);
  const y2 = useSharedValue(0);
  const reelPosRef = useRef<[number, number, number]>([0, 0, 0]);
  const heightRef = useRef(symbolHeight);
  heightRef.current = symbolHeight;

  useEffect(() => {
    const nextPos = normalizeReelPositions(reelPosRef.current, reelLens);
    reelPosRef.current = nextPos;
    const h = heightRef.current;
    y0.value = getReelOffsetForPosition(h, reelLens[0], nextPos[0]);
    y1.value = getReelOffsetForPosition(h, reelLens[1], nextPos[1]);
    y2.value = getReelOffsetForPosition(h, reelLens[2], nextPos[2]);
  }, [reelLens, symbolHeight, y0, y1, y2]);

  const reelStyle0 = useAnimatedStyle(() => ({ transform: [{ translateY: y0.value }] }));
  const reelStyle1 = useAnimatedStyle(() => ({ transform: [{ translateY: y1.value }] }));
  const reelStyle2 = useAnimatedStyle(() => ({ transform: [{ translateY: y2.value }] }));

  const normalize = useCallback(() => {
    const nextPos = normalizeReelPositions(reelPosRef.current, reelLens);
    reelPosRef.current = nextPos;
    const h = heightRef.current;
    y0.value = getReelOffsetForPosition(h, reelLens[0], nextPos[0]);
    y1.value = getReelOffsetForPosition(h, reelLens[1], nextPos[1]);
    y2.value = getReelOffsetForPosition(h, reelLens[2], nextPos[2]);
  }, [reelLens, y0, y1, y2]);

  const spinTo = useCallback(
    async (stops: readonly [number, number, number], options: SpinToOptions = {}) => {
      const lingerMs = options.lingerMs ?? 0;
      const reduced = options.reducedMotion === true;
      const h = heightRef.current;
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
        getReelOffsetForPosition(h, reelLens[0], startPos[0] + steps[0]),
        getReelOffsetForPosition(h, reelLens[1], startPos[1] + steps[1]),
        getReelOffsetForPosition(h, reelLens[2], startPos[2] + steps[2]),
      ] as const;
      const durations: [number, number, number] = reduced
        ? [240, 320, 400]
        : [SPIN_DURATIONS[0], SPIN_DURATIONS[1], SPIN_DURATIONS[2] + lingerMs];
      const settle = reduced ? 0 : REEL_SETTLE_MS;
      const overshoot = reduced ? 0 : Math.max(6, Math.round(h * 0.08));
      const budget = Math.max(...durations) + settle + 800;

      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("Animation timeout")), budget);
      });

      const animationPromise = new Promise<void>((resolve) => {
        let completed = 0;
        const onFinish = (reel: 0 | 1 | 2) => {
          reelPosRef.current[reel] = (startPos[reel] + steps[reel]) % reelLens[reel];
          completed += 1;
          if (completed === 3) resolve();
        };

        const run = (
          y: typeof y0,
          target: number,
          duration: number,
          reel: 0 | 1 | 2,
        ) => {
          if (settle <= 0 || overshoot <= 0) {
            y.value = withTiming(target, { duration, easing: REEL_STOP }, (f) => {
              if (f) runOnJS(onFinish)(reel);
            });
            return;
          }
          y.value = withSequence(
            withTiming(target - overshoot, { duration, easing: REEL_STOP }),
            withTiming(target, { duration: settle, easing: Easing.out(Easing.quad) }, (f) => {
              if (f) runOnJS(onFinish)(reel);
            }),
          );
        };

        run(y0, targets[0], durations[0], 0);
        run(y1, targets[1], durations[1], 1);
        run(y2, targets[2], durations[2], 2);
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
