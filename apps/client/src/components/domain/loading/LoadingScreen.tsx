import { useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { Loader } from "@/components/base/Loader";
import { LOADING_MESSAGES } from "@/constants/copy";
import { Screen } from "@/components/containers/Screen";

export function LoadingScreen() {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <Screen>
      <View className="flex-1 ui-center">
        <Loader />
        <Text variant="muted" className="mt-4">
          {LOADING_MESSAGES[msgIndex]}
        </Text>
      </View>
    </Screen>
  );
}
