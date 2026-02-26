import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { TABLE } from "@/constants/copy";

export function GameListHeader({
  onSort,
  onCreateGame,
  sortLabel = TABLE.sort,
}: {
  onSort: () => void;
  onCreateGame: () => void;
  sortLabel?: string;
}) {
  return (
    <View className="ui-row ui-inline-3 ui-p-stack-2 px-4">
      <Button variant="primary" title={TABLE.createGame} onPress={onCreateGame} />
      <Button variant="ghost" title={sortLabel} onPress={onSort} />
    </View>
  );
}
