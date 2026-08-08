/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { PotChipStack } from "./PotChipStack";

describe("PotChipStack", () => {
  it("renders nothing when there's no pot", () => {
    const { container } = render(<PotChipStack potCents={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("mounts without throwing and renders at least one chip column for a pot", () => {
    const { getByTestId, getAllByTestId } = render(<PotChipStack potCents={300} />);
    expect(getByTestId("pot-chip-stack")).toBeTruthy();
    expect(getAllByTestId("pot-chip-stack-column").length).toBeGreaterThanOrEqual(1);
  });

  it("renders more chip columns for a much bigger pot", () => {
    const small = render(<PotChipStack potCents={300} />);
    const smallColumns = small.getAllByTestId("pot-chip-stack-column").length;
    small.unmount();

    const big = render(<PotChipStack potCents={500_000_00} />);
    const bigColumns = big.getAllByTestId("pot-chip-stack-column").length;
    big.unmount();

    expect(bigColumns).toBeGreaterThan(smallColumns);
  });
});
