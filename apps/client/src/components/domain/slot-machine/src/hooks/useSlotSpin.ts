import React, { useCallback, useState } from "react";
import { Easing, withSequence, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import {
  FAILED_READOUT,
  IDLE_READOUT,
  SPINNING_READOUT,
  isNearWin,
  settleReadout,
  type MachineReadout,
} from "../engine/display";
import { NEAR_WIN_LINGER_MS, type SpinToOptions } from "./useSlotReelMotion";
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
  spinTo: (stops: readonly [number, number, number], options?: SpinToOptions) => Promise<void>;
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
  const [readout, setReadout] = useState<MachineReadout>(IDLE_READOUT);
  const [busy, setBusy] = useState(false);
  const [nearWin, setNearWin] = useState(false);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleSpin = useCallback(async () => {
    if (lock.locked || bank < betCents) return;

    lock.lock();
    setBusy(true);
    onSpinStart?.();
    setBank((b: number) => Math.max(0, b - betCents));
    setReadout(SPINNING_READOUT);
    normalizeReelPositions();

    emitSoundEvent("slot.pull");
    emitSoundEvent("slot.reelSpin");

    try {
      void Haptics.selectionAsync();
    } catch {
      /* native only */
    }
    pressScale.value = withSequence(
      withTiming(0.94, { duration: 50, easing: Easing.out(Easing.quad) }),
      withTiming(1.0, { duration: 110, easing: Easing.out(Easing.quad) }),
    );

    try {
      const spun = engine.spin();
      const lingerMs = isNearWin(spun.result, spun.isJackpot) ? NEAR_WIN_LINGER_MS : 0;
      if (mountedRef.current) setNearWin(lingerMs > 0);
      await spinTo(spun.stops, { lingerMs, reducedMotion });
      if (mountedRef.current) setNearWin(false);

      if (!mountedRef.current) {
        lock.unlock();
        return;
      }

      emitSoundEvent("slot.reelStop");

      const win = spun.winUnits * betCents;
      if (win > 0) {
        setBank((b: number) => b + win);
      }

      const next = settleReadout({
        kind: spun.outcomeKind,
        matchedSymbol: spun.matchedSymbol,
        isJackpot: spun.isJackpot,
        winCents: win,
        result: spun.result as SymbolKey[],
      });
      setReadout(next);

      if (win > 0) {
        emitSoundEvent("slot.win");
        playWinFx(spun.isJackpot, win / betCents, win, reducedMotion);
      }

      onSpinComplete?.(win);
    } catch (error) {
      if (mountedRef.current) {
        console.warn("[slot] spin aborted", error);
        setReadout(FAILED_READOUT);
      }
    } finally {
      if (mountedRef.current) {
        setNearWin(false);
        lock.unlock();
        setBusy(false);
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

  return { readout, busy, nearWin, handleSpin };
}
