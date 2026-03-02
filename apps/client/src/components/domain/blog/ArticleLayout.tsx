import { View, ScrollView } from "react-native";
import { Text } from "@/components/base/Text";
import { BlogProse } from "./BlogProse";
import { BlogRelatedArticles } from "./BlogRelatedArticles";
import type { BlogArticleMeta } from "@/content/blog/blog.types";
import { getRelatedArticles } from "@/content/blog/blogManifest";

type ArticleLayoutProps = {
  meta: BlogArticleMeta;
  body: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function ArticleLayout({ meta, body }: ArticleLayoutProps) {
  const related = getRelatedArticles(meta.slug, 4);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
      <View className="mb-6">
        <Text variant="h1" className="text-2xl">
          {meta.title}
        </Text>
        <Text variant="muted" className="mt-2">
          {meta.summary}
        </Text>
        <Text variant="caption" className="mt-2 text-muted">
          {formatDate(meta.publishedAt)}
        </Text>
      </View>
      <BlogProse body={body} />
      <BlogRelatedArticles articles={related} />
    </ScrollView>
  );
}
