import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Text } from "./Text";
import { PLACEHOLDER_COLOR } from "@/theme/colors";
import { PASSWORD_INPUT } from "@/constants/copy";

type Props = {
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
};

export function PasswordInput({ label, value, onChangeText, placeholder }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <View className="ui-stack-2">
      {label ? <Text variant="muted">{label}</Text> : null}
      <View className="ui-row ui-inline-2 ui-surface ui-p-md min-h-[44px] items-center">
        <Text variant="muted">🔒</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={PLACEHOLDER_COLOR}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          className="flex-1 py-2 text-text"
        />
        <Pressable
          onPress={() => setVisible(!visible)}
          className="ui-touch"
        >
          <Text variant="muted">{visible ? PASSWORD_INPUT.hide : PASSWORD_INPUT.show}</Text>
        </Pressable>
      </View>
    </View>
  );
}
