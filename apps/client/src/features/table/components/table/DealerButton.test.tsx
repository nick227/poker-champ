/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DealerButton } from "./DealerButton";

describe("DealerButton", () => {
  it("mounts without throwing and shows the D label", () => {
    render(<DealerButton />);
    expect(screen.getByText("D")).toBeTruthy();
  });

  it("renders a gold-rimmed puck face rather than a flat dot", () => {
    render(<DealerButton size="large" />);
    // The face's gradient fill isn't asserted here — happy-dom's CSSStyleDeclaration doesn't
    // reliably round-trip gradient() values containing hsl() color stops. The rim border color
    // (a plain hsl() value, not inside a gradient) is a reliable, equally meaningful signal that
    // this renders a puck/token rather than the old flat "bg-blue-500" dot.
    const puck = screen.getByTestId("dealer-button");
    expect(puck.style.borderColor).toBe("hsl(43, 70%, 45%)");
    expect(screen.getByTestId("dealer-button-face")).toBeTruthy();
  });
});
