import { describe, expect, it } from "vitest";
import { resolvePrimaryNavActive, shouldShowPrimaryNav } from "./primaryNav";

describe("shouldShowPrimaryNav", () => {
  it("hides chrome on login and admin", () => {
    expect(shouldShowPrimaryNav("/login")).toBe(false);
    expect(shouldShowPrimaryNav("/admin")).toBe(false);
    expect(shouldShowPrimaryNav("/")).toBe(false);
  });

  it("shows chrome on main app routes", () => {
    expect(shouldShowPrimaryNav("/lobby")).toBe(true);
    expect(shouldShowPrimaryNav("/table/abc")).toBe(true);
  });
});

describe("resolvePrimaryNavActive", () => {
  it("maps lesson routes to lessons", () => {
    expect(resolvePrimaryNavActive("/lessons")).toBe("lessons");
    expect(resolvePrimaryNavActive("/lesson/L01")).toBe("lessons");
  });

  it("maps lobby-adjacent routes to lobby", () => {
    expect(resolvePrimaryNavActive("/lobby")).toBe("lobby");
    expect(resolvePrimaryNavActive("/lobby/cash")).toBe("lobby");
    expect(resolvePrimaryNavActive("/lobby/tournaments")).toBe("lobby");
    expect(resolvePrimaryNavActive("/tournaments/1")).toBe("lobby");
    expect(resolvePrimaryNavActive("/blog")).toBe("lobby");
  });

  it("maps slots to its own primary tab", () => {
    expect(resolvePrimaryNavActive("/slots")).toBe("slots");
  });

  it("leaves table with no primary tab", () => {
    expect(resolvePrimaryNavActive("/table/xyz")).toBeNull();
  });
});
