/** Minimal markdown parse for blog body: ## h2, ### h3, **bold**, [text](url), paragraphs. */

export type Inline =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "link"; text: string; url: string };

export type Block =
  | { type: "h2"; content: Inline[] }
  | { type: "h3"; content: Inline[] }
  | { type: "p"; content: Inline[] };

function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  while (i < line.length) {
    const linkMatch = line.slice(i).match(/^\[([^\]]*)\]\(([^)]*)\)/);
    if (linkMatch) {
      out.push({ type: "link", text: linkMatch[1], url: linkMatch[2] });
      i += linkMatch[0].length;
      continue;
    }
    const boldMatch = line.slice(i).match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      out.push({ type: "bold", value: boldMatch[1] });
      i += boldMatch[0].length;
      continue;
    }
    const nextLink = line.indexOf("[", i);
    const nextBold = line.indexOf("**", i);
    let end: number;
    if (nextLink >= 0 && nextBold >= 0) end = Math.min(nextLink, nextBold);
    else if (nextLink >= 0) end = nextLink;
    else if (nextBold >= 0) end = nextBold;
    else end = line.length;
    const slice = line.slice(i, end);
    if (slice) out.push({ type: "text", value: slice });
    i = end;
  }
  return out;
}

export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  const paras = md.split(/\n\n+/);
  for (const p of paras) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("### ")) {
      blocks.push({ type: "h3", content: parseInline(trimmed.slice(4)) });
    } else if (trimmed.startsWith("## ")) {
      blocks.push({ type: "h2", content: parseInline(trimmed.slice(3)) });
    } else {
      const line = trimmed.replace(/\n/g, " ").trim();
      blocks.push({ type: "p", content: parseInline(line) });
    }
  }
  return blocks;
}
