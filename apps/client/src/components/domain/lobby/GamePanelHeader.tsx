import { StyleSheet, View } from "react-native";
import { Text } from "@/components/base/Text";
import { AvatarImage } from "@/components/base/AvatarImage";
import { ConfirmButton } from "@/components/base/ConfirmButton";
import { GAME_PANEL_LAYOUT } from "./gamePanel.layout";

const AVATAR_SIZE = 40;

function getInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed[0]!.toUpperCase() : "P";
}

function formatUpdatedAt(updatedAt: string): string {
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return "Updated recently";
  const deltaSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (deltaSec < 60) return `Updated ${deltaSec}s ago`;
  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) return `Updated ${deltaMin}m ago`;
  const deltaHours = Math.floor(deltaMin / 60);
  if (deltaHours < 24) return `Updated ${deltaHours}h ago`;
  return "Updated recently";
}

export function GamePanelHeader({
  creatorName,
  creatorAvatarUrl,
  updatedAt,
  canJoin,
  onJoin,
  isJoining,
}: {
  creatorName: string;
  creatorAvatarUrl: string | null;
  updatedAt: string;
  canJoin?: boolean;
  onJoin?: () => void;
  isJoining?: boolean;
}) {
  return (
    <View className="ui-row items-center justify-between" style={{ minHeight: GAME_PANEL_LAYOUT.headerMinHeight }}>
      <View className="ui-row items-center gap-2 flex-1">
        <AvatarImage
          avatarUrl={creatorAvatarUrl ?? undefined}
          initial={getInitial(creatorName)}
          style={styles.avatar}
          imageStyle={styles.avatarImage}
          className="rounded-full bg-panel border border-border"
        />
        <View className="flex-1 min-w-[120px] min-h-[34px] justify-center">
          <Text variant="body" className="font-semibold text-[15px]" numberOfLines={1}>{creatorName}</Text>
          <Text variant="muted" className="text-[11px]" numberOfLines={1}>{formatUpdatedAt(updatedAt)}</Text>
        </View>
      </View>
      {canJoin !== undefined && onJoin && (
        <View className="ui-row justify-end items-end w-full flex-1">
          <ConfirmButton title={isJoining ? "Joining..." : "Join Table"} onPress={onJoin} disabled={isJoining} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
});
