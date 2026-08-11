import React, { useCallback, useState } from "react";
import { Easing, withSequence, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { formatCents } from "../engine/format";
import { toOddsText, outcomeLabel } from "../engine/display";
import type { SlotOutcomeKind, SymbolKey } from "../games/types";

import { emitSoundEvent } from "@/sound/emitSoundEvent";

interface SpinResult {
  stops: readonly [number, number, number];
  result: readonly string[];
  winUnits: number;
  isJackpot: boolean;
  outcomeKind: SlotOutcomeKind;
  matchedSymbol?: SymbolKey;
  probability: number;
}

type SharedNum = { value: number };

interface UseSlotSpinProps {
  bank: number;
  betCents: number;
  engine: { spin: () => SpinResult };
  lock: { locked: boolean; lock: () => void; unlock: () => void };
  onSpinComplete?: (winCents: number) => void;
  onSpinStart?: () => void;
  setBank: (updater: (current: number) => number) => void;
  spinTo: (stops: readonly [number, number, number]) => Promise<void>;
  normalizeReelPositions: () => void;
  pressScale: SharedNum;
  playWinFx: (isJackpot: boolean, winMultiplier: number, winCents: number, reducedMotion?: boolean) => void;
  reducedMotion?: boolean;
}

export function useSlotSpin({
  bank,
  betCents,
  engine,
  lock,
  onSpinComplete,
  onSpinStart,
  setBank,
  spinTo,
  normalizeReelPositions,
  pressScale,
  playWinFx,
  reducedMotion = false,
}: UseSlotSpinProps) {
  const [machineOutput, setMachineOutput] = useState("No Match");
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleSpin = useCallback(async () => {
    if (lock.locked || bank < betCents) return;

    lock.lock();
    onSpinStart?.();
    setBank((b: number) => Math.max(0, b - betCents));
    setMachineOutput("Spinning...");
    normalizeReelPositions();

    emitSoundEvent("slot.pull");
    emitSoundEvent("slot.reelSpin");

    try {
      void Haptics.selectionAsync();
    } catch {
      /* native only */
    }
    pressScale.value = withSequence(
      withTiming(0.97, { duration: 50, easing: Easing.out(Easing.quad) }),
      withTiming(1.0, { duration: 90, easing: Easing.out(Easing.quad) }),
    );

    try {
      const { stops, result, winUnits, isJackpot, outcomeKind, matchedSymbol, probability } = engine.spin();
      await spinTo(stops);

      if (!mountedRef.current) {
        lock.unlock();
        return;
      }

      emitSoundEvent("slot.reelStop");

      const win = winUnits * betCents;
      if (win > 0) {
        setBank((b: number) => b + win);
      }

      const combo = result.join("-");
      if (win > 0) {
        emitSoundEvent("slot.win");
        const odds = toOddsText(probability);
        const outcome = outcomeLabel(outcomeKind, combo, matchedSymbol);
        const winMultiplier = win / betCents;
        setMachineOutput(`${outcome} pays ${formatCents(win)} (${odds})`);
        playWinFx(isJackpot, winMultiplier, win, reducedMotion);
      } else {
        setMachineOutput("No Match");
      }

      onSpinComplete?.(win);
    } catch (error) {
      if (mountedRef.current) {
        console.warn("[slot] spin aborted", error);
        setMachineOutput("Spin Failed");
      }
    } finally {
      if (mountedRef.current) {
        lock.unlock();
      }
    }
  }, [
    lock,
    bank,
    betCents,
    normalizeReelPositions,
    pressScale,
    engine,
    spinTo,
    setBank,
    playWinFx,
    reducedMotion,
    onSpinComplete,
    onSpinStart,
  ]);

  return {
    machineOutput,
    handleSpin,
  };
}
