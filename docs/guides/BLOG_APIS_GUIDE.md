# Blog APIs - Developer Guide

The blog is client-side content only: there are no HTTP endpoints. Articles live in the client repo; you read them via the blog manifest and types.

## Overview

- Location: `apps/client/src/content/blog/`
- Types: `apps/client/src/content/blog/blog.types.ts`
- Manifest API: `apps/client/src/content/blog/blogManifest.ts`
- Routes: `/blog` (list), `/blog/[slug]` (article)
- Lobby status: blog surfacing in lobby is moth-balled for now.

## Types

### `BlogArticleMeta`

```ts
type BlogArticleMeta = {
  slug: string;
  title: string;
  summary: string;
  publishedAt: string;
  updatedAt?: string;
  cover?: string;
  relatedLessonIds?: string[];
  relatedArticleSlugs?: string[];
};
```

### `BlogArticle`

```ts
type BlogArticle = BlogArticleMeta & { body: string };
```

## Manifest API

### `getAllArticles(): BlogArticleMeta[]`

Returns all articles as metadata only, sorted by `publishedAt` descending.

### `getArticle(slug: string): BlogArticle | null`

Returns the full article (meta + body) for a slug, or `null` if not found.

### `getRelatedArticles(currentSlug: string, limit?: number): BlogArticleMeta[]`

Returns related articles for the current one. Uses `relatedArticleSlugs` when set; otherwise falls back to other articles (excluding current), up to `limit` (default 4).

## Adding a new article

1. Create `apps/client/src/content/blog/articles/<slug>.ts`.
2. Export `meta: BlogArticleMeta` and `body: string`.
3. Register it in `blogManifest.ts` by importing and adding it to the `articles` array.

Example:

```ts
import type { BlogArticleMeta } from "../blog.types";

export const meta: BlogArticleMeta = {
  slug: "your-article-slug",
  title: "Your Title",
  summary: "Short summary.",
  publishedAt: "2025-02-28",
  relatedArticleSlugs: ["other-slug-1", "other-slug-2"],
};

export const body = `## First heading\n\nParagraph.`;
```

## Lessons linking to blog

Lessons can link to a blog post from completion view via `Lesson.blogPostSlug`.
- It must match a real blog slug, or the link will 404.

## Markdown support

Blog bodies use a minimal markdown subset: headings (`##`, `###`), bold, links, and paragraphs.
