import { View, Text } from "react-native";
import { Text as BaseText } from "./Text";

interface PremiumContentBadgeProps {
  isPremium: boolean;
  hasAccess: boolean;
  requiredTier?: string;
  size?: "small" | "medium" | "large";
  className?: string;
}

export function PremiumContentBadge({ 
  isPremium, 
  hasAccess, 
  requiredTier,
  size = "medium",
  className = ""
}: PremiumContentBadgeProps) {
  if (!isPremium) {
    return null;
  }

  const sizeClasses = {
    small: "px-2 py-1",
    medium: "px-3 py-1.5",
    large: "px-4 py-2",
  };

  const textSizes = {
    small: "text-xs",
    medium: "text-sm",
    large: "text-base",
  };

  const badgeColor = hasAccess ? "bg-green-500/20 border-green-500" : "bg-brand/20 border-brand";
  const textColor = hasAccess ? "text-green-400" : "text-brand";

  return (
    <View className={`rounded-full border ${sizeClasses[size]} ${badgeColor} ${className}`}>
      <BaseText variant="caption" className={`${textSizes[size]} ${textColor} font-semibold`}>
        {hasAccess ? "Premium" : `${requiredTier || "Premium"}`}
      </BaseText>
    </View>
  );
}
