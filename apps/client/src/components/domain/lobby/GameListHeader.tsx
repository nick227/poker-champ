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
    <View className="ui-section-tight ui-row ui-inline-3 ui-p-stack-2">
      <Button variant="ghost" title={sortLabel} onPress={onSort} />
      <Button variant="primary" title={TABLE.createGame} onPress={onCreateGame} />
    </View>
  );
}
