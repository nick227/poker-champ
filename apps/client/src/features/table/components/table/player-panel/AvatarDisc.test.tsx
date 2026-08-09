/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AvatarDisc } from "./AvatarDisc";

describe("AvatarDisc", () => {
  it("mounts and renders initials when there is no avatarUrl", () => {
    render(<AvatarDisc seed="user-1" initial="N" size={70} testID="avatar-a" />);
    expect(screen.getByText("N")).toBeTruthy();
  });

  it("marks the turn state via data-active-turn for to-act vs not-to-act", () => {
    const { rerender, container } = render(
      <AvatarDisc seed="user-1" initial="N" size={70} isActiveTurn={false} testID="avatar-b" />,
    );
    expect(container.querySelector('[data-active-turn="false"]')).toBeTruthy();
    expect(container.querySelector('[data-active-turn="true"]')).toBeNull();

    rerender(<AvatarDisc seed="user-1" initial="N" size={70} isActiveTurn={true} testID="avatar-b" />);
    expect(container.querySelector('[data-active-turn="true"]')).toBeTruthy();
  });

  it("renders the badge slot only when a badgeLabel is provided", () => {
    const { container: withBadge } = render(
      <AvatarDisc seed="user-1" initial="N" size={70} badgeLabel={3} />,
    );
    expect(withBadge.textContent).toContain("3");

    const { container: withoutBadge } = render(
      <AvatarDisc seed="user-1" initial="N" size={70} />,
    );
    // Only the initial should be present as text content.
    expect(withoutBadge.textContent).toBe("N");
  });

  it("derives the same hue for the same seed (deterministic identity)", () => {
    const { container: first } = render(<AvatarDisc seed="stable-seed" initial="A" size={70} />);
    const { container: second } = render(<AvatarDisc seed="stable-seed" initial="A" size={70} />);
    const hueA = first.querySelector("[data-avatar-hue]")?.getAttribute("data-avatar-hue");
    const hueB = second.querySelector("[data-avatar-hue]")?.getAttribute("data-avatar-hue");
    expect(hueA).toBeTruthy();
    expect(hueA).toBe(hueB);
  });
});
