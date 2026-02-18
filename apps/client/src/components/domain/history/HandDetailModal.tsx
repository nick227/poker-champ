import { Modal, View, Pressable, ScrollView } from "react-native";
import { Text } from "@/components/base/Text";

interface HandHistoryDetail {
  id: string;
  boardCards: string[];
  bigBlindCents: number;
  reason: string | null;
  players: Array<{
    userId: string;
    displayName: string;
    seat: number;
    holeCards?: string[];
    finalStack: number;
  }>;
  actions: Array<{
    street: string;
    actorUserId: string;
    actorDisplayName: string;
    action: string;
    amountCents: number;
  }>;
  payouts: Array<{
    userId: string;
    displayName: string;
    amountCents: number;
  }>;
}

interface HandDetailModalProps {
  visible: boolean;
  hand: HandHistoryDetail | null;
  onClose: () => void;
  currentUserId: string;
}

export function HandDetailModal({ visible, hand, onClose, currentUserId }: HandDetailModalProps) {
  if (!hand) return null;

  const formatCents = (cents: number) => {
    return (cents / 100).toFixed(2);
  };

  const formatCard = (card: string) => {
    // Convert "Ah" to "A♥", "Kd" to "K♦", etc.
    const suitMap: Record<string, string> = {
      'h': '♥',
      'd': '♦',
      'c': '♣',
      's': '♠'
    };
    const rank = card.slice(0, -1);  // Everything except last character
    const suit = card.slice(-1);      // Last character
    return `${rank}${suitMap[suit] || suit}`;
  };

  const renderCard = (card: string) => (
    <View className="ui-surface w-8 h-12 rounded items-center justify-center mr-1">
      <Text variant="body" className="text-xs">{formatCard(card)}</Text>
    </View>
  );

  const renderHoleCards = (holeCards?: string[]) => {
    if (!holeCards || holeCards.length === 0) {
      return <Text variant="muted" className="text-xs">No cards</Text>;
    }
    return <View className="ui-row">{holeCards.map(card => renderCard(card))}</View>;
  };

  const groupActionsByStreet = () => {
    const grouped: Record<string, typeof hand.actions> = {};
    hand.actions.forEach(action => {
      if (!grouped[action.street]) {
        grouped[action.street] = [];
      }
      grouped[action.street].push(action);
    });
    return grouped;
  };

  const actionGroups = groupActionsByStreet();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-bg">
        {/* Header */}
        <View className="ui-header ui-row items-center justify-between p-4 border-b border-border">
          <Text variant="h1">Hand Details</Text>
          <Pressable onPress={onClose} className="ui-surface p-2 rounded active:opacity-80">
            <Text variant="body">Close</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 p-4">
          {/* Hand Info */}
          <View className="ui-surface p-4 rounded-lg mb-4">
            <Text variant="body" className="font-semibold mb-2">Hand Information</Text>
            <Text variant="muted" className="text-xs">Big Blind: ${formatCents(hand.bigBlindCents)}</Text>
            <Text variant="muted" className="text-xs">Result: {hand.reason || "In Progress"}</Text>
          </View>

          {/* Board */}
          {hand.boardCards.length > 0 && (
            <View className="ui-surface p-4 rounded-lg mb-4">
              <Text variant="body" className="font-semibold mb-2">Board</Text>
              <View className="ui-row">
                {hand.boardCards.map(card => renderCard(card))}
              </View>
            </View>
          )}

          {/* Players */}
          <View className="ui-surface p-4 rounded-lg mb-4">
            <Text variant="body" className="font-semibold mb-2">Players</Text>
            {hand.players
              .sort((a, b) => a.seat - b.seat)
              .map(player => (
                <View key={player.userId} className="ui-row items-center justify-between py-2 border-b border-border">
                  <View className="flex-1">
                    <Text variant="body" className="font-semibold">
                      {player.displayName} {player.userId === currentUserId && "(You)"}
                    </Text>
                    <Text variant="muted" className="text-xs">Seat {player.seat}</Text>
                    <Text variant="muted" className="text-xs">
                      Final Stack: ${formatCents(player.finalStack)}
                    </Text>
                  </View>
                  <View>
                    {renderHoleCards(player.holeCards)}
                  </View>
                </View>
              ))}
          </View>

          {/* Actions by Street */}
          <View className="ui-surface p-4 rounded-lg mb-4">
            <Text variant="body" className="font-semibold mb-2">Action Sequence</Text>
            {Object.entries(actionGroups).map(([street, actions]) => (
              <View key={street} className="mb-3">
                <Text variant="body" className="font-semibold text-sm mb-1">
                  {street.charAt(0) + street.slice(1).toLowerCase()}
                </Text>
                {actions.map((action, index) => (
                  <View key={index} className="ui-row items-center py-1">
                    <Text variant="muted" className="text-xs w-20">
                      {action.actorDisplayName}
                    </Text>
                    <Text variant="body" className="text-sm flex-1">
                      {action.action}
                      {action.amountCents > 0 && ` $${formatCents(action.amountCents)}`}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>

          {/* Payouts */}
          {hand.payouts.length > 0 && (
            <View className="ui-surface p-4 rounded-lg">
              <Text variant="body" className="font-semibold mb-2">Payouts</Text>
              {hand.payouts.map(payout => (
                <View key={payout.userId} className="ui-row items-center justify-between py-1">
                  <Text variant="body" className="text-sm">
                    {payout.displayName} {payout.userId === currentUserId && "(You)"}
                  </Text>
                  <Text variant="body" className="text-sm font-semibold text-green-500">
                    +${formatCents(payout.amountCents)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
