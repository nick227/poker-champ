import { describe, expect, it } from "vitest";
import { getProtectedRouteRedirect, getSettingsTargetPath } from "@/lib/authNavigation";
import { loginPathWithNext } from "@/lib/nav";

describe("authNavigation", () => {
  it("builds login redirect for deep links to protected pages when guest is hydrated", () => {
    expect(
      getProtectedRouteRedirect(
        { hydrated: true, token: null },
        "/table/abc123?buyInCents=2000",
      ),
    ).toBe(loginPathWithNext("/table/abc123?buyInCents=2000"));
  });

  it("does not redirect before auth hydration completes", () => {
    expect(
      getProtectedRouteRedirect({ hydrated: false, token: null }, "/settings"),
    ).toBeNull();
  });

  it("returns settings path immediately once guest becomes authenticated", () => {
    expect(getSettingsTargetPath({ hydrated: true, token: null })).toBe(
      loginPathWithNext("/settings"),
    );
    expect(getSettingsTargetPath({ hydrated: true, token: "token-1" })).toBe("/settings");
  });
});
