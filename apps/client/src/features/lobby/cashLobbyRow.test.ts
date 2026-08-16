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
  it("does not let a local pin manufacture joined state", () => {
    expect(resolveCashLobbyStatus({ players: 9, seats: 9, connectedHumanCount: 2 }, true)).toBe("full");
  });

  it("uses server viewer membership for resume and reconnect", () => {
    expect(resolveCashLobbyStatus({
      players: 2,
      seats: 6,
      connectedHumanCount: 1,
      status: "LIVE",
      viewer: { status: "SEATED", canResume: true },
    }, false)).toBe("joined");
    expect(resolveCashLobbyStatus({
      players: 2,
      seats: 6,
      connectedHumanCount: 0,
      status: "LIVE",
      viewer: { status: "RECONNECTABLE", canResume: true },
    }, false)).toBe("reconnectable");
  });

  it("marks full tables before live", () => {
    expect(resolveCashLobbyStatus({ players: 6, seats: 6, connectedHumanCount: 2 }, false)).toBe(
      "full",
    );
  });

  it("marks live tables with a connected human and an open seat", () => {
    expect(resolveCashLobbyStatus({ players: 3, seats: 9, connectedHumanCount: 1 }, false)).toBe(
      "live",
    );
  });

  it("marks open tables with no connected humans", () => {
    expect(resolveCashLobbyStatus({ players: 3, seats: 9, connectedHumanCount: 0 }, false)).toBe(
      "open",
    );
  });
});

describe("cash lobby CTA mapping", () => {
  it("joins open and live tables, watches full, resumes joined", () => {
    expect(resolveCashLobbyCta("open")).toBe("join");
    expect(resolveCashLobbyCta("live")).toBe("join");
    expect(resolveCashLobbyCta("joined")).toBe("resume");
    expect(resolveCashLobbyCta("reconnectable")).toBe("resume");
    expect(resolveCashLobbyCta("full")).toBe("view");
  });

  it("uses short labels when compact", () => {
    expect(cashLobbyCtaLabel("join", false)).toBe("Join Table");
    expect(cashLobbyCtaLabel("join", true)).toBe("Join");
    expect(cashLobbyCtaLabel("view", false)).toBe("Watch");
    expect(cashLobbyCtaLabel("view", true)).toBe("Watch");
  });

  it("labels real statuses only", () => {
    expect(cashLobbyStatusLabel("joined")).toBe("Seated");
    expect(cashLobbyStatusLabel("reconnectable")).toBe("Reconnect");
    expect(cashLobbyStatusLabel("live")).toBe("Live");
    expect(cashLobbyStatusLabel("open")).toBe("Open");
    expect(cashLobbyStatusLabel("full")).toBe("Full");
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
