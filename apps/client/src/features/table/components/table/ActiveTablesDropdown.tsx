import { Modal, Pressable, ScrollView, View } from "react-native";
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";
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
      <View className="flex-1" style={{ backgroundColor: BACKDROP_OVERLAY }}>
        {/* Backdrop only — do not wrap the sheet in Pressable (nested buttons on web). */}
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <View className="m-4 mt-20 ui-surface-card ui-p-2">
          <View className="ui-row justify-between ui-border-b pb-2">
            <Text variant="h2">{MODAL.activeTables}</Text>
            <IconButton
              icon={<Icon name="close" size={16} />}
              onPress={onClose}
              intent="neutral"
              size="sm"
            />
          </View>
          <ScrollView className="max-h-[60vh]">
            {tables.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => {
                  onSelectTable(t.id);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityState={{ disabled: false }}
                className={`btn btn-neutral btn-row ui-border-b rounded-none ${t.isYourTurn ? "border-brand" : ""}`}
              >
                <View>
                  <Text variant="body">{t.id.slice(0, 8)}</Text>
                  <Text variant="muted">
                    Pot {formatCents(t.potCents ?? 0)}
                    {t.betCents != null ? ` | Bet ${formatCents(t.betCents)}` : ""}
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
        </View>
      </View>
    </Modal>
  );
}
