import type { ReactNode } from "react";
import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { DealerAnnounceBar } from "../DealerAnnounceBar";
import { ConnectingCard } from "../ConnectingCard";
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
  if (mode === "auth_loading") return "Restoring session...";
  if (mode === "auth_required") return "Session required. Redirecting to login...";
  const { hasValidBuyIn, tableError, tableStatus } = scene;
  if (!hasValidBuyIn) return "Missing buy-in data.";
  if (tableError) return tableError;
  if (tableStatus === "DISCONNECTED") return "Connecting...";
  if (tableStatus === "RECONNECTING") return "Reconnecting to table...";
  return `Connecting to table (${tableStatus})...`;
}

function statusBottom(
  mode: TablePageController["scene"]["mode"],
  actions: TablePageController["actions"],
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

export function StatusTableView({
  mode,
  scene,
  renderModel,
  actions,
}: StatusTableViewProps) {
  const message = statusMessageFor(mode, scene);

  return (
    <TableSceneShell
      tableName="Connecting..."
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
    />
  );
}
