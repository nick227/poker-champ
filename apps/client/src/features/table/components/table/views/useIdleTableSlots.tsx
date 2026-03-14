/**
 * Returns TableSceneShell slot props for idle (between hands) state.
 * When snapshot is null returns placeholder slots so hook can run unconditionally.
 */
import type { ReactNode } from "react";
import { View } from "react-native";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { TablePageController } from "@/types/tableSceneContract";
import type { TableSceneShellProps } from "../table-layout";
import type { Opponent } from "../opponent-strip";
import { DealerAnnounceBar } from "../DealerAnnounceBar";
import { HeroZone } from "../hero-zone";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { RejoinCTA, type RejoinUiState } from "../RejoinCTA";
import { DUMMY_TABLE_SNAPSHOT } from "../dummyTableSnapshot";
import { useTableViewShellFrame } from "./tableView.shared";
import { useEmptyTableNotification } from "../hooks/useEmptyTableNotification";
import { getPlaceholderSlots } from "./tableSceneSlots";

type IdleSlotsParams = {
  snapshot: TableSnapshotPayload | null;
  scene: TablePageController["scene"];
  renderModel: TablePageController["renderModel"];
  actions: TablePageController["actions"];
  emptyOpponentsState: ReactNode;
};

export function useIdleTableSlots(
  snapshot: TableSnapshotPayload | null,
  scene: TablePageController["scene"],
  renderModel: TablePageController["renderModel"],
  actions: TablePageController["actions"],
  emptyOpponentsState: ReactNode,
): TableSceneShellProps {
  const { model, shellBaseProps, board } = useTableViewShellFrame({
    snapshot: snapshot ?? null,
    handResultMessage: renderModel.handResultMessage ?? null,
    connectionStatus: undefined,
    balanceCents: renderModel.balanceCents,
    topBarRight: renderModel.tableTopBarRight,
    opponents: renderModel.opponents as Opponent[],
    opponentStripEmptyState: emptyOpponentsState,
    onPlayerPress: actions.onPlayerPress,
  });

  const notification = useEmptyTableNotification(
    snapshot ?? DUMMY_TABLE_SNAPSHOT,
    (renderModel.opponents ?? []) as Opponent[],
    actions.openAddBotPicker,
    undefined,
    undefined,
    false,
  );

  if (!snapshot) {
    return getPlaceholderSlots(renderModel.balanceCents, renderModel.tableTopBarRight) as TableSceneShellProps;
  }

  const { heroStatus, heroStackCents, heroCards } = model;
  const heroIsSeated = snapshot.hero.youAreSeated;
  const hasActiveHand = Boolean(snapshot.hand);
  const isSpectator = !heroIsSeated && !hasActiveHand;
  const heroIsSittingOut = heroIsSeated && heroStatus === "SITTING_OUT" && !!actions.rejoinHero;
  const rejoinState = (renderModel.rejoinUiState ?? "idle") as RejoinUiState;
  const rejoinErrorMessage = renderModel.rejoinErrorMessage ?? null;

  let bottom: ReactNode;
  if (heroIsSittingOut) {
    bottom = (
      <RejoinCTA
        state={rejoinState}
        errorMessage={rejoinErrorMessage}
        onPressRejoin={actions.rejoinHero}
        onBackToLobby={actions.closeTableAndReturn}
        isFatalTableGone={Boolean(rejoinErrorMessage && /table no longer exists|table_gone/i.test(rejoinErrorMessage))}
      />
    );
  } else if (renderModel.canRebuy && actions.openRebuySheet) {
    bottom = <Button title="Rebuy" onPress={actions.openRebuySheet} />;
  } else if (isSpectator) {
    bottom = (
      <View className="ui-p-inline-4 gap-y-2">
        <Text className="text-center">You are not seated at this table.</Text>
        <View className="ui-row gap-x-2 justify-center">
          {actions.joinTableFromFallback ? (
            <Button title="Join table" onPress={actions.joinTableFromFallback} />
          ) : null}
          <Button title="Back to lobby" onPress={actions.closeTableAndReturn} />
        </View>
      </View>
    );
  } else {
    bottom = (
      <View className="ui-p-inline-4 gap-y-2 bg-panel/90 rounded-lg p-4">
        <Text className="text-center poker-notification">{notification.message}</Text>
        {notification.actions && notification.actions.length > 0 && (
          <View className="ui-row gap-x-2 justify-center">
            {notification.actions.map((action, index) => (
              <Button
                key={index}
                title={action.title}
                onPress={action.onPress}
                variant={action.variant}
              />
            ))}
          </View>
        )}
      </View>
    );
  }

  const heroUserName = snapshot.seats.find((s) => s.seat === snapshot.hero.seat)?.name;

  return {
    ...shellBaseProps,
    dealerBar: (
      <DealerAnnounceBar
        hand={undefined}
        handResultMessage={renderModel.handResultMessage ?? undefined}
        tableStatus={scene.tableStatus}
        nextHandAtTs={snapshot.nextHandAtTs}
      />
    ),
    board,
    hero: (
      <HeroZone
        cards={heroCards}
        stackCents={heroStackCents}
        canAct={false}
        heroStatus={heroStatus}
        showStats={snapshot.table?.showStats ?? false}
        userName={heroUserName}
      />
    ),
    bottom,
    rootClassName: "overflow-hidden",
    immersiveBoard: false,
  };
}
