import { useState, useEffect, useRef } from "react";
import { View, TextInput, ScrollView, Platform, useWindowDimensions, Modal, Pressable, Animated } from "react-native";
import { Button } from "@/components/base/Button";
import { IconButton } from "@/components/base/IconButton";
import { Text } from "@/components/base/Text";
import { Icon } from "@/components/base/Icons";
import { ModalSheet } from "@/components/containers/ModalSheet";
import { PLACEHOLDER_COLOR, BACKDROP_OVERLAY } from "@/theme/colors";
import { CHAT, MODAL } from "@/constants/copy";
import { PRESS_OPACITY } from "@/theme/animation";
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
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  // Slide animation for desktop drawer
  const slideAnim = useRef(new Animated.Value(320)).current;

  useEffect(() => {
    if (isDesktop) {
      if (visible) {
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: false,
          tension: 65,
          friction: 11,
        }).start();
      } else {
        Animated.timing(slideAnim, {
          toValue: 320,
          duration: 200,
          useNativeDriver: false,
        }).start();
      }
    }
  }, [visible, isDesktop, slideAnim]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || !onSend) return;
    onSend(text);
    setInput("");
  };

  const content = (
    <View className="flex-1 ui-p-3" style={{ flex: 1, minHeight: 0 }}>
      <View className="ui-row ui-inline-2 mb-3">
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={CHAT.placeholder}
          placeholderTextColor={PLACEHOLDER_COLOR}
          onSubmitEditing={handleSend}
          className="flex-1 ui-surface px-3 py-2 text-text"
        />
        <IconButton
          icon={<Icon name="send" size={18} />}
          onPress={handleSend}
          intent="primary"
          size="md"
          disabled={!input.trim()}
        />
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 16 }}>
        {messages.length === 0 ? (
          <Text variant="muted">No messages yet.</Text>
        ) : (
          <View className="ui-stack-2">
            {[...messages].reverse().map((m) => (
              <View
                key={m.id}
                className={`rounded-lg w-full p-2 px-4 bg-panel border-bottom border-secondary ${m.isSelf ? "self-end" : "border border-border"}`}
              >
                <Text variant="muted">{m.sender}</Text>
                <Text variant="body">{m.text}</Text>
              </View>
            ))}
          </View>
        )}
        {hasMore ? (
          <View className="items-center mt-4 mb-2">
            <Button
              title={loadingOlder ? "Loading..." : "Load older"}
              onPress={onLoadOlder ?? (() => {})}
              disabled={loadingOlder || !onLoadOlder}
              intent="ghost"
              size="sm"
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );

  // Desktop slide-from-right drawer
  if (isDesktop) {
    if (!visible && (slideAnim as any)._value === 320) return null; // Wait for exit animation
    
    return (
      <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <Pressable 
            style={{ flex: 1, backgroundColor: BACKDROP_OVERLAY }} 
            onPress={onClose}
          />
          <Animated.View 
            style={{ 
              width: 320, 
              height: '100%', 
              backgroundColor: '#1C2127', // matching panel-elevated
              borderLeftWidth: 1,
              borderColor: 'rgba(255,255,255,0.1)',
              transform: [{ translateX: slideAnim }]
            }}
          >
            <View className="ui-row justify-between ui-border-b ui-p-inline-4 ui-p-stack-3 shrink-0">
              <Text variant="h2">Chat</Text>
              <Pressable
                onPress={onClose}
                className="ui-touch"
                style={({ pressed }) => ({ opacity: pressed ? PRESS_OPACITY.pressed : 1 })}
              >
                <Text variant="muted">{MODAL.close}</Text>
              </Pressable>
            </View>
            {content}
          </Animated.View>
        </View>
      </Modal>
    );
  }

  // Mobile bottom sheet
  return (
    <ModalSheet 
      visible={visible} 
      onClose={onClose} 
      title="Chat" 
      blocking={false} 
      snapPoints={["minimal", 0.4, 0.75, 1.0]} 
      defaultSnapIndex={2}
    >
      {content}
    </ModalSheet>
  );
}
