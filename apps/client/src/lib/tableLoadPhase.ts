import type { ConnectionStatus } from "@/features/table";

export type TableLoadPhase =
  | "resolving_table"
  | "joining_room"
  | "waiting_welcome"
  | "waiting_snapshot"
  | "restoring_session"
  | "recovering_table"
  | "ready"
  | "failed";

export const TABLE_SNAPSHOT_WAIT_TIMEOUT_MS = 9_000;
export const TABLE_SESSION_RESTORE_SNAPSHOT_TIMEOUT_MS = 9_000;
export const MAX_TABLE_AUTO_RECOVERY_ATTEMPTS = 1;

export type TableLoadSignals = {
  welcomeAt?: number;
  sessionRestoreAt?: number;
  snapshotAt?: number;
};

export type TableLoadPhaseInput = {
  authHydrated: boolean;
  hasAuthToken: boolean;
  hasSnapshot: boolean;
  connectionStatus: ConnectionStatus;
  signals: TableLoadSignals;
  forcedPhase?: TableLoadPhase;
  nowMs?: number;
};

export type TableLoadPhaseState = {
  phase: TableLoadPhase;
  phaseStartedAt: number;
  showRecovery: boolean;
  timedOut: boolean;
};

export type TableLoadLogEvent =
  | "table_load_phase_changed"
  | "table_load_timeout"
  | "table_recovery_attempt"
  | "table_recovery_success"
  | "table_recovery_failed"
  | "stale_roomid_replaced"
  | "cash_table_recovery_unavailable";

export function logTableLoadEvent(event: TableLoadLogEvent, fields: Record<string, unknown>): void {
  console.log(`[TABLE_LOAD] ${event}`, fields);
}

export function resolveTableLoadPhase(input: TableLoadPhaseInput): TableLoadPhase {
  if (input.forcedPhase) return input.forcedPhase;
  if (!input.authHydrated) return "resolving_table";
  if (!input.hasAuthToken) return "resolving_table";
  if (input.hasSnapshot) return "ready";

  const now = input.nowMs ?? Date.now();
  const { welcomeAt, sessionRestoreAt, snapshotAt } = input.signals;

  if (sessionRestoreAt != null && (snapshotAt == null || snapshotAt < sessionRestoreAt)) {
    return "restoring_session";
  }

  if (input.connectionStatus === "RECONNECTING") {
    return "joining_room";
  }

  if (input.connectionStatus === "CONNECTED") {
    if (welcomeAt == null) return "waiting_welcome";
    return "waiting_snapshot";
  }

  if (welcomeAt != null) return "waiting_snapshot";
  return "joining_room";
}

export function shouldShowTableLoadRecovery(
  phase: TableLoadPhase,
  timedOut: boolean,
  forcedFailed: boolean,
): boolean {
  return forcedFailed || phase === "failed" || (timedOut && phase !== "ready");
}

export function isTableLoadPhaseTimedOut(
  phase: TableLoadPhase,
  phaseStartedAt: number,
  signals: TableLoadSignals,
  nowMs: number = Date.now(),
): boolean {
  if (phase === "ready" || phase === "failed" || phase === "recovering_table") {
    return false;
  }

  const elapsed = nowMs - phaseStartedAt;
  if (phase === "restoring_session" && signals.sessionRestoreAt != null) {
    const sinceRestore = nowMs - signals.sessionRestoreAt;
    return sinceRestore >= TABLE_SESSION_RESTORE_SNAPSHOT_TIMEOUT_MS;
  }

  if (
    phase === "waiting_snapshot" ||
    phase === "waiting_welcome" ||
    phase === "joining_room" ||
    phase === "resolving_table"
  ) {
    return elapsed >= TABLE_SNAPSHOT_WAIT_TIMEOUT_MS;
  }

  return false;
}

export function loadPhaseStatusMessage(phase: TableLoadPhase, timedOut: boolean): string {
  if (timedOut) return "Still restoring your table…";
  switch (phase) {
    case "resolving_table":
      return "Preparing your table…";
    case "joining_room":
      return "Connecting to table…";
    case "waiting_welcome":
      return "Joining table…";
    case "waiting_snapshot":
      return "Loading table state…";
    case "restoring_session":
      return "Restoring your session…";
    case "recovering_table":
      return "Recovering table connection…";
    case "failed":
      return "Could not load this table.";
    default:
      return "Connecting to table…";
  }
}

export function computeTableLoadPhaseState(input: TableLoadPhaseInput & {
  forcedFailed?: boolean;
  phaseStartedAt?: number;
}): TableLoadPhaseState {
  const nowMs = input.nowMs ?? Date.now();
  const phase = input.forcedFailed ? "failed" : resolveTableLoadPhase(input);
  const phaseStartedAt = input.phaseStartedAt ?? nowMs;
  const timedOut =
    !input.forcedFailed &&
    !input.hasSnapshot &&
    isTableLoadPhaseTimedOut(phase, phaseStartedAt, input.signals, nowMs);
  const showRecovery = shouldShowTableLoadRecovery(phase, timedOut, Boolean(input.forcedFailed));

  return { phase, phaseStartedAt, showRecovery, timedOut };
}
