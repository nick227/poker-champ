import { Animated, Easing, Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import { ConfirmButton } from "@/components/base/ConfirmButton";
import { useEffect, useRef } from "react";

export function GamePanelFooter({
  canJoin,
  onJoin,
  isJoining,
  canDelete,
  onDelete,
}: {
  canJoin: boolean;
  onJoin: () => void;
  isJoining?: boolean;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const ctaOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(ctaOpacity, {
      toValue: isJoining ? 0.85 : 1,
      duration: 120,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [ctaOpacity, isJoining]);

  return (
    <View className="ui-row items-center justify-between gap-3 min-h-[44px] mb-8">
      <View className="flex-1 min-h-[16px] justify-center">
        <Text
          variant="muted"
          className="text-[11px]"
          numberOfLines={1}
          style={{ opacity: canJoin ? 0 : 1 }}
        >
          Insufficient balance for min buy-in
        </Text>
      </View>
          {canDelete ? (
            <Pressable
              onPress={onDelete}
              className="ui-touch rounded-full border border-border !bg-transparent"
              accessibilityRole="button"
              accessibilityLabel="Delete table"
            >
              <Text variant="body" className="text-sm">🗑️</Text>
            </Pressable>
          ) : null}
    </View>
  );
}
