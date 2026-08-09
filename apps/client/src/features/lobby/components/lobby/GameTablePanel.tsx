import { Animated, Easing, Pressable, View } from "react-native";
import { useRef, useState } from "react";
import {
  formatCashLobbyJoinHint,
  hasCashLobbyActiveHumans,
  resolveCashLobbyJoin,
  type LobbyTableRow,
} from "@/lib/lobbyTables";
import { Text } from "@/components/base/Text";
import { GamePanelFooter } from "./GamePanelFooter";
import { GamePanelHeader } from "./GamePanelHeader";
import { GamePanelPrimaryLine } from "./GamePanelPrimaryLine";
import { GamePanelStats } from "./GamePanelStats";
import { GAME_PANEL_LAYOUT } from "./gamePanel.layout";
import { Surface } from "@/components/containers/Surface";

export function GameTablePanel({
  table,
  balanceCents,
  isJoining,
  onJoin,
  onDelete,
  currentUserId,
}: {
  table: LobbyTableRow;
  balanceCents: number;
  isJoining?: boolean;
  onJoin: () => void;
  onDelete?: (tableId: string) => void;
  currentUserId?: string;
}) {
  const [pressed, setPressed] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const { canJoin, joinBlockReason } = resolveCashLobbyJoin(table, balanceCents);
  const joinHint = formatCashLobbyJoinHint(joinBlockReason);
  const hasActiveHumans = hasCashLobbyActiveHumans(table);
  const canDelete =
    onDelete &&
    currentUserId &&
    table.creatorId === currentUserId &&
    !hasActiveHumans;

  return (
    <Surface
      as={Animated.View}
      styleId="surface.list.panel"
      data-table-id={table.id}
      style={{
        minHeight: GAME_PANEL_LAYOUT.cardMinHeight,
        transform: [{ scale }],
        shadowOpacity: pressed ? 0.06 : 0.12,
        elevation: pressed ? 1 : 2,
      }}
    >
      <Pressable
        onPress={onJoin}
        disabled={isJoining || !canJoin}
        onPressIn={() => {
          setPressed(true);
          Animated.timing(scale, {
            toValue: 0.98,
            duration: 120,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }).start();
        }}
        onPressOut={() => {
          setPressed(false);
          Animated.timing(scale, {
            toValue: 1,
            duration: 120,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }).start();
        }}
      >
        <View className="ui-stack-3" style={{ minHeight: GAME_PANEL_LAYOUT.contentMinHeight }}>
          <GamePanelPrimaryLine
            gameName={table.name}
            smallBlindCents={table.smallBlindCents}
            bigBlindCents={table.bigBlindCents}
            minBuyInCents={table.minBuyInCents}
            players={table.players}
            seats={table.seats}
          />
          {!hasActiveHumans ? (
            <Text variant="muted" className="text-[12px]">
              Waiting for players
            </Text>
          ) : null}
          <GamePanelHeader
            creatorName={table.creatorName}
            creatorAvatarUrl={table.creatorAvatarUrl}
            updatedAt={table.updatedAt}
            canJoin={canJoin}
            onJoin={onJoin}
            isJoining={isJoining}
          />
          <GamePanelStats
            players={table.players}
            seats={table.seats}
            minBuyInCents={table.minBuyInCents}
            maxBuyInCents={table.maxBuyInCents}
            avgPotCents={table.avgPotCents}
            waitlistCount={table.waitlistCount}
          />
          <View>
            <GamePanelFooter
              joinHint={joinHint}
              canDelete={Boolean(canDelete)}
              onDelete={() => onDelete?.(table.id)}
            />
          </View>
        </View>
      </Pressable>
    </Surface>
  );
}
