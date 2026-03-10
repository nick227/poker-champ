import { View } from "react-native";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { Text } from "@/components/base/Text";

type PlayerHistoryPopupProps = {
  visible: boolean;
  onClose: () => void;
  name: string;
  vpip?: number;
  pfr?: number;
  hands?: number;
  joinDate?: string;
  location?: string;
};

export function PlayerHistoryPopup({
  visible,
  onClose,
  name,
  vpip = 0,
  pfr = 0,
  hands = 0,
  joinDate,
  location,
}: PlayerHistoryPopupProps) {
  return (
    <ModalSheet visible={visible} onClose={onClose} title={name}>
      <View className="ui-stack-4">
        <View className="items-center">
          <View className="h-20 w-20 ui-center rounded-full ui-surface">
            <Text variant="h1">{name.slice(0, 1).toUpperCase()}</Text>
          </View>
        </View>
        <View className="ui-row-wrap ui-inline-2">
          <View className="ui-surface px-3 py-2">
            <Text variant="label">Avg VPIP</Text>
            <Text variant="body">{vpip}%</Text>
          </View>
          <View className="ui-surface px-3 py-2">
            <Text variant="label">Avg PFR</Text>
            <Text variant="body">{pfr}%</Text>
          </View>
          <View className="ui-surface px-3 py-2">
            <Text variant="label">Hands</Text>
            <Text variant="body">{hands}</Text>
          </View>
        </View>
        {joinDate ? (
          <View>
            <Text variant="label">Join date</Text>
            <Text variant="body">{joinDate}</Text>
          </View>
        ) : null}
        {location ? (
          <View>
            <Text variant="label">Location</Text>
            <Text variant="body">{location}</Text>
          </View>
        ) : null}
      </View>
    </ModalSheet>
  );
}
