import type { TableSceneModel } from "@/components/domain/table/model/useTableSceneModel";

const REPLAY_DISABLED_ACTIONS = {
  FOLD: false,
  CHECK: false,
  CALL: false,
  ALL_IN: false,
  WAGER: false,
} as const;

/**
 * Returns a frozen scene model with actions disabled for replay (no stray action buttons).
 * Freezing prevents accidental mutation.
 */
export function buildReplayDisabledSceneModel(
  sceneModel: TableSceneModel,
): TableSceneModel {
  const allowedActions = Object.freeze({ ...REPLAY_DISABLED_ACTIONS });
  const actionContext = Object.freeze({
    ...sceneModel.actionContext,
    showActions: false,
    allowedActions,
  });
  return Object.freeze({
    ...sceneModel,
    canAct: false,
    actionContext,
  });
}

