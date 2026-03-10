import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { TABLE } from "@/constants/copy";

export function GameListHeader({
  onSort,
  onCreateGame,
  sortLabel = TABLE.sort,
  createLabel = TABLE.createGame,
}: {
  onSort: () => void;
  onCreateGame: () => void;
  sortLabel?: string;
  createLabel?: string;
}) {
  return (
    <View className="ui-row ui-inline-3 ui-p-stack-2 px-4">
      <Button intent="accent" title={createLabel} onPress={onCreateGame} />
      <Button intent="ghost" title={sortLabel} onPress={onSort} />
    </View>
  );
}
