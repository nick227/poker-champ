import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { featuredSlugs } from "@/content/blog/blogManifest";
import { getArticle } from "@/content/blog/blogManifest";

type BlogFeaturedLinksProps = {
  /** When true, no horizontal padding (for use inside already-padded content). */
  compact?: boolean;
};

export function BlogFeaturedLinks({ compact }: BlogFeaturedLinksProps = {}) {
  const router = useRouter();
  const articles = featuredSlugs
    .map((slug) => getArticle(slug))
    .filter((a): a is NonNullable<typeof a> => a != null)
    .slice(0, 2);

  if (articles.length === 0) return null;

  return (
    <View className={compact ? "mb-3" : "mb-3 px-4"}>
      <Text variant="label" className="mb-2 text-muted">
        From the blog
      </Text>
      <View className="gap-2">
        {articles.map((a) => (
          <Pressable
            key={a.slug}
            onPress={() => router.push(`/blog/${a.slug}`)}
            className="rounded-xl border border-border bg-panel p-3 active:opacity-90"
          >
            <Text variant="body" className="font-semibold">
              {a.title}
            </Text>
            <Text variant="muted" className="mt-0.5 text-xs" numberOfLines={1}>
              {a.summary}
            </Text>
          </Pressable>
        ))}
        <Pressable onPress={() => router.push("/blog")} className="py-2">
          <Text variant="muted" className="text-sm text-accent">
            See all articles
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
