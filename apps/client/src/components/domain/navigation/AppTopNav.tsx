import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { AvatarImage } from "@/components/base/AvatarImage";
import { formatCents } from "@/lib/format";
import { Surface } from "@/components/containers/Surface";

const TOP_NAV_AVATAR_SIZE = 40;

export type AppTopNavProps = {
  username: string;
  amountCents: number;
  onlineLabel: string;
  onPressOnline?: () => void;
  avatarUrl?: string | null;
};

export function AppTopNav({
  username,
  amountCents,
  onlineLabel,
  onPressOnline,
  avatarUrl,
}: AppTopNavProps) {
  const router = useRouter();
  const initial = (username || "P").slice(0, 1).toUpperCase();

  return (
    <Surface styleId="surface.nav.top">
      <View className="ui-row items-center ui-inline-3 flex-1">
        <AvatarImage
          avatarUrl={avatarUrl}
          initial={initial}
          onPress={() => router.push("/settings")}
          style={{
            width: TOP_NAV_AVATAR_SIZE,
            height: TOP_NAV_AVATAR_SIZE,
            borderRadius: TOP_NAV_AVATAR_SIZE / 2,
            overflow: "hidden",
            backgroundColor: "var(--c-panel-elevated, #333)",
            borderWidth: 1,
            borderColor: "var(--c-border-subtle, #555)",
            justifyContent: "center",
            alignItems: "center",
          }}
          imageStyle={{
            width: TOP_NAV_AVATAR_SIZE,
            height: TOP_NAV_AVATAR_SIZE,
            borderRadius: TOP_NAV_AVATAR_SIZE / 2,
          }}
        />
        <Pressable onPress={() => router.push("/settings")} className="flex-1 min-h-[44px] justify-center">
          <Text numberOfLines={1} variant="body">
            {username}
          </Text>
          <Text numberOfLines={1} variant="h2" className="font-semibold">
            {formatCents(amountCents)}
          </Text>
        </Pressable>
      </View>

      <Button
        variant="link"
        title={onlineLabel}
        onPress={onPressOnline ?? (() => {})}
        disabled={!onPressOnline}
      />
    </Surface>
  );
}
