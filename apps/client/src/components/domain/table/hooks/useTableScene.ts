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
  canDeleteTable: boolean;
  canAddBot: boolean;
};

export type TableTopBarFlags = {
  showDelete: boolean;
  showAddBot: boolean;
  showChat: boolean;
  showClose: boolean;
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
    canDeleteTable,
    canAddBot,
  } = params;

  const sceneMode = useMemo(
    () =>
      resolveTableSceneMode({
        authHydrated,
        hasAuthToken,
        hasSnapshot,
        hasActiveHand,
      }),
    [authHydrated, hasAuthToken, hasSnapshot, hasActiveHand]
  );

  const tableTopBarFlags = useMemo(
    () => getTableTopBarFlags({ canDeleteTable, canAddBot }),
    [canDeleteTable, canAddBot]
  );

  return { sceneMode, tableTopBarFlags };
}
