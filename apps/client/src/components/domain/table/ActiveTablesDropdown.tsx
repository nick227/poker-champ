import { Modal, Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import { MODAL, TABLE } from "@/constants/copy";
import { BACKDROP_OVERLAY } from "@/theme/colors";

type ActiveTableRow = {
  id: string;
  boardSummary?: string;
  potCents?: number;
  bankCents?: number;
  betCents?: number;
  isYourTurn?: boolean;
};

export function ActiveTablesDropdown({
  visible,
  onClose,
  tables,
  onSelectTable,
}: {
  visible: boolean;
  onClose: () => void;
  tables: ActiveTableRow[];
  onSelectTable: (id: string) => void;
}) {
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable className="flex-1" style={{ backgroundColor: BACKDROP_OVERLAY }} onPress={onClose}>
        <Pressable
          className="m-4 mt-20 ui-surface-card ui-p-2"
          onPress={(e) => e.stopPropagation()}
        >
          <View className="ui-row justify-between ui-border-b pb-2">
            <Text variant="h2">{MODAL.activeTables}</Text>
            <Pressable onPress={onClose} className="ui-touch">
              <Text variant="muted">✕</Text>
            </Pressable>
          </View>
          <ScrollView className="max-h-[60vh]">
            {tables.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => {
                  onSelectTable(t.id);
                  onClose();
                }}
                className={`ui-row justify-between ui-border-b py-3 ${t.isYourTurn ? "border-brand" : ""}`}
              >
                <View>
                  <Text variant="body">{t.id.slice(0, 8)}</Text>
                  <Text variant="muted">
                    Pot {formatCents(t.potCents ?? 0)}
                    {t.betCents != null ? ` • Bet ${formatCents(t.betCents)}` : ""}
                  </Text>
                </View>
                <Text variant="body">{formatCents(t.bankCents ?? 0)}</Text>
                {t.isYourTurn ? (
                  <View className="rounded bg-brand px-2 py-1">
                    <Text variant="muted">{TABLE.yourTurn}</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
