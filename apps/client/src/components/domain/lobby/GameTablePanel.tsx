import { Animated, Easing, Pressable, View } from "react-native";
import { useRef, useState } from "react";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import { Text } from "@/components/base/Text";
import { ConfirmButton } from "@/components/base/ConfirmButton";
import { GamePanelFooter } from "./GamePanelFooter";
import { GamePanelHeader } from "./GamePanelHeader";
import { GamePanelPrimaryLine } from "./GamePanelPrimaryLine";
import { GamePanelStats } from "./GamePanelStats";
import { GAME_PANEL_LAYOUT } from "./gamePanel.layout";

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
  const canJoin = balanceCents >= table.minBuyInCents;
  const connectedHumanCount = table.connectedHumanCount ?? 0;
  const canDelete =
    onDelete &&
    currentUserId &&
    table.creatorId === currentUserId &&
    connectedHumanCount === 0;

  return (
    <Animated.View
      className="ui-surface-card rounded-2xl border border-border p-4"
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
        disabled={isJoining}
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
            canJoin={canJoin}
            onJoin={onJoin}
            isJoining={isJoining}
          />
          <GamePanelHeader
            creatorName={table.creatorName}
            creatorAvatarUrl={table.creatorAvatarUrl}
            updatedAt={table.updatedAt}
          />
          <GamePanelStats
            players={table.players}
            seats={table.seats}
            minBuyInCents={table.minBuyInCents}
            maxBuyInCents={table.maxBuyInCents}
            avgPotCents={table.avgPotCents}
            waitlistCount={table.waitlistCount}
          />
        </View>
      </Pressable>
      <View className="mt-3 pt-3 border-t border-border/60" style={{ minHeight: GAME_PANEL_LAYOUT.footerMinHeight }}>
        <View className="ui-row items-center justify-between gap-3 min-h-[40px]">
          <View className="flex-1 min-h-[16px] justify-center">
            <Text
              variant="muted"
              className="text-[11px]"
              numberOfLines={1}
              style={{ opacity: canJoin ? 0 : 1 }}
            >
              Insufficient balance for min buy-in
            </Text>
          </View>
          <View className="ui-row items-center gap-2">
            <View className="w-8 h-8">
              {canDelete ? (
                <Pressable
                  onPress={() => onDelete?.(table.id)}
                  className="w-8 h-8 rounded-full border border-border bg-panel items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel="Delete table"
                >
                  <Text variant="body" className="text-sm">...</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}
