import type { ReactNode } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/containers/Screen";
import { ReplayContent } from "@/components/replay/ReplayContent";
import { getCommunityHandById } from "@/features/replay/community/communityHands";
import { Text as BaseText } from "@/components/base/Text";

function wrapWithShell(content: ReactNode) {
  return (
    <Screen>
      <View className="flex-1 ui-stack-3">{content}</View>
    </Screen>
  );
}

export default function CommunityReplayScreen() {
  const { communityId } = useLocalSearchParams<{ communityId: string }>();
  const communityIdStr = Array.isArray(communityId) ? communityId[0] : communityId ?? "";
  const hand = communityIdStr ? getCommunityHandById(communityIdStr) : null;

  if (!hand) {
    return wrapWithShell(
      <View className="flex-1 justify-center items-center px-4">
        <BaseText variant="muted" className="text-center">
          Community replay not found.
        </BaseText>
      </View>,
    );
  }

  return wrapWithShell(
    <View className="flex-1">
      <ReplayContent
        source={{
          type: "snapshots",
          handId: `community:${hand.id}`,
          snapshots: hand.snapshots,
        }}
      />
    </View>,
  );
}
