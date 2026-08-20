import { useState } from "react";
import { Pressable, View } from "react-native";
import { GIFT_CATALOG, type GiftCatalogEntry } from "@poker-champ/realtime-contract";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { formatCents } from "@/lib/format";

type PlayerHistoryPopupTab = "stats" | "gift";

type PlayerHistoryPopupProps = {
  visible: boolean;
  onClose: () => void;
  name: string;
  userId?: string;
  vpip?: number;
  pfr?: number;
  hands?: number;
  joinDate?: string;
  location?: string;
  onSendGift?: (catalogKey: string) => void;
};

export function PlayerHistoryPopup({
  visible,
  onClose,
  name,
  userId,
  vpip = 0,
  pfr = 0,
  hands = 0,
  joinDate,
  location,
  onSendGift,
}: PlayerHistoryPopupProps) {
  const [tab, setTab] = useState<PlayerHistoryPopupTab>("stats");
  const [selectedGiftKey, setSelectedGiftKey] = useState<string | null>(null);
  const canGift = Boolean(userId && onSendGift);

  const handleClose = () => {
    setTab("stats");
    setSelectedGiftKey(null);
    onClose();
  };

  const handleConfirmGift = () => {
    if (!selectedGiftKey || !onSendGift) return;
    onSendGift(selectedGiftKey);
    setSelectedGiftKey(null);
  };

  return (
    <ModalSheet visible={visible} onClose={handleClose} title={name}>
      <View className="ui-stack-4">
        {canGift && (
          <View className="ui-row ui-inline-2">
            <Button
              title="Stats"
              intent="secondary"
              size="sm"
              selected={tab === "stats"}
              onPress={() => setTab("stats")}
            />
            <Button
              title="🎁 Gift"
              intent="secondary"
              size="sm"
              selected={tab === "gift"}
              onPress={() => setTab("gift")}
            />
          </View>
        )}

        {tab === "stats" ? (
          <View className="ui-stack-4">
            <View className="items-center">
              <View className="h-20 w-20 ui-center rounded-full ui-surface">
                <Text variant="h1">{name.slice(0, 1).toUpperCase()}</Text>
              </View>
            </View>
            <View className="ui-row-wrap ui-inline-2">
              <View className="ui-surface px-3 py-2">
                <Text variant="label">Avg VPIP</Text>
                <Text variant="body">{vpip}%</Text>
              </View>
              <View className="ui-surface px-3 py-2">
                <Text variant="label">Avg PFR</Text>
                <Text variant="body">{pfr}%</Text>
              </View>
              <View className="ui-surface px-3 py-2">
                <Text variant="label">Hands</Text>
                <Text variant="body">{hands}</Text>
              </View>
            </View>
            {joinDate ? (
              <View>
                <Text variant="label">Join date</Text>
                <Text variant="body">{joinDate}</Text>
              </View>
            ) : null}
            {location ? (
              <View>
                <Text variant="label">Location</Text>
                <Text variant="body">{location}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View className="ui-stack-4">
            <View className="ui-row-wrap ui-inline-2">
              {GIFT_CATALOG.map((entry: GiftCatalogEntry) => (
                <Pressable
                  key={entry.id}
                  onPress={() => setSelectedGiftKey(entry.id)}
                  className={`ui-surface px-3 py-2 items-center ${selectedGiftKey === entry.id ? "border-accent-purple" : ""}`}
                  style={{ minWidth: 84 }}
                >
                  <Text variant="h2">{entry.emoji}</Text>
                  <Text variant="label" numberOfLines={1}>
                    {entry.label}
                  </Text>
                  <Text variant="muted">{formatCents(entry.costCents)}</Text>
                </Pressable>
              ))}
            </View>
            {selectedGiftKey ? (
              <Button title={`Send ${GIFT_CATALOG.find((g) => g.id === selectedGiftKey)?.label ?? "Gift"}`} intent="primary" onPress={handleConfirmGift} />
            ) : (
              <Text variant="muted">Pick a gift to send.</Text>
            )}
          </View>
        )}
      </View>
    </ModalSheet>
  );
}
