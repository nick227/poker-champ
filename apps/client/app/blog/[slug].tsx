import { useState, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Pressable } from "react-native";
import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/features/lobby";
import { AppTopNav } from "@/components/domain/navigation/AppTopNav";
import { HeaderStack } from "@/components/containers/HeaderStack";
import { ArticleLayout } from "@/components/domain/blog/ArticleLayout";
import { OnlinePlayersSheet } from "@/features/lobby";
import { BottomBar } from "@/components/containers/BottomBar";
import { Text } from "@/components/base/Text";
import { getArticle } from "@/content/blog/blogManifest";
import { useProfile } from "@/hooks/useProfile";
import { useBankroll } from "@/hooks/useBankroll";
import { storeRegistry } from "@/registry/store.registry";
import { useLobbyRealtimeBridge } from "@/features/lobby/realtime/lobbyRealtimeBridge";

export default function BlogArticleScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const article = slug ? getArticle(slug) : null;
  const profile = useProfile();
  const { cents } = useBankroll();
  const { onlineTotal, onlinePlayers, onlineBusy, onlineError } = storeRegistry.use.lobby();
  const { requestOnlinePlayers } = useLobbyRealtimeBridge();
  const [onlineSheetVisible, setOnlineSheetVisible] = useState(false);

  const openOnlineSheet = useCallback(() => {
    setOnlineSheetVisible(true);
    requestOnlinePlayers();
  }, [requestOnlinePlayers]);

  const onlineLabel = onlineTotal === 1 ? "1 Online" : `${onlineTotal} Online`;

  const goToBlog = useCallback(() => router.push("/blog"), [router]);

  if (!article) {
    return (
      <Screen>
        <HeaderStack>
          <Masthead />
          <AppTopNav
            username={profile.username ?? "Player"}
            onlineLabel={onlineLabel}
            onPressOnline={openOnlineSheet}
            amountCents={cents}
            avatarUrl={profile.avatarUrl}
          />
        </HeaderStack>
        <View className="flex-1 items-center justify-center p-6">
          <Text variant="muted">Article not found.</Text>
          <Pressable onPress={goToBlog} className="mt-2">
            <Text variant="body" className="text-accent">Back to blog</Text>
          </Pressable>
        </View>
        <OnlinePlayersSheet
          visible={onlineSheetVisible}
          onClose={() => setOnlineSheetVisible(false)}
          players={onlinePlayers}
          loading={onlineBusy}
          error={onlineError}
          onRefresh={requestOnlinePlayers}
        />
        <BottomBar active="lobby" />
      </Screen>
    );
  }

  const { body, ...meta } = article;
  return (
    <Screen>
      <HeaderStack>
        <Masthead />
        <AppTopNav
          username={profile.username ?? "Player"}
          onlineLabel={onlineLabel}
          onPressOnline={openOnlineSheet}
          amountCents={cents}
          avatarUrl={profile.avatarUrl}
        />
      </HeaderStack>
      <View className="flex-1">
        <Pressable onPress={goToBlog} className="px-4 py-2 self-start" hitSlop={8}>
          <Text variant="body" className="text-accent">← Back to Blog</Text>
        </Pressable>
        <ArticleLayout meta={meta} body={body} />
      </View>
      <OnlinePlayersSheet
        visible={onlineSheetVisible}
        onClose={() => setOnlineSheetVisible(false)}
        players={onlinePlayers}
        loading={onlineBusy}
        error={onlineError}
        onRefresh={requestOnlinePlayers}
      />
      <BottomBar active="lobby" />
    </Screen>
  );
}
