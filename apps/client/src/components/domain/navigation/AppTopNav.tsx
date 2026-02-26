import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { formatCents } from "@/lib/format";

export type AppTopNavProps = {
  username: string;
  amountCents: number;
  onlineLabel: string;
  onPressOnline?: () => void;
};

export function AppTopNav({
  username,
  amountCents,
  onlineLabel,
  onPressOnline,
}: AppTopNavProps) {
  const router = useRouter();
  const initial = (username || "P").slice(0, 1).toUpperCase();

  return (
    <View className="ui-section mb-2 ui-row items-center justify-between ui-inline-3">
      <View className="ui-row items-center ui-inline-3 flex-1">
        <Pressable
          onPress={() => router.push("/settings")}
          className="h-10 w-10 rounded-full ui-surface ui-center border border-border-subtle"
        >
          <Text numberOfLines={1} variant="body">
            {initial}
          </Text>
        </Pressable>
        <Pressable onPress={() => router.push("/settings")} className="flex-1">
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
    </View>
  );
}
