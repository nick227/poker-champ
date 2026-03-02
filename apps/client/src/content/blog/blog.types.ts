export type BlogArticleMeta = {
  slug: string;
  title: string;
  summary: string;
  publishedAt: string;
  updatedAt?: string;
  cover?: string;
  relatedLessonIds?: string[];
  featureLobby?: boolean;
  relatedArticleSlugs?: string[];
};

export type BlogArticle = BlogArticleMeta & { body: string };
