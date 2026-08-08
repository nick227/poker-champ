/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TableFeltSurface } from "./TableFeltSurface";
import type { ResolvedBackground } from "@/theme/backgrounds/background.types";

describe("TableFeltSurface", () => {
  it("mounts without throwing and renders the rail, felt, radial, and vignette layers", () => {
    const { getByTestId } = render(<TableFeltSurface />);
    expect(getByTestId("table-felt-surface")).toBeTruthy();
    expect(getByTestId("table-felt-rail")).toBeTruthy();
    expect(getByTestId("table-felt-inner")).toBeTruthy();
    expect(getByTestId("table-felt-radial")).toBeTruthy();
    expect(getByTestId("table-felt-vignette")).toBeTruthy();
  });

  it("mounts without throwing for a resolved color background", () => {
    // The actual color→shading derivation is covered directly (no DOM involved) by
    // resolveFeltShadingBase/buildFeltShadingStops in feltShading.test.ts — happy-dom's
    // CSSStyleDeclaration doesn't reliably round-trip gradient() values containing hsl().
    const resolved: ResolvedBackground = { kind: "color", color: "0 80% 50%" };
    const { getByTestId } = render(<TableFeltSurface resolved={resolved} />);
    expect(getByTestId("table-felt-radial")).toBeTruthy();
  });

  it("leaves the radial layer transparent for image-backed felt so the texture shows through", () => {
    const resolved: ResolvedBackground = {
      kind: "image",
      color: null,
      imageId: "green",
      size: "cover",
    };
    const { getByTestId } = render(<TableFeltSurface resolved={resolved} />);
    const radial = getByTestId("table-felt-radial") as HTMLElement;
    expect(radial.style.backgroundColor).toBe("transparent");
  });

  it("uses a smaller rail geometry in compact mode", () => {
    const regular = render(<TableFeltSurface />);
    const regularRadius = (regular.getByTestId("table-felt-rail") as HTMLElement).style.borderRadius;
    regular.unmount();

    const compact = render(<TableFeltSurface compact />);
    const compactRadius = (compact.getByTestId("table-felt-rail") as HTMLElement).style.borderRadius;
    compact.unmount();

    expect(parseFloat(compactRadius)).toBeLessThan(parseFloat(regularRadius));
  });
});
