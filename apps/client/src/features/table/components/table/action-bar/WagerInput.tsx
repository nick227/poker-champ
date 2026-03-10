import { View } from "react-native";
import { Input } from "@/components/base/Input";
import { actionBarStyles } from "./styles";

type WagerInputProps = {
  visible: boolean;
  display: string;
  placeholder: string;
  editable: boolean;
  onChangeText: (text: string) => void;
  onBlur: () => number;
  onSubmitEditing: () => number;
};

export function WagerInput({
  visible,
  display,
  placeholder,
  editable,
  onChangeText,
  onBlur,
  onSubmitEditing,
}: WagerInputProps) {
  return (
    <View
      collapsable={false}
      style={[
        actionBarStyles.betInputPlaceholder,
        {
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? "auto" : "none",
        },
      ]}
    >
      <Input
        iconLeft="$"
        value={display}
        onChangeText={onChangeText}
        onBlur={onBlur}
        onSubmitEditing={onSubmitEditing}
        keyboardType="decimal-pad"
        returnKeyType="done"
        placeholder={placeholder}
        selectTextOnFocus
        editable={editable}
        allowFontScaling={false}
        maxLength={10}
        style={{ maxWidth: 144 }}
        accessibilityLabel="Bet amount input"
        accessibilityState={{ disabled: !editable }}
      />
    </View>
  );
}
