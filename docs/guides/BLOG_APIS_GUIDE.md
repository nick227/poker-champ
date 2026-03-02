# Blog APIs – Developer Guide

The blog is **client-side content** only: there are no HTTP endpoints. Articles live in the client repo; you read them via the blog manifest and types. This guide covers the API surface, types, adding articles, and linking from lessons.

## Overview

- **Location:** `apps/client/src/content/blog/`
- **Types:** `apps/client/src/content/blog/blog.types.ts`
- **Manifest (API):** `apps/client/src/content/blog/blogManifest.ts`
- **Routes:** `/blog` (list), `/blog/[slug]` (article)

## Types

### `BlogArticleMeta`

Metadata for an article (no body). Used for list and related-article cards.

```ts
type BlogArticleMeta = {
  slug: string;
  title: string;
  summary: string;
  publishedAt: string;      // ISO date e.g. "2025-02-28"
  updatedAt?: string;
  cover?: string;
  relatedLessonIds?: string[];
  featureLobby?: boolean;   // Include in lobby "From the blog"
  relatedArticleSlugs?: string[];
};
```

### `BlogArticle`

Full article: metadata + body (markdown string).

```ts
type BlogArticle = BlogArticleMeta & { body: string };
```

## API (blog manifest)

Import from `@/content/blog/blogManifest` (or the relative path under `apps/client/src/content/blog/`).

### `getAllArticles(): BlogArticleMeta[]`

Returns all articles as metadata only, **sorted by `publishedAt` descending**. Use for the blog index.

```ts
import { getAllArticles } from "@/content/blog/blogManifest";

const articles = getAllArticles();
// [{ slug, title, summary, publishedAt, ... }, ...]
```

### `getArticle(slug: string): BlogArticle | null`

Returns the full article (meta + body) for a slug, or `null` if not found. Use for the article page.

```ts
import { getArticle } from "@/content/blog/blogManifest";

const article = getArticle("why-position-matters-6max");
if (article) {
  const { body, ...meta } = article;
  // meta: BlogArticleMeta, body: string (markdown)
}
```

### `getRelatedArticles(currentSlug: string, limit?: number): BlogArticleMeta[]`

Returns related articles for the current one. Uses `meta.relatedArticleSlugs` when set; otherwise falls back to other articles (excluding current), up to `limit` (default 4).

```ts
import { getRelatedArticles } from "@/content/blog/blogManifest";

const related = getRelatedArticles("why-position-matters-6max", 4);
```

### `featuredSlugs: string[]`

Slugs of articles to feature on the lobby (“From the blog”). Order in the array is the display order.

```ts
import { featuredSlugs, getArticle } from "@/content/blog/blogManifest";

const featured = featuredSlugs
  .map((slug) => getArticle(slug))
  .filter((a): a is NonNullable<typeof a> => a != null);
```

## Adding a new article

1. **Create the article file**  
   `apps/client/src/content/blog/articles/<slug>.ts`  
   Export `meta: BlogArticleMeta` and `body: string` (markdown).

   ```ts
   import type { BlogArticleMeta } from "../blog.types";

   export const meta: BlogArticleMeta = {
     slug: "your-article-slug",
     title: "Your Title",
     summary: "Short summary.",
     publishedAt: "2025-02-28",
     relatedArticleSlugs: ["other-slug-1", "other-slug-2"],
     featureLobby: false,
   };

   export const body = `## First heading

   Paragraph with **bold** and [links](https://example.com).
   `;
   ```

2. **Register in the manifest**  
   In `blogManifest.ts`:
   - Import meta and body from the new file.
   - Add `{ ...meta, body }` to the `articles` array.

3. **Optional: feature on lobby**  
   Add the slug to the `featuredSlugs` array in `blogManifest.ts` if the article should appear in “From the blog” on the lobby.

## Linking from lessons (Poker School)

Lessons can link to a blog post from the **completion view** (and from the lesson record in the DB).

- **DB:** `Lesson.blogPostSlug` (optional). Set to the article **slug** (e.g. `why-position-matters-6max`).
- **Completion UI:** When `lesson.blogPostSlug` is set, the completion screen shows a “Related” block with “Read blog post” that navigates to `/blog/[slug]`.

So the lesson’s `blogPostSlug` must match a slug that exists in the blog manifest; otherwise the link will 404. There is no server-side validation of `blogPostSlug` against the client blog content.

## Routes and UI

| Route        | Source                    | Usage |
|-------------|----------------------------|--------|
| `/blog`     | `app/blog/index.tsx`      | Uses `getAllArticles()` to render the list. |
| `/blog/[slug]` | `app/blog/[slug].tsx`  | Uses `getArticle(slug)`; 404 when `getArticle` returns `null`. |

**Components:**

- **BlogFeaturedLinks** – Uses `featuredSlugs` and `getArticle(slug)` to show “From the blog” on the lobby.
- **ArticleLayout** – Uses `getRelatedArticles(meta.slug, 4)` for the “More to read” section.
- **BlogProse** – Renders `body` (minimal markdown: `##`, `###`, `**bold**`, `[text](url)`, paragraphs).

## Markdown in `body`

Blog bodies use a minimal markdown subset (see `blogMarkdown.ts` / `BlogProse`): headings (`##`, `###`), **bold**, `[text](url)`, and paragraphs. Fancy syntax (tables, code blocks, etc.) may not be supported; stick to the above for predictable rendering.
