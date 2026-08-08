/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TableGameTopBar } from "./TableGameTopBar";

describe("TableGameTopBar", () => {
  it("renders the table name and a dense blinds/min-buy-in line when both are known", () => {
    render(
      <TableGameTopBar
        tableName="High Stakes"
        smallBlindCents={100}
        bigBlindCents={200}
        minBuyInCents={10000}
        onLogoPress={vi.fn()}
      />,
    );
    expect(screen.getByText("High Stakes")).toBeTruthy();
    expect(screen.getByText(/^Blinds \$1 \| \$2.*Min \$100$/)).toBeTruthy();
  });

  it("omits the stakes line entirely when no blinds or min buy-in are known", () => {
    render(<TableGameTopBar tableName="Practice Table" onLogoPress={vi.fn()} />);
    expect(screen.getByText("Practice Table")).toBeTruthy();
    expect(screen.queryByText(/Blinds/)).toBeNull();
  });

  it("falls back to a min-only line when blinds are unknown", () => {
    render(<TableGameTopBar tableName="Table 2" minBuyInCents={5000} onLogoPress={vi.fn()} />);
    expect(screen.getByText("Min $50")).toBeTruthy();
  });
});
