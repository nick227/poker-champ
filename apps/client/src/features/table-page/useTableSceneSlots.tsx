/**
 * Phase 1: Single source of slot content for TableSceneShell.
 * Router calls this and passes result to one TableSceneShell.
 */
import { useMemo } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { TablePageController } from "@/types/tableSceneContract";
import {
  type TableSceneShellProps,
  getLoadingSlots,
  getPlaceholderSlots,
  useIdleTableSlots,
  useActiveTableSlots,
} from "@/features/table";

export type UseTableSceneSlotsParams = {
  showStatusView: boolean;
  statusViewMode: TablePageController["scene"]["mode"];
  snapshot: TableSnapshotPayload | null;
  mode: TablePageController["scene"]["mode"];
  scene: TablePageController["scene"];
  renderModel: TablePageController["renderModel"];
  actions: TablePageController["actions"];
  /** Latched: true once when hasSnapshot && !holdDelayActive; drives real vs placeholder slots. */
  revealed: boolean;
  loadingParams: {
    onLoadingSlotSpinStart?: (spinDurationMs: number) => void;
    reducedMotion?: boolean;
  };
  emptyOpponentsState: React.ReactNode;
  heroAvatarUrl?: string | null;
};

/**
 * Returns slot props for the single TableSceneShell.
 * When showStatusView: loading slots (same layout, placeholders).
 * When !showStatusView: idle or active slots from hooks; if no snapshot yet, placeholder.
 */
export function useTableSceneSlots({
  showStatusView,
  statusViewMode,
  snapshot,
  mode,
  scene,
  renderModel,
  actions,
  revealed,
  loadingParams,
  emptyOpponentsState,
  heroAvatarUrl,
}: UseTableSceneSlotsParams): TableSceneShellProps {
  const loadingSlots = useMemo(
    () =>
      getLoadingSlots({
        mode: statusViewMode,
        scene,
        renderModel,
        actions,
        onLoadingSlotSpinStart: loadingParams.onLoadingSlotSpinStart,
        reducedMotion: loadingParams.reducedMotion,
      }),
    [
      statusViewMode,
      scene,
      renderModel,
      actions,
      loadingParams.onLoadingSlotSpinStart,
      loadingParams.reducedMotion,
    ],
  );

  const placeholderSlots = useMemo(
    () =>
      getPlaceholderSlots(renderModel.balanceCents, renderModel.tableTopBarRight),
    [renderModel.balanceCents, renderModel.tableTopBarRight],
  );

  const idleSlots = useIdleTableSlots(snapshot, scene, renderModel, actions, emptyOpponentsState);
  const activeSlots = useActiveTableSlots(
    snapshot,
    scene,
    renderModel,
    actions,
    emptyOpponentsState,
    heroAvatarUrl,
  );

  if (showStatusView) {
    return loadingSlots as TableSceneShellProps;
  }
  if (!revealed) {
    return placeholderSlots as TableSceneShellProps;
  }
  if (!snapshot) {
    return placeholderSlots as TableSceneShellProps;
  }
  if (mode === "idle") {
    return idleSlots;
  }
  if (mode === "active") {
    return activeSlots;
  }
  return placeholderSlots as TableSceneShellProps;
}
