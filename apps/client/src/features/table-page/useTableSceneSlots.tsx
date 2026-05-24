/**
 * Phase 1: Single source of slot content for TableSceneShell.
 * Router calls this and passes result to one TableSceneShell.
 */
import { useMemo } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { TablePageController } from "@/types/tableSceneContract";
import { buildTableActionNotice } from "@/features/table/components/table/hooks/useTableDisplayEvents";
import { useTableMoneyDisplay } from "@/features/table/context/TableMoneyDisplayContext";
import { formatCents } from "@/lib/format";
import {
  buildTableSceneModel,
  deriveTableViewState,
  type TableSceneShellProps,
  getLoadingSlots,
  getPlaceholderSlots,
  useIdleTableSlots,
  useActiveTableSlots,
} from "@/features/table";
import { useLiveTableStatusStripState } from "./useLiveTableStatusStripState";
import { deriveTableDisplayState } from "./tableDisplayState";

const EMPTY_DISPLAY_STATE = {
  phase: "betweenHands",
  handId: null,
  completedHandId: null,
  heroUserId: null,
  notice: null,
  winnerMessage: null,
  heroPrompt: null,
  passiveMessage: "Waiting for next hand",
  showTurnCue: false,
  boardReset: false,
  connectionLabel: null,
} as const;

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
  const { formatBet, isTournamentTable } = useTableMoneyDisplay();
  const formatChipAmount = isTournamentTable ? formatBet : formatCents;
  const deriveOptions = useMemo(
    () => ({ formatChipAmount }),
    [formatChipAmount],
  );

  const liveViewState = useMemo(
    () =>
      snapshot
        ? deriveTableViewState(snapshot, scene.connectionStatus, deriveOptions)
        : undefined,
    [deriveOptions, scene.connectionStatus, snapshot],
  );
  const liveSceneModel = useMemo(
    () =>
      snapshot
        ? buildTableSceneModel(snapshot, scene.connectionStatus)
        : undefined,
    [scene.connectionStatus, snapshot],
  );
  const actionNotice = useMemo(
    () => buildTableActionNotice(snapshot, formatBet),
    [formatBet, snapshot],
  );
  const tableDisplayState = useMemo(
    () =>
      liveViewState
        ? deriveTableDisplayState({
            viewState: liveViewState,
            actionNotice,
            handResultNotice: renderModel.displayEvents.winnerBanner,
            formatChipAmount,
          })
        : null,
    [
      actionNotice,
      formatChipAmount,
      liveViewState,
      renderModel.displayEvents.winnerBanner,
    ],
  );
  const liveStatusStripState = useLiveTableStatusStripState({
    tableId: renderModel.tableId,
    displayState: tableDisplayState ?? EMPTY_DISPLAY_STATE,
    tournamentStatus: snapshot?.table?.tournament?.status ?? null,
    tournamentViewer: snapshot?.hero?.tournamentViewer ?? null,
  });
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

  const idleSlots = useIdleTableSlots(
    snapshot,
    scene,
    renderModel,
    actions,
    emptyOpponentsState,
    {
      sceneModel: liveSceneModel,
      statusStrip: liveStatusStripState,
    },
  );
  const activeSlots = useActiveTableSlots(
    snapshot,
    scene,
    renderModel,
    actions,
    emptyOpponentsState,
    heroAvatarUrl,
    {
      sceneModel: liveSceneModel,
      statusStrip: liveStatusStripState,
    },
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
