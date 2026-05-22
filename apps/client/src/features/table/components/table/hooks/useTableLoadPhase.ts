import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConnectionStatus } from "@/features/table";
import {
  computeTableLoadPhaseState,
  logTableLoadEvent,
  type TableLoadPhase,
  type TableLoadSignals,
} from "@/lib/tableLoadPhase";

type UseTableLoadPhaseOptions = {
  tableId: string;
  authHydrated: boolean;
  hasAuthToken: boolean;
  hasSnapshot: boolean;
  snapshotSeq?: number;
  connectionStatus: ConnectionStatus;
  loadSignals: TableLoadSignals;
  tableError?: string;
};

export function useTableLoadPhase({
  tableId,
  authHydrated,
  hasAuthToken,
  hasSnapshot,
  snapshotSeq,
  connectionStatus,
  loadSignals,
  tableError,
}: UseTableLoadPhaseOptions) {
  const [forcedPhase, setForcedPhase] = useState<TableLoadPhase | undefined>();
  const [recoveryAttemptCount, setRecoveryAttemptCount] = useState(0);
  const phaseStartedAtRef = useRef(Date.now());
  const lastLoggedPhaseRef = useRef<TableLoadPhase | null>(null);
  const lastTimeoutLoggedRef = useRef(false);

  const basePhase = useMemo(
    () =>
      computeTableLoadPhaseState({
        authHydrated,
        hasAuthToken,
        hasSnapshot,
        connectionStatus,
        signals: loadSignals,
        forcedPhase,
        phaseStartedAt: phaseStartedAtRef.current,
      }),
    [
      authHydrated,
      hasAuthToken,
      hasSnapshot,
      connectionStatus,
      loadSignals,
      forcedPhase,
      snapshotSeq,
    ],
  );

  useEffect(() => {
    phaseStartedAtRef.current = Date.now();
    lastTimeoutLoggedRef.current = false;
    setForcedPhase(undefined);
    setRecoveryAttemptCount(0);
    lastLoggedPhaseRef.current = null;
  }, [tableId]);

  useEffect(() => {
    if (basePhase.phase === lastLoggedPhaseRef.current) return;
    lastLoggedPhaseRef.current = basePhase.phase;
    logTableLoadEvent("table_load_phase_changed", {
      tableId,
      phase: basePhase.phase,
      connectionStatus,
      snapshotSeq: snapshotSeq ?? null,
      elapsedMs: Date.now() - phaseStartedAtRef.current,
    });
  }, [basePhase.phase, tableId, connectionStatus, snapshotSeq]);

  useEffect(() => {
    if (!basePhase.timedOut || lastTimeoutLoggedRef.current) return;
    lastTimeoutLoggedRef.current = true;
    logTableLoadEvent("table_load_timeout", {
      tableId,
      phase: basePhase.phase,
      connectionStatus,
      snapshotSeq: snapshotSeq ?? null,
      elapsedMs: Date.now() - phaseStartedAtRef.current,
      lastError: tableError ?? null,
    });
  }, [basePhase.timedOut, basePhase.phase, tableId, connectionStatus, snapshotSeq, tableError]);

  const beginRecovering = useCallback(() => {
    phaseStartedAtRef.current = Date.now();
    lastTimeoutLoggedRef.current = false;
    setForcedPhase("recovering_table");
    setRecoveryAttemptCount((n) => n + 1);
  }, []);

  const markFailed = useCallback(
    (message?: string) => {
      phaseStartedAtRef.current = Date.now();
      setForcedPhase("failed");
      logTableLoadEvent("table_recovery_failed", {
        tableId,
        phase: "failed",
        lastError: message ?? tableError ?? null,
        recoveryAttemptCount,
      });
    },
    [tableId, tableError, recoveryAttemptCount],
  );

  const markReady = useCallback(() => {
    setForcedPhase(undefined);
    phaseStartedAtRef.current = Date.now();
    lastTimeoutLoggedRef.current = false;
  }, []);

  const resetForRetry = useCallback(() => {
    phaseStartedAtRef.current = Date.now();
    lastTimeoutLoggedRef.current = false;
    setForcedPhase(undefined);
  }, []);

  return {
    ...basePhase,
    recoveryAttemptCount,
    beginRecovering,
    markFailed,
    markReady,
    resetForRetry,
  };
}
