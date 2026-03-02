import type { BlogArticle, BlogArticleMeta } from "./blog.types";
import { meta as a1, body as b1 } from "./articles/why-position-matters-6max";
import { meta as a2, body as b2 } from "./articles/3bet-or-fold-stop-flat-calling";
import { meta as a3, body as b3 } from "./articles/how-to-use-hand-replay";
import { meta as a4, body as b4 } from "./articles/pot-odds-plain-english";
import { meta as a5, body as b5 } from "./articles/building-preflop-opening-range";
import { meta as a6, body as b6 } from "./articles/practice-to-tables";

const articles: BlogArticle[] = [
  { ...a1, body: b1 },
  { ...a2, body: b2 },
  { ...a3, body: b3 },
  { ...a4, body: b4 },
  { ...a5, body: b5 },
  { ...a6, body: b6 },
];

const bySlug = new Map<string, BlogArticle>(articles.map((a) => [a.slug, a]));

export function getAllArticles(): BlogArticleMeta[] {
  return articles
    .map(({ body: _, ...meta }) => meta)
    .sort((a, b) => (b.publishedAt > a.publishedAt ? 1 : -1));
}

export function getArticle(slug: string): BlogArticle | null {
  return bySlug.get(slug) ?? null;
}

export function getRelatedArticles(currentSlug: string, limit = 4): BlogArticleMeta[] {
  const current = getArticle(currentSlug);
  const slugs = current?.relatedArticleSlugs;
  if (slugs?.length) {
    const out: BlogArticleMeta[] = [];
    for (const s of slugs) {
      const a = getArticle(s);
      if (a) {
        const { body: _b, ...meta } = a;
        out.push(meta);
      }
      if (out.length >= limit) break;
    }
    return out;
  }
  return articles
    .filter((a) => a.slug !== currentSlug)
    .slice(0, limit)
    .map(({ body: _, ...meta }) => meta);
}

/** Slugs to feature on the lobby (e.g. first 2). */
export const featuredSlugs: string[] = ["why-position-matters-6max", "how-to-use-hand-replay"];
