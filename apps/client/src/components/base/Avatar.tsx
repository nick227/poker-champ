import React from "react";
import { View, Text, Image } from "react-native";

interface AvatarProps {
  url?: string;
  username: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  xs: "w-6 h-6 text-xs",
  sm: "w-8 h-8 text-sm",
  md: "w-10 h-10 text-base",
  lg: "w-12 h-12 text-lg",
};

const getInitial = (username: string): string => {
  return username.charAt(0).toUpperCase();
};

const getAvatarColor = (username: string): string => {
  const colors = [
    "bg-blue-500",
    "bg-green-500", 
    "bg-purple-500",
    "bg-pink-500",
    "bg-indigo-500",
    "bg-red-500",
    "bg-yellow-500",
    "bg-teal-500",
  ];
  
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
};

export function Avatar({ url, username, size = "sm", className = "" }: AvatarProps) {
  const sizeClass = sizeClasses[size];
  const [imageError, setImageError] = React.useState(false);
  const [imageLoading, setImageLoading] = React.useState(true);

  React.useEffect(() => {
    if (url) {
      setImageError(false);
      setImageLoading(true);
    }
  }, [url]);

  if (!url || imageError) {
    return (
      <View className={`${sizeClass} ${getAvatarColor(username)} rounded-full items-center justify-center ${className}`}>
        <Text className="text-white font-semibold">
          {getInitial(username)}
        </Text>
      </View>
    );
  }

  return (
    <View className={`${sizeClass} ${className}`}>
      <Image
        source={{ uri: url }}
        className={`${sizeClass} rounded-full`}
        onError={() => setImageError(true)}
        onLoad={() => setImageLoading(false)}
        style={{ display: imageLoading ? 'none' : 'flex' }}
      />
      {imageLoading && (
        <View className={`${sizeClass} ${getAvatarColor(username)} rounded-full items-center justify-center absolute`}>
          <Text className="text-white font-semibold">
            {getInitial(username)}
          </Text>
        </View>
      )}
    </View>
  );
}
