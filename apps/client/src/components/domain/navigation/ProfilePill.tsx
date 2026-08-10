import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import { AvatarImage } from "@/components/base/AvatarImage";
import { formatCents } from "@/lib/format";

type ProfilePillProps = {
  username: string;
  amountCents: number;
  avatarUrl?: string | null;
  onPress?: () => void;
  avatarSize?: number;
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
}: ProfilePillProps) {
  const initial = (username || "P").slice(0, 1).toUpperCase();

  return (
    <Pressable
      onPress={onPress}
      className="ui-row items-center gap-2 rounded-lg border border-border bg-panel px-2 py-1"
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
        <Text numberOfLines={1} variant="body" className="text-[13px]">
          {username}
        </Text>
        <Text numberOfLines={1} variant="h2" className="font-semibold text-[14px]">
          {formatCents(amountCents)}
        </Text>
      </View>
    </Pressable>
  );
}
