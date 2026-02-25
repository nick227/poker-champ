import type { ReactNode } from "react";
import { View } from "react-native";
import { TableLayout } from "@/components/domain/table/TableLayout";
import { EmptyTableView } from "@/components/domain/table/EmptyTableView";
import { TableSceneShell } from "@/components/domain/table/TableSceneShell";
import { DealerAnnounceBar } from "@/components/domain/table/DealerAnnounceBar";
import { ConnectingCard } from "@/components/domain/table/ConnectingCard";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import type { TableScreenController } from "@/types/tableSceneContract";
import {
  DEFAULT_MAX_SEATS,
  TABLE_SHELL_TITLE_CLASSNAME,
  TABLE_SHELL_TOP_BAR_CLASSNAME,
} from "@/components/domain/table/constants/tableLayout.constants";
import { tablePath } from "@/lib/nav";

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

function resolveShareTableUrl(tableId: string): string {
  const path = tablePath(tableId);
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  const origin = process.env.EXPO_PUBLIC_WEB_ORIGIN?.trim();
  if (origin) return `${origin.replace(/\/+$/, "")}${path}`;
  return path;
}

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
      onCloseTable={actions.closeTableAndReturn}
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
  const showEmptyOpponentsState = renderModel.opponents.length === 0 && mode !== "connecting";
  const shareTableUrl = resolveShareTableUrl(renderModel.tableId);
  const emptyOpponentsState = showEmptyOpponentsState ? (
    <View className="p-4 gap-y-3 mt-2">
      <Text variant="h2" className="text-lg">
        Waiting for opponents
      </Text>
      <View className="ui-row">
        <Button title="Add bot" onPress={actions.openAddBotPicker} />
      </View>
      <View className="rounded-lg border border-border-subtle bg-panel-elevated p-3">
        <Text variant="label" className="text-text-subtle mb-1 normal-case tracking-normal">
          Share this game URL
        </Text>
        <Text numberOfLines={1} ellipsizeMode="tail" selectable className="text-xs">
          {shareTableUrl}
        </Text>
      </View>
    </View>
  ) : null;

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
          onCloseTable={actions.closeTableAndReturn}
          onPlayerPress={actions.onPlayerPress}
          opponentStripEmptyState={emptyOpponentsState}
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
          onCloseTable={actions.closeTableAndReturn}
          onAction={actions.sendAction}
          onPlayerPress={actions.onPlayerPress}
          opponentStripEmptyState={emptyOpponentsState}
          canRebuy={renderModel.canRebuy}
          onPressRebuy={actions.openRebuySheet}
        />
      );
    default:
      return null;
  }
}
