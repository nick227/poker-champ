/**
 * Phase 1: Single shell slot content. Loading slots use fixed-height placeholders
 * so layout does not change on reveal. See TABLE_LOADING_AND_TRANSITION_PROPOSAL.md.
 */
import type { ReactNode } from "react";
import { View } from "react-native";
import type { TablePageController } from "@/types/tableSceneContract";
import { TableLoadingLanding, type TableLoadingMode } from "../loading/TableLoadingLanding";
import { TableLoadRecoveryPanel } from "../loading/TableLoadRecoveryPanel";
import {
  ACTION_BAR_HEIGHT,
  HERO_ZONE_HEIGHT,
  OPPONENT_STRIP_HEIGHT,
} from "../constants/table-layout.constants";
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

/** Placeholders use fixed heights from constants so RN does not reflow on reveal. */
const heroPlaceholder = (
  <View collapsable={false} style={{ minHeight: HERO_ZONE_HEIGHT }} />
);
const bottomPlaceholder = (
  <View collapsable={false} style={{ height: ACTION_BAR_HEIGHT }} />
);
const opponentStripPlaceholder = (
  <View collapsable={false} style={{ minHeight: OPPONENT_STRIP_HEIGHT }} />
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
  | "opponentStripEmptyState"
  | "dealerBar"
  | "board"
  | "hero"
  | "bottom"
  | "immersiveBoard"
> {
  return {
    tableName: "Poker Champ",
    balanceCents,
    topBarRight,
    opponents: [],
    opponentStripEmptyState: opponentStripPlaceholder,
    dealerBar: <View collapsable={false} />,
    board: <View collapsable={false} style={{ minHeight: 160 }} />,
    hero: heroPlaceholder,
    bottom: bottomPlaceholder,
    immersiveBoard: false,
  };
}

/**
 * Returns slot content for the loading state. Same layout as table (no immersiveBoard);
 * all regions render so layout size does not change on reveal.
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
  | "opponentStripEmptyState"
  | "dealerBar"
  | "board"
  | "hero"
  | "bottom"
  | "immersiveBoard"
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
    opponentStripEmptyState: opponentStripPlaceholder,
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
    hero: heroPlaceholder,
    bottom: bottomPlaceholder,
    immersiveBoard: true,
  };
}
