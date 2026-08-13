import { View } from "react-native";
import { occupancyDotCount, occupancyFilledCount } from "../../cashLobbyRow";

type Props = {
  players: number;
  seats: number;
};

export function SeatOccupancy({ players, seats }: Props) {
  const dots = occupancyDotCount(seats);
  const filled = occupancyFilledCount(players, seats);
  if (dots <= 0) return null;
  return (
    <View className="ui-row items-center gap-[3px]">
      {Array.from({ length: dots }, (_, i) => (
        <View
          key={i}
          className={`h-2 w-2 rounded-full ${i < filled ? "bg-brand" : "bg-muted/25"}`}
        />
      ))}
    </View>
  );
}
