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
    <View className="ui-row items-start justify-between flex-wrap gap-3 pb-5">
      <View className="min-w-0 flex-1">
        <Text variant="h1" className="font-display text-[40px] font-medium leading-tight">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="muted" className="mt-1 text-[14px]">
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
            size="md"
            shape="hud"
            minWidth={0}
            leftIcon={<Ionicons name="grid-outline" size={16} color="#fff" />}
          />
        ) : null}
        {onCreateTournament ? (
          <Button
            title="Create tournament"
            onPress={onCreateTournament}
            intent="accent"
            size="md"
            shape="hud"
            minWidth={0}
            leftIcon={<Ionicons name="trophy-outline" size={16} color="#fff" />}
          />
        ) : null}
      </View>
    </View>
  );
}
