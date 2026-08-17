import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";

type Props = {
  title: string;
  subtitle?: string;
  onNewCashTable?: () => void;
  onCreateTournament?: () => void;
  compact?: boolean;
};

export function LobbyPageHeader({
  title,
  subtitle,
  onNewCashTable,
  onCreateTournament,
  compact = false,
}: Props) {
  const actions =
    onNewCashTable || onCreateTournament ? (
      <View className={`ui-row items-center gap-2 ${compact ? "w-full" : "shrink-0 flex-wrap"}`}>
        {onNewCashTable ? (
          <Button
            title={compact ? "New table" : "New cash table"}
            onPress={onNewCashTable}
            intent="accent"
            size="sm"
            shape="hud"
            minWidth={0}
            className={`bg-brand ${compact ? "flex-1 min-h-[40px]" : ""}`}
            leftIcon={<Ionicons name="grid-outline" size={15} color="#fff" />}
          />
        ) : null}
        {onCreateTournament ? (
          <Button
            title={compact ? "New event" : "Create tournament"}
            onPress={onCreateTournament}
            intent="ghost"
            size="sm"
            shape="hud"
            minWidth={0}
            className={`border border-border bg-transparent ${compact ? "flex-1 min-h-[40px]" : ""}`}
            textClassName="text-text"
            leftIcon={<Ionicons name="trophy-outline" size={15} color="hsl(0 0% 90%)" />}
          />
        ) : null}
      </View>
    ) : null;

  return (
    <View className={`pb-4 ${compact ? "ui-stack-3" : "ui-row items-center justify-between flex-wrap gap-3"}`}>
      <View className="min-w-0 flex-1">
        <Text
          variant="h1"
          className={`font-bold leading-none tracking-[-0.02em] ${compact ? "text-[26px]" : "text-[30px]"}`}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text variant="muted" className={`text-[13px] ${compact ? "mt-1" : "mt-1.5"}`}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions}
    </View>
  );
}
