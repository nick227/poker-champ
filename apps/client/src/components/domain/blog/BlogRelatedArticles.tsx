import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import type { BlogArticleMeta } from "@/content/blog/blog.types";

type BlogRelatedArticlesProps = {
  articles: BlogArticleMeta[];
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function BlogRelatedArticles({ articles }: BlogRelatedArticlesProps) {
  const router = useRouter();
  if (articles.length === 0) return null;

  return (
    <View className="mt-8 border-t border-border pt-6">
      <Text variant="h2" className="mb-4">
        More to read
      </Text>
      <View className="gap-4">
        {articles.map((a) => (
          <Pressable
            key={a.slug}
            onPress={() => router.push(`/blog/${a.slug}`)}
            className="ui-touch active:opacity-80"
          >
            <Text variant="body" className="font-semibold">
              {a.title}
            </Text>
            <Text variant="muted" className="mt-0.5 text-sm" numberOfLines={2}>
              {a.summary}
            </Text>
            <Text variant="caption" className="mt-1 text-muted">
              {formatDate(a.publishedAt)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
