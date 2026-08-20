import { Pressable, View } from "react-native";
import { SIDE_BET_CATALOG_BY_KEY } from "@poker-champ/realtime-contract";
import type { SideBetEntry } from "@/features/table/stores/table.store";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";

type ActiveSideBetsStripProps = {
  sideBets: Record<string, SideBetEntry>;
  heroUserId?: string;
  onCancel: (interactionId: string) => void;
};

/**
 * Always-visible strip of the hero's own PENDING/ACTIVE side bets at this table
 * (docs/GIFTS_AND_SIDE_BETS_DESIGN.md §11 item 12) — not buried in a popup. PENDING/ACTIVE
 * bets are only ever pushed to the two participants (§4), so this is naturally scoped to
 * "my bets," not a table-wide spectator board.
 */
export function ActiveSideBetsStrip({ sideBets, heroUserId, onCancel }: ActiveSideBetsStripProps) {
  if (!heroUserId) return null;
  const mine = Object.values(sideBets).filter(
    (b) =>
      (b.status === "ACTIVE" || b.status === "PENDING") &&
      (b.initiatorUserId === heroUserId || b.recipientUserId === heroUserId),
  );
  if (mine.length === 0) return null;

  return (
    <View className="absolute top-2 left-2 right-2 z-10 ui-row-wrap ui-inline-2 px-2 py-1">
      {mine.map((bet) => {
        const entry = SIDE_BET_CATALOG_BY_KEY.get(bet.catalogKey);
        const canCancel = bet.status === "PENDING" && bet.initiatorUserId === heroUserId;
        return (
          <View key={bet.interactionId} className="ui-surface px-2 py-1 flex-row items-center ui-inline-2">
            <Text variant="label">
              🎲 {entry?.label ?? bet.catalogKey} — {formatCents(bet.stakeCents)} ({bet.status === "PENDING" ? "pending" : "active"})
            </Text>
            {canCancel ? (
              <Pressable onPress={() => onCancel(bet.interactionId)} accessibilityLabel="Cancel side bet offer">
                <Text variant="muted">✕</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
