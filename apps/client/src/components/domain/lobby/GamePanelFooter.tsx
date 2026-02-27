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
    <View className="ui-row items-center justify-between gap-3 min-h-[40px]">
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
      <View className="ui-row items-center gap-2">
        <View className="w-8 h-8">
          {canDelete ? (
            <Pressable
              onPress={onDelete}
              className="w-8 h-8 rounded-full border border-border bg-panel items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Delete table"
            >
              <Text variant="body" className="text-sm">...</Text>
            </Pressable>
          ) : null}
        </View>
        <Animated.View style={{ opacity: ctaOpacity }} className="w-[120px]">
          <ConfirmButton title={isJoining ? "Joining..." : "Join Table"} onPress={onJoin} disabled={!canJoin || isJoining} />
        </Animated.View>
      </View>
    </View>
  );
}
