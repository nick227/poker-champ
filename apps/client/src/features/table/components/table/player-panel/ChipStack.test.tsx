/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChipStack } from "./ChipStack";

describe("ChipStack", () => {
  it("mounts and shows the formatted bet label", () => {
    render(<ChipStack cents={200} label="$2.00" />);
    expect(screen.getByText("$2.00")).toBeTruthy();
  });

  it("exposes the raw bet amount via data-bet-cents for tooling/tests", () => {
    const { container } = render(<ChipStack cents={500} label="$5.00" />);
    expect(container.querySelector('[data-bet-cents="500"]')).toBeTruthy();
  });

  it("does not throw for a zero bet", () => {
    expect(() => render(<ChipStack cents={0} label="$0.00" />)).not.toThrow();
  });
});
