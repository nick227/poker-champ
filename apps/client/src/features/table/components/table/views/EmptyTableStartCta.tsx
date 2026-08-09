import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { TableStatusStrip } from "../action-bar/TableStatusStrip";

export type EmptyTableStartCtaProps = {
  message: string;
  onAddBot: () => void;
};

/** Action-bar CTA when the hero is alone — no cherry image, explicit buttons only. */
export function EmptyTableStartCta({ message, onAddBot }: EmptyTableStartCtaProps) {
  return (
    <View
      className="ui-p-inline-4 gap-y-3 pt-2 items-center w-full"
      style={{ flex: 1, justifyContent: "flex-start" }}
    >
      <TableStatusStrip message={message} showSpinner={false} showTurnCue={false} />
      <View className="ui-row gap-x-2 justify-center">
        <Button title="Add bot" onPress={onAddBot} />
      </View>
    </View>
  );
}
