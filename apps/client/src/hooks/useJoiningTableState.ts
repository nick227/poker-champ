import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_JOIN_TIMEOUT_MS = 8000;

export function useJoiningTableState(timeoutMs: number = DEFAULT_JOIN_TIMEOUT_MS) {
  const [joiningTableId, setJoiningTableId] = useState<string | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearJoining = useCallback((tableId?: string) => {
    setJoiningTableId((current) => {
      if (!tableId || current === tableId) return null;
      return current;
    });
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  const beginJoining = useCallback((tableId: string) => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    setJoiningTableId(tableId);
    resetTimerRef.current = setTimeout(() => {
      setJoiningTableId((current) => (current === tableId ? null : current));
      resetTimerRef.current = null;
    }, timeoutMs);
  }, [timeoutMs]);

  const isJoining = useCallback((tableId: string) => joiningTableId === tableId, [joiningTableId]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  return { joiningTableId, beginJoining, clearJoining, isJoining };
}
