import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";

type Props = {
  title: string;
  subtitle?: string;
  onNewCashTable?: () => void;
  onCreateTournament?: () => void;
};

export function LobbyPageHeader({
  title,
  subtitle,
  onNewCashTable,
  onCreateTournament,
}: Props) {
  return (
    <View className="ui-row items-center justify-between flex-wrap gap-3 pb-4">
      <View className="min-w-0 flex-1">
        <Text variant="h1" className="font-display text-[34px] font-medium leading-none">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="muted" className="mt-1.5 text-[13px]">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View className="ui-row items-center flex-wrap gap-2 shrink-0">
        {onNewCashTable ? (
          <Button
            title="New cash table"
            onPress={onNewCashTable}
            intent="accent"
            size="sm"
            shape="hud"
            minWidth={0}
            leftIcon={<Ionicons name="grid-outline" size={15} color="#fff" />}
          />
        ) : null}
        {onCreateTournament ? (
          <Button
            title="Create tournament"
            onPress={onCreateTournament}
            intent="ghost"
            size="sm"
            shape="hud"
            minWidth={0}
            className="border border-border bg-transparent"
            textClassName="text-text"
            leftIcon={<Ionicons name="trophy-outline" size={15} color="hsl(0 0% 90%)" />}
          />
        ) : null}
      </View>
    </View>
  );
}
