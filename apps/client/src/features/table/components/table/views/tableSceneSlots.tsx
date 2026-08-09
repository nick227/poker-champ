/**
 * Phase 1: Single shell slot content. Loading slots use immersive board;
 * live table uses TableStage (no hero band).
 */
import type { ReactNode } from "react";
import { View } from "react-native";
import type { TablePageController } from "@/types/tableSceneContract";
import { TableLoadingLanding, type TableLoadingMode } from "../loading/TableLoadingLanding";
import { TableLoadRecoveryPanel } from "../loading/TableLoadRecoveryPanel";
import { ACTION_BAR_HEIGHT } from "../constants/table-layout.constants";
import type { TableSceneShellProps } from "../table-layout";

function statusMessageFor(
  mode: TablePageController["scene"]["mode"],
  scene: TablePageController["scene"],
): string {
  if (mode === "auth_loading") return "Restoring your session...";
  if (mode === "auth_required") return "Sign in to continue.";
  if (scene.showLoadRecovery) return scene.loadStatusMessage;
  const { tableError } = scene;
  if (tableError) return tableError;
  return scene.loadStatusMessage || "Connecting to table...";
}

export type LoadingSlotsParams = {
  mode: TablePageController["scene"]["mode"];
  scene: TablePageController["scene"];
  renderModel: TablePageController["renderModel"];
  actions: TablePageController["actions"];
  onLoadingSlotSpinStart?: (spinDurationMs: number) => void;
  reducedMotion?: boolean;
};

const bottomPlaceholder = (
  <View collapsable={false} style={{ height: ACTION_BAR_HEIGHT }} />
);

/** Placeholder shell props when snapshot is not yet available (hook must still run). */
export function getPlaceholderSlots(
  balanceCents: number,
  topBarRight?: ReactNode,
): Pick<
  TableSceneShellProps,
  | "tableName"
  | "balanceCents"
  | "topBarRight"
  | "opponents"
  | "dealerBar"
  | "board"
  | "hero"
  | "heroPlate"
  | "bottom"
  | "immersiveBoard"
  | "maxSeats"
> {
  return {
    tableName: "Poker Champ",
    balanceCents,
    topBarRight,
    opponents: [],
    dealerBar: <View collapsable={false} />,
    board: <View collapsable={false} style={{ minHeight: 160 }} />,
    hero: null,
    heroPlate: null,
    bottom: bottomPlaceholder,
    immersiveBoard: false,
    maxSeats: 6,
  };
}

/**
 * Returns slot content for the loading state.
 */
export function getLoadingSlots({
  mode,
  scene,
  renderModel,
  actions,
  onLoadingSlotSpinStart,
  reducedMotion = false,
}: LoadingSlotsParams): Pick<
  TableSceneShellProps,
  | "tableName"
  | "balanceCents"
  | "topBarRight"
  | "opponents"
  | "dealerBar"
  | "board"
  | "hero"
  | "heroPlate"
  | "bottom"
  | "immersiveBoard"
  | "maxSeats"
> {
  const loadingMode: TableLoadingMode =
    mode === "auth_required" ? "auth_required" : mode === "auth_loading" ? "auth_loading" : "connecting";
  const message = statusMessageFor(mode, scene);
  const showRecovery = scene.showLoadRecovery && mode === "connecting";

  return {
    tableName: "Poker Champ",
    balanceCents: renderModel.balanceCents,
    topBarRight: renderModel.tableTopBarRight,
    opponents: [],
    dealerBar: <View collapsable={false} />,
    board: showRecovery ? (
      <TableLoadRecoveryPanel
        statusMessage={message}
        phase={scene.loadPhase}
        lastError={scene.tableError}
        recoveryBusy={scene.loadRecoveryBusy}
        canRecoverTable={scene.canRecoverTable}
        onRetry={actions.retryTableLoad}
        onRecover={actions.recoverTableLoad}
        onBackToLobby={actions.goToLobby}
        devDiagnostics={scene.loadDevDiagnostics}
      />
    ) : (
      <TableLoadingLanding
        mode={loadingMode}
        statusMessage={message}
        tableId={renderModel.tableId}
        onReturnToLobby={actions.goToLobby}
        onGoToLogin={actions.goToLogin}
        reducedMotion={reducedMotion}
        onSlotSpinStart={onLoadingSlotSpinStart}
      />
    ),
    hero: null,
    heroPlate: null,
    bottom: bottomPlaceholder,
    immersiveBoard: true,
    maxSeats: 6,
  };
}
