import { useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Pressable } from "react-native";
import { Screen } from "@/components/containers/Screen";
import { ArticleLayout } from "@/components/domain/blog/ArticleLayout";
import { Text } from "@/components/base/Text";
import { getArticle } from "@/content/blog/blogManifest";

export default function BlogArticleScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const article = slug ? getArticle(slug) : null;
  const goToBlog = useCallback(() => router.push("/blog"), [router]);

  if (!article) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center p-6">
          <Text variant="muted">Article not found.</Text>
          <Pressable onPress={goToBlog} className="mt-2">
            <Text variant="body" className="text-accent">Back to blog</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const { body, ...meta } = article;
  return (
    <Screen>
      <View className="flex-1">
        <Pressable onPress={goToBlog} className="px-4 py-2 self-start" hitSlop={8}>
          <Text variant="body" className="text-accent">← Back to Blog</Text>
        </Pressable>
        <ArticleLayout meta={meta} body={body} />
      </View>
    </Screen>
  );
}
