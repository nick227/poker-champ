import type { ReactNode } from "react";
import { View } from "react-native";
import { TableLayout } from "@/components/domain/table/TableLayout";
import { EmptyTableView } from "@/components/domain/table/EmptyTableView";
import { TableSceneShell } from "@/components/domain/table/TableSceneShell";
import { DealerAnnounceBar } from "@/components/domain/table/DealerAnnounceBar";
import { ConnectingCard } from "@/components/domain/table/ConnectingCard";
import { Button } from "@/components/base/Button";
import type { TableScreenController } from "@/types/tableSceneContract";
import {
  DEFAULT_MAX_SEATS,
  TABLE_SHELL_TITLE_CLASSNAME,
  TABLE_SHELL_TOP_BAR_CLASSNAME,
} from "@/components/domain/table/constants/tableLayout.constants";

/** Single source for all non-game status text. DealerAnnounceBar is the only place that shows these. */
function statusMessageFor(
  mode: TableScreenController["scene"]["mode"],
  scene: TableScreenController["scene"],
): string {
  if (mode === "auth_loading") return "Restoring session…";
  if (mode === "auth_required") return "Session required. Redirecting to login…";
  const { hasValidBuyIn, tableError, tableStatus } = scene;
  if (!hasValidBuyIn) return "Missing buy-in data.";
  if (tableError) return tableError;
  if (tableStatus === "DISCONNECTED") return "Connecting…";
  if (tableStatus === "RECONNECTING") return "Reconnecting to table…";
  return `Connecting to table (${tableStatus})…`;
}

type TableScreenSceneProps = {
  scene: TableScreenController["scene"];
  renderModel: TableScreenController["renderModel"];
  actions: TableScreenController["actions"];
};

function statusBottom(
  mode: TableScreenController["scene"]["mode"],
  actions: TableScreenController["actions"],
): ReactNode {
  const isLogin = mode === "auth_required";
  return (
    <View className="ui-p-inline-4">
      <Button
        title={isLogin ? "Go to login" : "Return to lobby"}
        onPress={isLogin ? actions.goToLogin : actions.goToLobby}
      />
    </View>
  );
}

/** One shell for all "no table yet" states: auth and connecting. Only message and bottom CTA differ. */
function StatusShell({
  mode,
  scene,
  renderModel,
  actions,
}: TableScreenSceneProps & { mode: TableScreenController["scene"]["mode"] }) {
  const message = statusMessageFor(mode, scene);
  return (
    <TableSceneShell
      tableName="Connecting…"
      playerCount={0}
      maxSeats={DEFAULT_MAX_SEATS}
      balanceCents={renderModel.balanceCents}
      topBarRight={renderModel.tableTopBarRight}
      opponents={[]}
      dealerBar={<DealerAnnounceBar statusMessage={message} />}
      board={
        <ConnectingCard
          message={message}
          action={
            <Button variant="link" title="Return to lobby" onPress={actions.goToLobby} />
          }
        />
      }
      hero={<View collapsable={false} />}
      bottom={statusBottom(mode, actions)}
      titleSectionClassName={TABLE_SHELL_TITLE_CLASSNAME}
      topBarSectionClassName={TABLE_SHELL_TOP_BAR_CLASSNAME}
    />
  );
}

export function TableScreenScene({ scene, renderModel, actions }: TableScreenSceneProps) {
  const { snapshot } = renderModel;
  const { mode } = scene;

  switch (mode) {
    case "auth_loading":
    case "auth_required":
    case "connecting":
      return <StatusShell mode={mode} scene={scene} renderModel={renderModel} actions={actions} />;
    case "idle":
      return (
        <EmptyTableView
          snapshot={snapshot!}
          opponents={renderModel.opponents}
          balanceCents={renderModel.balanceCents}
          tableStatus={scene.tableStatus}
          handResultMessage={renderModel.handResultMessage}
          topBarRight={renderModel.tableTopBarRight}
          onPlayerPress={actions.onPlayerPress}
          canRebuy={renderModel.canRebuy}
          onPressRebuy={actions.openRebuySheet}
        />
      );
    case "active":
      return (
        <TableLayout
          snapshot={snapshot!}
          opponents={renderModel.opponents}
          balanceCents={renderModel.balanceCents}
          tableStatus={scene.tableStatus}
          connectionStatus={scene.connectionStatus}
          actionMessage={renderModel.actionMessage}
          handResultMessage={renderModel.handResultMessage}
          topBarRight={renderModel.tableTopBarRight}
          onAction={actions.sendAction}
          onPlayerPress={actions.onPlayerPress}
          canRebuy={renderModel.canRebuy}
          onPressRebuy={actions.openRebuySheet}
        />
      );
    default:
      return null;
  }
}
