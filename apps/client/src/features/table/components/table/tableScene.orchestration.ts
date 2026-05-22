export type TableSceneMode = "auth_loading" | "auth_required" | "connecting" | "idle" | "active";

export function resolveTableSceneMode(params: {
  authHydrated: boolean;
  hasAuthToken: boolean;
  hasSnapshot: boolean;
  hasActiveHand: boolean;
  showLoadRecovery?: boolean;
}): TableSceneMode {
  if (!params.authHydrated) return "auth_loading";
  if (!params.hasAuthToken) return "auth_required";
  if (!params.hasSnapshot || params.showLoadRecovery) return "connecting";
  if (!params.hasActiveHand) return "idle";
  return "active";
}

export function getTableTopBarFlags(params: {
  canAddBot: boolean;
}) {
  return {
    showAddBot: params.canAddBot,
  };
}

export function shouldKeepOverlaysMountedAcrossModeChange(
  previousMode: TableSceneMode,
  nextMode: TableSceneMode,
): boolean {
  const interactive = new Set<TableSceneMode>(["idle", "active"]);
  return interactive.has(previousMode) && interactive.has(nextMode);
}
