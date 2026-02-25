import React, { useCallback, useState } from "react";
import { Easing, runOnJS, withSequence, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { formatCents } from "../engine/format";
import { tierForProbability } from "../engine/tuning";
import { toOddsText, outcomeLabel } from "../engine/display";
import { normalizeReelPositions } from "../engine/reelMath";
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

interface UseSlotSpinProps {
  bank: number;
  betCents: number;
  engine: {
    spin: () => SpinResult;
  };
  lock: {
    locked: boolean;
    lock: () => void;
    unlock: () => void;
  };
  onSpinComplete?: (winCents: number) => void;
  payoutTiers: any;
  setBank: (updater: (current: number) => number) => void;
  spinTo: (stops: readonly [number, number, number]) => Promise<void>;
  normalizeReelPositions: () => void;
  pressScale: {
    value: number;
  };
  winPulse: {
    value: number;
  };
  jackpotPulse: {
    value: number;
  };
}

export function useSlotSpin({
  bank,
  betCents,
  engine,
  lock,
  onSpinComplete,
  payoutTiers,
  setBank,
  spinTo,
  normalizeReelPositions,
  pressScale,
  winPulse,
  jackpotPulse,
}: UseSlotSpinProps) {
  const [machineOutput, setMachineOutput] = useState("No Match");
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const cueSmallWin = useCallback(() => {
    winPulse.value = 0;
    winPulse.value = withSequence(withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 220 }));
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  }, [winPulse]);

  const cueJackpot = useCallback(() => {
    jackpotPulse.value = 0;
    winPulse.value = 0;
    jackpotPulse.value = withSequence(withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 520, easing: Easing.inOut(Easing.quad) }));
    winPulse.value = withSequence(withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 480 }));
    try {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  }, [jackpotPulse, winPulse]);

  const handleSpin = useCallback(async () => {
    // MVP Rule: Lock must be synchronous and checked first
    if (lock.locked || bank < betCents) return;

    // Lock immediately to prevent double-spin race
    lock.lock();

    // MVP Rule: Deduct bet first, credit win later
    setBank((b: number) => Math.max(0, b - betCents));
    
    setMachineOutput("Spinning...");
    normalizeReelPositions();

    emitSoundEvent("slot.pull");
    emitSoundEvent("slot.reelSpin");

    try {
      void Haptics.selectionAsync();
    } catch {}
    pressScale.value = withSequence(withTiming(0.97, { duration: 50, easing: Easing.out(Easing.quad) }), withTiming(1.0, { duration: 90, easing: Easing.out(Easing.quad) }));

    try {
      const { stops, result, winUnits, isJackpot, outcomeKind, matchedSymbol, probability } = engine.spin();
      await spinTo(stops);
      
      if (!mountedRef.current) {
        lock.unlock();
        return;
      }
      
      emitSoundEvent("slot.reelStop");

      // MVP Rule: Credit win separately after successful spin
      const win = winUnits * betCents;
      if (win > 0) {
        setBank((b: number) => b + win);
      }
      
      const combo = result.join("-");
      if (win > 0) {
        emitSoundEvent("slot.win");
        const tierLabel = tierForProbability(probability, isJackpot, payoutTiers).label;
        const odds = toOddsText(probability);
        const outcome = outcomeLabel(outcomeKind, combo, matchedSymbol);
        setMachineOutput(`${outcome} pays ${formatCents(win)} (${odds})`);
        isJackpot ? cueJackpot() : cueSmallWin();
      } else {
        setMachineOutput(`No Match`);
      }

      if (onSpinComplete) onSpinComplete(win);
    } catch (error) {
      if (mountedRef.current) {
        console.warn("[slot] spin aborted", error);
        setMachineOutput("Spin Failed");
      }
    } finally {
      // Always unlock, even on error or unmount
      if (mountedRef.current) {
        lock.unlock();
      }
    }
  }, [lock, bank, betCents, normalizeReelPositions, pressScale, engine, spinTo, setBank, payoutTiers, cueJackpot, cueSmallWin, onSpinComplete]);

  return {
    machineOutput,
    handleSpin,
  };
}
