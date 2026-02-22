import { View } from "react-native";
import { TableLayout } from "@/components/domain/table/TableLayout";
import { EmptyTableView } from "@/components/domain/table/EmptyTableView";
import { ConnectingTableShell } from "@/components/domain/table/ConnectingTableShell";
import { TableTopBar } from "@/components/domain/table/TableTopBar";
import { Button } from "@/components/base/Button";
import type { TableScreenController } from "@/types/tableSceneContract";

type TableScreenSceneProps = {
  scene: TableScreenController["scene"];
  renderModel: TableScreenController["renderModel"];
  actions: TableScreenController["actions"];
};

export function TableScreenScene({ scene, renderModel, actions }: TableScreenSceneProps) {
  const snapshot = renderModel.snapshot;

  switch (scene.mode) {
    case "auth_loading":
      return (
        <View className="flex-1 ui-center ui-stack-4">
          <Button title="Restoring session..." onPress={() => {}} />
        </View>
      );
    case "auth_required":
      return (
        <View className="flex-1 ui-center ui-stack-4">
          <Button title="Session required. Redirecting to login..." onPress={actions.goToLogin} />
        </View>
      );
    case "connecting":
      return (
        <View className="flex-1">
          <TableTopBar
            userName={renderModel.profileUsername}
            balanceCents={renderModel.balanceCents}
            right={
              <View className="ui-row ui-inline-1">
                <Button variant="link" title="X" onPress={actions.closeTableAndReturn} />
              </View>
            }
          />
          <ConnectingTableShell
            message={
              !scene.hasValidBuyIn
                ? "Missing buy-in data."
                : scene.tableError
                  ? scene.tableError
                  : scene.tableStatus === "DISCONNECTED"
                    ? "Connecting..."
                    : scene.tableStatus === "RECONNECTING"
                      ? "Reconnecting to table..."
                      : `Connecting to table (${scene.tableStatus})...`
            }
            action={<Button variant="link" title="Return to lobby" onPress={actions.goToLobby} />}
          />
        </View>
      );
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
