/**
 * @vitest-environment happy-dom
 *
 * Proves the specific reconnect-duplication concern: DECLINED/EXPIRED/CANCELLED don't require
 * a particular prior status to fire (unlike "sent"/"accepted", which require PENDING), so a
 * naive per-id last-seen-status ref that resets on remount would replay a stale toast for a
 * bet that was already terminal before the component mounted. The fix baselines silently on
 * the first observation after mount and only reacts to transitions seen while mounted.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SideBetEntry } from "@/features/table/stores/table.store";

vi.mock("@/components/base/Toast", () => ({
  Toast: ({ message }: { message: string }) => <div data-testid="toast">{message}</div>,
}));

import { SideBetStatusToast } from "../SideBetStatusToast";

const HERO = "user_hero";
const OTHER = "user_other";

function bet(overrides: Partial<SideBetEntry>): Record<string, SideBetEntry> {
  const base: SideBetEntry = {
    interactionId: "sidebet_1",
    status: "PENDING",
    initiatorUserId: HERO,
    initiatorName: "Hero",
    recipientUserId: OTHER,
    recipientName: "Alice",
    catalogKey: "sidebet.unknown",
    stakeCents: 100,
    ...overrides,
  };
  return { [base.interactionId]: base };
}

describe("SideBetStatusToast", () => {
  it("does not fire a toast for a bet that is already terminal on first mount (reconnect case)", () => {
    render(<SideBetStatusToast sideBets={bet({ status: "DECLINED" })} heroUserId={HERO} />);
    expect(screen.queryByTestId("toast")).toBeNull();
  });

  it("does not fire a toast for a bet that is already ACTIVE on first mount", () => {
    render(<SideBetStatusToast sideBets={bet({ status: "ACTIVE" })} heroUserId={HERO} />);
    expect(screen.queryByTestId("toast")).toBeNull();
  });

  it("fires the sent toast when a new PENDING offer appears after mount", () => {
    const { rerender } = render(<SideBetStatusToast sideBets={{}} heroUserId={HERO} />);
    expect(screen.queryByTestId("toast")).toBeNull();
    rerender(<SideBetStatusToast sideBets={bet({ status: "PENDING" })} heroUserId={HERO} />);
    expect(screen.getByTestId("toast").textContent).toMatch(/Side bet sent to Alice/);
  });

  it("fires the accepted toast on a genuine PENDING -> ACTIVE transition while mounted", () => {
    const { rerender } = render(<SideBetStatusToast sideBets={bet({ status: "PENDING" })} heroUserId={HERO} />);
    rerender(<SideBetStatusToast sideBets={bet({ status: "ACTIVE" })} heroUserId={HERO} />);
    expect(screen.getByTestId("toast").textContent).toMatch(/Alice accepted your side bet/);
  });

  it("fires the declined toast on a genuine PENDING -> DECLINED transition while mounted", () => {
    const { rerender } = render(<SideBetStatusToast sideBets={bet({ status: "PENDING" })} heroUserId={HERO} />);
    rerender(<SideBetStatusToast sideBets={bet({ status: "DECLINED" })} heroUserId={HERO} />);
    expect(screen.getByTestId("toast").textContent).toMatch(/Alice declined your side bet/);
  });

  it("does not refire on unmount + remount even if the bet is already DECLINED the second time", () => {
    const { rerender, unmount } = render(<SideBetStatusToast sideBets={bet({ status: "PENDING" })} heroUserId={HERO} />);
    rerender(<SideBetStatusToast sideBets={bet({ status: "DECLINED" })} heroUserId={HERO} />);
    expect(screen.getByTestId("toast").textContent).toMatch(/declined/);
    unmount();

    // Simulate a reconnect: a fresh component instance observes the same already-DECLINED bet.
    render(<SideBetStatusToast sideBets={bet({ status: "DECLINED" })} heroUserId={HERO} />);
    expect(screen.queryByTestId("toast")).toBeNull();
  });

  it("only shows the cancelled toast to the recipient, not the initiator who cancelled it", () => {
    const cancelled = bet({ status: "CANCELLED" });
    const { unmount } = render(<SideBetStatusToast sideBets={cancelled} heroUserId={HERO} />);
    // HERO is the initiator here; first-mount baseline means no toast regardless, so this
    // alone doesn't prove the role gate — assert via a genuine transition below instead.
    unmount();

    const pending = bet({ status: "PENDING" });
    const { rerender: rerenderAsInitiator } = render(<SideBetStatusToast sideBets={pending} heroUserId={HERO} />);
    rerenderAsInitiator(<SideBetStatusToast sideBets={cancelled} heroUserId={HERO} />);
    expect(screen.queryByTestId("toast")).toBeNull();

    const { rerender: rerenderAsRecipient } = render(<SideBetStatusToast sideBets={pending} heroUserId={OTHER} />);
    rerenderAsRecipient(<SideBetStatusToast sideBets={cancelled} heroUserId={OTHER} />);
    expect(screen.getByTestId("toast").textContent).toMatch(/Hero cancelled the side bet offer/);
  });
});
