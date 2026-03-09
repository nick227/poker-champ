import type { BackgroundImageId } from "./background.types";
import type { FeltGradient } from "./background.types";
import type { ResolvedBackground } from "./background.types";

function gradientToCss(g: FeltGradient): string {
  const isRadial = g.kind === "radial";
  const ellipse = "ellipse 92% 88% at 50% 50%";
  const colorStops =
    g.colors.length === 2
      ? g.colors.map((c) => `hsl(${c})`).join(", ")
      : g.colors
          .map((c, i) => {
            const pct =
              i === 0 ? 0 : i === g.colors.length - 1 ? 100 : Math.round((i / (g.colors.length - 1)) * 100);
            return `hsl(${c}) ${pct}%`;
          })
          .join(", ");
  return isRadial
    ? `radial-gradient(${ellipse}, ${colorStops})`
    : `linear-gradient(${g.angleDeg ?? 180}deg, ${colorStops})`;
}

export type GetBackgroundImageUrl = (id: BackgroundImageId) => string | null;

/** Selector for the single page root element that owns the app background (web). */
export const APP_PAGE_SELECTOR = "[data-app-page]";

const WEB_BG_KEYS = [
  "background",
  "background-color",
  "background-image",
  "background-size",
  "background-repeat",
  "background-position",
] as const;

function toCssProp(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** Applies background style to the app page root element. Used for theme preview. */
export function applyAppPageBackgroundStyle(style: Record<string, string>): void {
  if (typeof document === "undefined") return;
  const page = document.querySelector<HTMLElement>(APP_PAGE_SELECTOR);
  if (!page) return;
  for (const key of WEB_BG_KEYS) page.style.removeProperty(key);
  for (const [name, value] of Object.entries(style)) {
    page.style.setProperty(toCssProp(name), value);
  }
}

/**
 * Converts ResolvedBackground to inline CSS for the app page container.
 * Caller provides getImageUrl so asset resolution stays outside the adapter.
 */
export function resolvedToBodyStyle(
  resolved: ResolvedBackground,
  getImageUrl: GetBackgroundImageUrl
): Record<string, string> {
  switch (resolved.kind) {
    case "none":
      return {
        backgroundColor: resolved.color != null ? `hsl(${resolved.color})` : "transparent",
      };
    case "color":
      return { backgroundColor: `hsl(${resolved.color})` };
    case "gradient":
      return { background: gradientToCss(resolved.gradient) };
    case "image": {
      const url = getImageUrl(resolved.imageId);
      if (!url) {
        const fallback = resolved.color != null ? `hsl(${resolved.color})` : "transparent";
        return { backgroundColor: fallback };
      }
      const size = resolved.size === "stretch" ? "100% 100%" : "cover";
      const safeUrl = url.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      // backgroundPosition is a no-op when size is 100% 100% (stretch fills edge-to-edge)
      const position = size === "100% 100%" ? undefined : "center";
      return {
        backgroundImage: `url("${safeUrl}")`,
        backgroundSize: size,
        backgroundRepeat: "no-repeat",
        ...(position ? { backgroundPosition: position } : {}),
      };
    }
  }
}
