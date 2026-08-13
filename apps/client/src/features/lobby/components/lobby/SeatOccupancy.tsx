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
    <View className="ui-row items-center gap-0.5">
      {Array.from({ length: dots }, (_, i) => (
        <View
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i < filled ? "bg-brand" : "bg-border"}`}
        />
      ))}
    </View>
  );
}
