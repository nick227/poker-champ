import { useCallback } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/containers/Screen";
import { Surface } from "@/components/containers/Surface";
import { Text } from "@/components/base/Text";
import { getAllArticles } from "@/content/blog/blogManifest";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function BlogListScreen() {
  const router = useRouter();
  const articles = getAllArticles();

  const openArticle = useCallback(
    (slug: string) => {
      router.push(`/blog/${slug}`);
    },
    [router],
  );

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-5">
          {articles.map((a) => (
            <Surface
              key={a.slug}
              as={Pressable}
              styleId="surface.list.panel"
              onPress={() => openArticle(a.slug)}
              className="active:opacity-90"
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
            </Surface>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
