import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import { AvatarImage } from "@/components/base/AvatarImage";
import { formatCents, formatCentsCompact } from "@/lib/format";

type ProfilePillProps = {
  username: string;
  amountCents: number;
  avatarUrl?: string | null;
  onPress?: () => void;
  avatarSize?: number;
  /** Width-constrained chrome (mobile table header): shorter balance, tighter padding. */
  compact?: boolean;
};

/**
 * Shared avatar + username + bankroll pill used in both mobile and desktop nav bars.
 * Purely presentational — all navigation logic stays in the parent.
 */
export function ProfilePill({
  username,
  amountCents,
  avatarUrl,
  onPress,
  avatarSize = 40,
  compact = false,
}: ProfilePillProps) {
  const initial = (username || "P").slice(0, 1).toUpperCase();

  return (
    <Pressable
      onPress={onPress}
      className={`ui-row items-center rounded-2 border border-border bg-panel ${compact ? "gap-1 px-1 py-0.5" : "gap-2 px-2 py-1"}`}
    >
      {/* No AvatarImage onPress — outer Pressable is the only button (web forbids nested <button>). */}
      <AvatarImage
        avatarUrl={avatarUrl}
        initial={initial}
        style={{
          width: avatarSize,
          height: avatarSize,
          borderRadius: avatarSize / 2,
          overflow: "hidden",
          backgroundColor: "var(--c-panel-elevated, #333)",
          borderWidth: 1,
          borderColor: "var(--c-border-subtle, #555)",
          justifyContent: "center",
          alignItems: "center",
        }}
        imageStyle={{
          width: avatarSize,
          height: avatarSize,
          borderRadius: avatarSize / 2,
        }}
      />
      <View>
        <Text
          numberOfLines={1}
          variant="body"
          className={`font-semibold tabular-nums ${compact ? "text-[13px]" : "text-[14px]"}`}
        >
          {compact ? formatCentsCompact(amountCents) : formatCents(amountCents)}
        </Text>
      </View>
    </Pressable>
  );
}
