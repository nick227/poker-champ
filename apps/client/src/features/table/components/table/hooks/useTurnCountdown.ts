import { useEffect, useRef, useState } from "react";
import { emitSoundEvent } from "@/sound/emitSoundEvent";

const TURN_TIMEOUT_BASE_MS = 19 * 60_000;
export const TURN_TIMEOUT_TOTAL_MS = 20 * 60_000;

export function useTurnProgress(isToAct: boolean, enabled: boolean = true): number | null {
  const [progress, setProgress] = useState<number | null>(null);
  const startAtMsRef = useRef<number | null>(null);
  const timerIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled || !isToAct) {
      if (timerIdRef.current != null) {
        clearInterval(timerIdRef.current);
        timerIdRef.current = null;
      }
      startAtMsRef.current = null;
      setProgress(null);
      return;
    }

    if (startAtMsRef.current == null) {
      startAtMsRef.current = Date.now();
    }

    if (timerIdRef.current != null) {
      return;
    }

    timerIdRef.current = setInterval(() => {
      const startedAt = startAtMsRef.current;
      if (startedAt == null) return;

      const elapsed = Date.now() - startedAt;
      const remainingMs = TURN_TIMEOUT_TOTAL_MS - elapsed;

      if (remainingMs <= 0) {
        setProgress(null);
        return;
      }

      setProgress(remainingMs / TURN_TIMEOUT_TOTAL_MS);
    }, 100);

    return () => {
      if (timerIdRef.current != null) {
        clearInterval(timerIdRef.current);
        timerIdRef.current = null;
      }
    };
  }, [isToAct, enabled]);

  return progress;
}

export function useTurnCountdown(isMyTurn: boolean, enabled: boolean = true): number | null {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const startAtMsRef = useRef<number | null>(null);
  const timerIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownStartedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!enabled || !isMyTurn) {
      if (timerIdRef.current != null) {
        clearInterval(timerIdRef.current);
        timerIdRef.current = null;
      }
      startAtMsRef.current = null;
      setRemainingSeconds(null);
      countdownStartedRef.current = false;
      return;
    }

    // New turn window: start local clock once when we first become to-act.
    if (startAtMsRef.current == null) {
      startAtMsRef.current = Date.now();
    }

    if (timerIdRef.current != null) {
      return;
    }

    timerIdRef.current = setInterval(() => {
      const startedAt = startAtMsRef.current;
      if (startedAt == null) return;

      const elapsed = Date.now() - startedAt;

      if (elapsed < TURN_TIMEOUT_BASE_MS) {
        // Still in the free-thinking window; no countdown.
        if (remainingSeconds !== null) {
          setRemainingSeconds(null);
        }
        countdownStartedRef.current = false;
        return;
      }

      const remainingMs = TURN_TIMEOUT_TOTAL_MS - elapsed;
      if (remainingMs <= 0) {
        // Timeout window has effectively expired; hide the countdown.
        setRemainingSeconds(null);
        countdownStartedRef.current = false;
        return;
      }

      const nextSeconds = Math.ceil(remainingMs / 1000);
      setRemainingSeconds(nextSeconds);

      if (!countdownStartedRef.current) {
        countdownStartedRef.current = true;
        emitSoundEvent("table.turnTimeoutWarning");
      }
    }, 250);

    return () => {
      if (timerIdRef.current != null) {
        clearInterval(timerIdRef.current);
        timerIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, enabled]);

  return remainingSeconds;
}
