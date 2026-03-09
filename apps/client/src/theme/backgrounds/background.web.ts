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

/**
 * Converts ResolvedBackground to inline CSS for body / #root.
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
