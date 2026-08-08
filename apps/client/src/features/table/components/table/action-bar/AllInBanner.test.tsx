/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AllInBanner } from "./AllInBanner";

describe("AllInBanner", () => {
  it("renders the ALL-IN banner when visible", () => {
    render(<AllInBanner visible />);
    expect(screen.getByTestId("all-in-banner")).toBeTruthy();
    expect(screen.getByText("ALL-IN")).toBeTruthy();
  });

  it("renders nothing when not visible", () => {
    const { container } = render(<AllInBanner visible={false} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText("ALL-IN")).toBeNull();
  });
});
