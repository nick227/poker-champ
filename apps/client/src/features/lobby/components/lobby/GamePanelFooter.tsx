import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { IconButton } from "@/components/base/IconButton";

export function GamePanelFooter({
  joinHint,
  canDelete,
  onDelete,
}: {
  joinHint?: string | null;
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <View className="ui-row items-center justify-between gap-3 min-h-[44px]">
      <View className="flex-1 min-h-[16px] justify-center">
        <Text
          variant="muted"
          className="text-[11px]"
          numberOfLines={1}
          style={{ opacity: joinHint ? 1 : 0 }}
        >
          {joinHint ?? ""}
        </Text>
      </View>
          {canDelete ? (
            <IconButton
              icon={<Text variant="body" className="text-sm">🗑️</Text>}
              onPress={onDelete}
              intent="danger"
              size="sm"
            />
          ) : null}
    </View>
  );
}
