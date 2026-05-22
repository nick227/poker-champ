import { useMemo } from "react";
import {
  getTableTopBarFlags,
  resolveTableSceneMode,
  type TableSceneMode,
} from "../tableScene.orchestration";

export type TableSceneParams = {
  authHydrated: boolean;
  hasAuthToken: boolean;
  hasSnapshot: boolean;
  hasActiveHand: boolean;
  canAddBot: boolean;
  showLoadRecovery?: boolean;
};

export type TableTopBarFlags = {
  showAddBot: boolean;
};

export function useTableScene(params: TableSceneParams): {
  sceneMode: TableSceneMode;
  tableTopBarFlags: TableTopBarFlags;
} {
  const {
    authHydrated,
    hasAuthToken,
    hasSnapshot,
    hasActiveHand,
    canAddBot,
    showLoadRecovery,
  } = params;

  const sceneMode = useMemo(
    () =>
      resolveTableSceneMode({
        authHydrated,
        hasAuthToken,
        hasSnapshot,
        hasActiveHand,
        showLoadRecovery,
      }),
    [authHydrated, hasAuthToken, hasSnapshot, hasActiveHand, showLoadRecovery]
  );

  const tableTopBarFlags = useMemo(
    () => getTableTopBarFlags({ canAddBot }),
    [canAddBot]
  );

  return { sceneMode, tableTopBarFlags };
}
