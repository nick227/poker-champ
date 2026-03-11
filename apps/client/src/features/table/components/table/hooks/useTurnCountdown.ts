import { useEffect, useRef, useState } from "react";
import { emitSoundEvent } from "@/sound/emitSoundEvent";

/** Fallback only when server does not send turnTimeoutTotalMs (e.g. old server). */
const FALLBACK_TURN_TIMEOUT_MS = 20 * 60_000;

/** Countdown is shown for the last this many ms so user gets at least 10s warning. */
export const MIN_COUNTDOWN_WARNING_MS = 10_000;

export function useTurnProgress(
  isToAct: boolean,
  enabled: boolean = true,
  turnTimeoutTotalMs?: number,
): number | null {
  const totalMs = turnTimeoutTotalMs ?? FALLBACK_TURN_TIMEOUT_MS;
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
      const remainingMs = totalMs - elapsed;

      if (remainingMs <= 0) {
        setProgress(null);
        return;
      }

      setProgress(remainingMs / totalMs);
    }, 100);

    return () => {
      if (timerIdRef.current != null) {
        clearInterval(timerIdRef.current);
        timerIdRef.current = null;
      }
    };
  }, [isToAct, enabled, totalMs]);

  return progress;
}

export function useTurnCountdown(
  isMyTurn: boolean,
  enabled: boolean = true,
  turnDeadlineMs?: number,
  turnTimeoutTotalMs?: number,
): number | null {
  const totalMs = turnTimeoutTotalMs ?? FALLBACK_TURN_TIMEOUT_MS;
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const timerIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownStartedRef = useRef<boolean>(false);
  const startAtMsRef = useRef<number | null>(null);

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

    if (startAtMsRef.current == null) {
      startAtMsRef.current = Date.now();
    }

    if (timerIdRef.current != null) {
      return;
    }

    timerIdRef.current = setInterval(() => {
      const now = Date.now();
      const remainingMs =
        turnDeadlineMs != null && turnDeadlineMs > 0
          ? turnDeadlineMs - now
          : totalMs - (now - (startAtMsRef.current ?? now));

      if (remainingMs <= 0) {
        setRemainingSeconds(null);
        countdownStartedRef.current = false;
        return;
      }

      if (remainingMs > MIN_COUNTDOWN_WARNING_MS) {
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
  }, [isMyTurn, enabled, turnDeadlineMs, totalMs]);

  return remainingSeconds;
}
