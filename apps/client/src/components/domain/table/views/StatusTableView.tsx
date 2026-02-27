import { useEffect, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { TableLoadingLanding, type TableLoadingMode } from "../loading/TableLoadingLanding";
import { TableSceneShell } from "../shell/TableSceneShell";
import type { TablePageController } from "@/types/tableSceneContract";

type StatusTableViewProps = {
  mode: TablePageController["scene"]["mode"];
  scene: TablePageController["scene"];
  renderModel: TablePageController["renderModel"];
  actions: TablePageController["actions"];
};

function statusMessageFor(
  mode: TablePageController["scene"]["mode"],
  scene: TablePageController["scene"],
): string {
  if (mode === "auth_loading") return "Restoring your session...";
  if (mode === "auth_required") return "Sign in to continue.";
  const { tableError } = scene;
  if (tableError) return tableError;
  return "Connecting to table...";
}

export function StatusTableView({
  mode,
  scene,
  renderModel,
  actions,
}: StatusTableViewProps) {
  const loadingMode: TableLoadingMode = mode === "auth_required" ? "auth_required" : mode === "auth_loading" ? "auth_loading" : "connecting";
  const message = statusMessageFor(mode, scene);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof AccessibilityInfo.isReduceMotionEnabled !== "function") return;
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReducedMotion(Boolean(enabled));
      })
      .catch(() => {
        // Keep default animation behavior when reduced-motion capability is unavailable.
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <TableSceneShell
      tableName="Poker Champ"
      balanceCents={renderModel.balanceCents}
      topBarRight={renderModel.tableTopBarRight}
      opponents={[]}
      immersiveBoard
      dealerBar={<View collapsable={false} />}
      board={
        <TableLoadingLanding
          mode={loadingMode}
          statusMessage={message}
          tableId={renderModel.tableId}
          onReturnToLobby={actions.goToLobby}
          onGoToLogin={actions.goToLogin}
          reducedMotion={reducedMotion}
        />
      }
      hero={<View collapsable={false} />}
      bottom={null}
    />
  );
}
