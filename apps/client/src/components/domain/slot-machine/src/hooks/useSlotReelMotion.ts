import { useCallback, useEffect, useRef } from "react";
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { normalizeReelPositions } from "../engine/reelMath";

const PAD_ROWS = 2;
const BASE_COPY_INDEX = 2;
const EXTRA_LOOPS: readonly [number, number, number] = [2, 3, 3];
export const SPIN_DURATIONS = [1250, 1700, 2200] as const;
export const NEAR_WIN_LINGER_MS = 420;
export const LONGEST_SPIN_MS = SPIN_DURATIONS[2] + NEAR_WIN_LINGER_MS;
/** x2 must be >= x1 or the curve is non-monotonic and the strip jumps. */
const REEL_EASING = Easing.bezier(0.25, 0.0, 0.2, 1);

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
  const spinningRef = useRef(false);

  const applyOffsets = useCallback(
    (pos: readonly [number, number, number], h: number) => {
      y0.value = getReelOffsetForPosition(h, reelLens[0], pos[0]);
      y1.value = getReelOffsetForPosition(h, reelLens[1], pos[1]);
      y2.value = getReelOffsetForPosition(h, reelLens[2], pos[2]);
    },
    [reelLens, y0, y1, y2],
  );

  useEffect(() => {
    if (spinningRef.current) return;
    heightRef.current = symbolHeight;
    const nextPos = normalizeReelPositions(reelPosRef.current, reelLens);
    reelPosRef.current = nextPos;
    applyOffsets(nextPos, symbolHeight);
  }, [applyOffsets, reelLens, symbolHeight]);

  const reelStyle0 = useAnimatedStyle(() => ({ transform: [{ translateY: y0.value }] }));
  const reelStyle1 = useAnimatedStyle(() => ({ transform: [{ translateY: y1.value }] }));
  const reelStyle2 = useAnimatedStyle(() => ({ transform: [{ translateY: y2.value }] }));

  const normalize = useCallback(() => {
    const nextPos = normalizeReelPositions(reelPosRef.current, reelLens);
    reelPosRef.current = nextPos;
    applyOffsets(nextPos, heightRef.current);
  }, [applyOffsets, reelLens]);

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
      const endPos: [number, number, number] = [
        (startPos[0] + steps[0]) % reelLens[0],
        (startPos[1] + steps[1]) % reelLens[1],
        (startPos[2] + steps[2]) % reelLens[2],
      ];
      const targets = [
        getReelOffsetForPosition(h, reelLens[0], startPos[0] + steps[0]),
        getReelOffsetForPosition(h, reelLens[1], startPos[1] + steps[1]),
        getReelOffsetForPosition(h, reelLens[2], startPos[2] + steps[2]),
      ] as const;
      const durations: [number, number, number] = reduced
        ? [240, 320, 400]
        : [SPIN_DURATIONS[0], SPIN_DURATIONS[1], SPIN_DURATIONS[2] + lingerMs];
      const budget = Math.max(...durations) + 800;

      spinningRef.current = true;

      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("Animation timeout")), budget);
      });

      const animationPromise = new Promise<void>((resolve) => {
        let completed = 0;
        const onFinish = (reel: 0 | 1 | 2) => {
          reelPosRef.current[reel] = endPos[reel];
          completed += 1;
          if (completed === 3) resolve();
        };

        y0.value = withTiming(targets[0], { duration: durations[0], easing: REEL_EASING }, (f) => {
          if (f) runOnJS(onFinish)(0);
        });
        y1.value = withTiming(targets[1], { duration: durations[1], easing: REEL_EASING }, (f) => {
          if (f) runOnJS(onFinish)(1);
        });
        y2.value = withTiming(targets[2], { duration: durations[2], easing: REEL_EASING }, (f) => {
          if (f) runOnJS(onFinish)(2);
        });
      });

      try {
        await Promise.race([animationPromise, timeoutPromise]);
      } catch {
        y0.value = targets[0];
        y1.value = targets[1];
        y2.value = targets[2];
      } finally {
        reelPosRef.current = endPos;
        applyOffsets(endPos, h);
        spinningRef.current = false;
      }
    },
    [applyOffsets, reelLens, y0, y1, y2],
  );

  return { reelStyle0, reelStyle1, reelStyle2, spinTo, normalize };
}
