import { describe, expect, it } from "vitest";
import {
  cashLobbyCtaLabel,
  cashLobbyStatusLabel,
  occupancyDotCount,
  occupancyFilledCount,
  resolveCashLobbyCta,
  resolveCashLobbyStatus,
} from "./cashLobbyRow";

describe("resolveCashLobbyStatus", () => {
  it("marks pinned rows as joined", () => {
    expect(resolveCashLobbyStatus({ players: 9, seats: 9, waitlistCount: 2 }, true)).toBe(
      "joined",
    );
  });

  it("prefers waitlist over full", () => {
    expect(resolveCashLobbyStatus({ players: 9, seats: 9, waitlistCount: 1 }, false)).toBe(
      "waitlist",
    );
  });

  it("marks full tables without a waitlist", () => {
    expect(resolveCashLobbyStatus({ players: 6, seats: 6 }, false)).toBe("full");
  });

  it("marks open tables", () => {
    expect(resolveCashLobbyStatus({ players: 3, seats: 9 }, false)).toBe("open");
  });
});

describe("cash lobby CTA mapping", () => {
  it("joins open tables and resumes joined ones", () => {
    expect(resolveCashLobbyCta("open")).toBe("join");
    expect(resolveCashLobbyCta("joined")).toBe("resume");
    expect(resolveCashLobbyCta("full")).toBe("view");
    expect(resolveCashLobbyCta("waitlist")).toBe("view");
  });

  it("uses short labels when compact", () => {
    expect(cashLobbyCtaLabel("join", false)).toBe("Join Table");
    expect(cashLobbyCtaLabel("join", true)).toBe("Join");
    expect(cashLobbyCtaLabel("view", false)).toBe("Watch");
    expect(cashLobbyCtaLabel("view", true)).toBe("Watch");
  });

  it("formats waitlist copy", () => {
    expect(cashLobbyStatusLabel("waitlist", 1)).toBe("1 on Waitlist");
    expect(cashLobbyStatusLabel("waitlist", 3)).toBe("3 on Waitlist");
  });
});

describe("occupancy dots", () => {
  it("caps dots at nine", () => {
    expect(occupancyDotCount(18)).toBe(9);
    expect(occupancyDotCount(6)).toBe(6);
  });

  it("scales filled dots to seat count", () => {
    expect(occupancyFilledCount(3, 6)).toBe(3);
    expect(occupancyFilledCount(9, 18)).toBe(5);
  });
});
