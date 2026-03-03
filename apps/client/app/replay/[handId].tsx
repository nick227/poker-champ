import { View } from "react-native";
import type { ReactNode } from "react";
import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/components/domain/lobby/Masthead";
import { BottomBar } from "@/components/containers/BottomBar";
import { HeaderStack } from "@/components/containers/HeaderStack";
import { ReplayContent } from "@/components/replay/ReplayContent";
import { useLocalSearchParams } from "expo-router";
import { Text as BaseText } from "@/components/base/Text";

export default function ReplayScreen() {
  const { handId } = useLocalSearchParams<{ handId: string }>();
  const handIdStr = Array.isArray(handId) ? handId[0] : handId ?? "";

  const wrapWithShell = (content: ReactNode) => (
    <Screen>
      <HeaderStack>
        <Masthead />
      </HeaderStack>
      <View className="flex-1 ui-stack-3">
        {content}
      </View>
      <BottomBar active="lobby" />
    </Screen>
  );

  if (!handIdStr) {
    return wrapWithShell(
      <View className="flex-1 justify-center items-center px-4">
        <BaseText variant="muted" className="text-center">
          Error: No hand ID provided
        </BaseText>
      </View>
    );
  }

  return wrapWithShell(
    <View className="flex-1">
      <ReplayContent source={{ type: "handId", handId: handIdStr }} />
    </View>
  );
}
