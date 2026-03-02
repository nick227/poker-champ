import { useCallback, useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/components/domain/lobby/Masthead";
import { AppTopNav } from "@/components/domain/navigation/AppTopNav";
import { OnlinePlayersSheet } from "@/components/domain/lobby/OnlinePlayersSheet";
import { BottomBar } from "@/components/containers/BottomBar";
import { Text } from "@/components/base/Text";
import { getAllArticles } from "@/content/blog/blogManifest";
import { useProfile } from "@/hooks/useProfile";
import { useBankroll } from "@/hooks/useBankroll";
import { storeRegistry } from "@/registry/store.registry";
import { useLobbyRealtimeBridge } from "@/realtime/lobbyRealtimeBridge";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function BlogListScreen() {
  const router = useRouter();
  const articles = getAllArticles();
  const profile = useProfile();
  const { cents } = useBankroll();
  const { onlineTotal, onlinePlayers, onlineBusy, onlineError } = storeRegistry.use.lobby();
  const { requestOnlinePlayers } = useLobbyRealtimeBridge();
  const [onlineSheetVisible, setOnlineSheetVisible] = useState(false);

  const openArticle = useCallback(
    (slug: string) => {
      router.push(`/blog/${slug}`);
    },
    [router]
  );

  const openOnlineSheet = useCallback(() => {
    setOnlineSheetVisible(true);
    requestOnlinePlayers();
  }, [requestOnlinePlayers]);

  const onlineLabel = onlineTotal === 1 ? "1 Online" : `${onlineTotal} Online`;

  return (
    <Screen>
      <Masthead />
      <AppTopNav
        username={profile.username ?? "Player"}
        onlineLabel={onlineLabel}
        onPressOnline={openOnlineSheet}
        amountCents={cents}
        avatarUrl={profile.avatarUrl}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-5">
          {articles.map((a) => (
            <Pressable
              key={a.slug}
              onPress={() => openArticle(a.slug)}
              className="rounded-xl border border-border bg-panel p-4 active:opacity-90"
            >
              <Text variant="h2" className="text-base">
                {a.title}
              </Text>
              <Text variant="muted" className="mt-1.5 text-sm" numberOfLines={2}>
                {a.summary}
              </Text>
              <Text variant="caption" className="mt-2 text-muted">
                {formatDate(a.publishedAt)}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
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
