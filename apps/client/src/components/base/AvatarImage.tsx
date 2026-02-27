import { Image, Pressable, View } from "react-native";
import type { StyleProp, ViewStyle, ImageStyle } from "react-native";
import { Text } from "@/components/base/Text";
import { getAvatarImageUri } from "@/lib/avatar";

export type AvatarImageProps = {
  avatarUrl?: string | null;
  initial?: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  className?: string;
};

export function AvatarImage({
  avatarUrl,
  initial,
  onPress,
  disabled,
  style,
  imageStyle,
  className,
}: AvatarImageProps) {
  const uri = getAvatarImageUri(avatarUrl ?? undefined);

  const content = uri ? (
    <Image
      source={{ uri }}
      style={imageStyle}
      resizeMode="cover"
    />
  ) : initial ? (
    <Text variant="label" className="text-xs font-semibold" allowFontScaling={false}>
      {initial}
    </Text>
  ) : null;

  if (onPress && !disabled) {
    return (
      <Pressable
        onPress={onPress}
        style={style}
        className={className}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      style={style}
      className={className}
    >
      {content}
    </View>
  );
}

