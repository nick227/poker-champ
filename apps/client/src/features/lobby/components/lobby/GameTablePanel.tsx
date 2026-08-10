import { View } from "react-native";

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
      styleId="surface.list.panel"
      data-table-id={table.id}
      style={{
        minHeight: GAME_PANEL_LAYOUT.cardMinHeight,
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
              canJoin={canJoin}
              isJoining={isJoining}
              onJoin={onJoin}
            />
          </View>
        </View>
    </Surface>
  );
}
