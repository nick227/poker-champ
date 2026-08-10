import { View } from "react-native";
import { Button } from "@/components/base/Button";

export type EmptyTableStartCtaProps = {
  /** Shown on the felt announce; kept for API compat. */
  message: string;
  onAddBot: () => void;
};

/** Idle CTA — Add bot only; status copy lives on the felt announce. */
export function EmptyTableStartCta({ onAddBot }: EmptyTableStartCtaProps) {
  return (
    <View className="ui-p-inline-4 py-1 items-center w-full">
      <Button title="Add bot" onPress={onAddBot} />
    </View>
  );
}
