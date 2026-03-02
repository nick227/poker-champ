import { type ReactNode } from "react";
import { View } from "react-native";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { type Opponent } from "../OpponentStrip";
import { DealerAnnounceBar } from "../DealerAnnounceBar";
import { HeroZone } from "../HeroZone";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import type { TableSceneModel } from "../model/useTableSceneModel";
import { TableSceneShell } from "../shell/TableSceneShell";
import type { HandResultMessage } from "../table.types";
import { useTableViewShellFrame } from "./tableView.shared";
import { useEmptyTableNotification } from "../hooks/useEmptyTableNotification";

export type EmptyTableViewProps = {
  snapshot: TableSnapshotPayload;
  opponents: Opponent[];
  balanceCents: number;
  tableStatus?: string;
  handResultMessage?: HandResultMessage;
  sceneModel?: TableSceneModel;
  topBarRight?: ReactNode;
  onPlayerPress?: (opponent: Opponent) => void;
  opponentStripEmptyState?: ReactNode;
  canRebuy?: boolean;
  onPressRebuy?: () => void;
  onBackToLobby: () => void;
  onJoinTable?: () => void;
  onAddBot?: () => void;
  onInvitePlayer?: () => void;
  onResumeGame?: () => void;
  isHost?: boolean;
};

export function EmptyTableView({
  snapshot,
  opponents,
  balanceCents,
  tableStatus,
  handResultMessage,
  sceneModel,
  topBarRight,
  onPlayerPress,
  opponentStripEmptyState,
  canRebuy = false,
  onPressRebuy,
  onBackToLobby,
  onJoinTable,
  onAddBot,
  onInvitePlayer,
  onResumeGame,
  isHost = false,
}: EmptyTableViewProps) {
  const { model, shellBaseProps, board } = useTableViewShellFrame({
    snapshot,
    sceneModel,
    handResultMessage,
    connectionStatus: undefined,
    balanceCents,
    topBarRight,
    opponents,
    opponentStripEmptyState,
    onPlayerPress,
  });
  const {
    heroStatus,
    heroStackCents,
    heroCards,
  } = model;

  const heroIsSeated = snapshot.hero.youAreSeated;
  const hasActiveHand = Boolean(snapshot.hand);
  const isSpectator = !heroIsSeated && !hasActiveHand;

  const notification = useEmptyTableNotification(
    snapshot,
    opponents,
    onAddBot,
    onInvitePlayer,
    onResumeGame,
    isHost,
  );

  let bottom: ReactNode;
  if (canRebuy && onPressRebuy) {
    bottom = <Button title="Rebuy" onPress={onPressRebuy} />;
  } else if (isSpectator) {
    bottom = (
      <View className="ui-p-inline-4 gap-y-2">
        <Text className="text-center">You are not seated at this table.</Text>
        <View className="ui-row gap-x-2 justify-center">
          {onJoinTable ? (
            <Button title="Join table" onPress={onJoinTable} />
          ) : null}
          <Button title="Back to lobby" onPress={onBackToLobby} />
        </View>
      </View>
    );
  } else {
    bottom = (
      <View className="ui-p-inline-4 gap-y-2">
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

  if (__DEV__ && !bottom) {
    // This should never happen: EmptyTableView must always render a bottom CTA/state.
    console.error("No bottom CTA rendered in EmptyTableView — illegal UI state", {
      hasHand: Boolean(snapshot.hand),
      heroIsSeated,
      canRebuy,
      isSpectator,
    });
  }

  return (
    <TableSceneShell
      {...shellBaseProps}
      dealerBar={
        <DealerAnnounceBar
          hand={undefined}
          handResultMessage={handResultMessage}
          tableStatus={tableStatus}
          nextHandAtTs={snapshot.nextHandAtTs}
        />
      }
      board={board}
      hero={
        <HeroZone
          cards={heroCards}
          stackCents={heroStackCents}
          canAct={false}
          heroStatus={heroStatus}
          userName={snapshot.seats.find((s: any) => s.seat === snapshot.hero.seat)?.name}
        />
      }
      bottom={bottom}
      rootClassName="overflow-hidden"
    />
  );
}
