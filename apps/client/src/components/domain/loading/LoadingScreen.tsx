import { useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { Loader } from "@/components/base/Loader";
import { LOADING_MESSAGES } from "@/constants/copy";

export function LoadingScreen() {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <View className="flex-1 ui-center bg-bg">
      <Loader />
      <Text variant="muted" className="mt-4">
        {LOADING_MESSAGES[msgIndex]}
      </Text>
    </View>
  );
}
