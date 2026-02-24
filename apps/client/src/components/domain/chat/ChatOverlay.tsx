import { useState } from "react";
import { View, TextInput, Pressable, ScrollView } from "react-native";
import { Text } from "@/components/base/Text";
import { Icon } from "@/components/base/Icons";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { PLACEHOLDER_COLOR } from "@/theme/colors";
import { CHAT } from "@/constants/copy";
import type { ChatMessageForOverlay } from "./types";

export function ChatOverlay({
  visible,
  onClose,
  messages = [],
  onSend,
  onLoadOlder,
  hasMore = false,
  loadingOlder = false,
}: {
  visible: boolean;
  onClose: () => void;
  messages?: ChatMessageForOverlay[];
  onSend?: (text: string) => void;
  onLoadOlder?: () => void;
  hasMore?: boolean;
  loadingOlder?: boolean;
}) {
  const [input, setInput] = useState("");

  const handleSend = () => {
    const text = input.trim();
    if (!text || !onSend) return;
    onSend(text);
    setInput("");
  };

  return (
    <ModalSheet visible={visible} onClose={onClose} title="Chat">
      <View className="ui-stack-2">
        <ScrollView className="max-h-64 ui-stack-2">
          {hasMore ? (
            <View className="items-center mb-2">
              <Pressable onPress={onLoadOlder} disabled={loadingOlder} className="px-2 py-1">
                <Text variant="muted">{loadingOlder ? "Loading..." : "Load older"}</Text>
              </Pressable>
            </View>
          ) : null}
          {messages.length === 0 ? (
            <Text variant="muted">No messages yet.</Text>
          ) : (
            messages.map((m) => (
              <View
                key={m.id}
                className={`rounded-lg ui-p-2 ${m.isSelf ? "self-end bg-brand/30" : "border border-border bg-panel"}`}
              >
                <Text variant="muted">{m.sender}</Text>
                <Text variant="body">{m.text}</Text>
              </View>
            ))
          )}
        </ScrollView>
        <View className="ui-row ui-inline-2">
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={CHAT.placeholder}
            placeholderTextColor={PLACEHOLDER_COLOR}
            onSubmitEditing={handleSend}
            className="flex-1 ui-surface px-3 py-2 text-text"
          />
          <Pressable onPress={handleSend} className="ui-touch rounded-md bg-brand">
            <Icon name="send" size={18} />
          </Pressable>
        </View>
      </View>
    </ModalSheet>
  );
}

