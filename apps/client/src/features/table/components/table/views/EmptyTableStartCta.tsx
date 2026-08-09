import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { TableStatusStrip } from "../action-bar/TableStatusStrip";

export type EmptyTableStartCtaProps = {
  message: string;
  onAddBot: () => void;
};

/** Compact idle CTA — status + Add bot only. */
export function EmptyTableStartCta({ message, onAddBot }: EmptyTableStartCtaProps) {
  return (
    <View className="ui-p-inline-4 gap-y-2 py-1 items-center w-full">
      <TableStatusStrip message={message} showSpinner={false} showTurnCue={false} />
      <View className="ui-row gap-x-2 justify-center">
        <Button title="Add bot" onPress={onAddBot} />
      </View>
    </View>
  );
}
