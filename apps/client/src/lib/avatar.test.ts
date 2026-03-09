import { describe, it, expect } from "vitest";
import { getAvatarImageUri } from "@/lib/avatar";
import { getAvatarUrlFromMeResponse } from "@/lib/meResponse";

describe("getAvatarImageUri", () => {
  it("returns undefined for null, undefined, empty string", () => {
    expect(getAvatarImageUri(null)).toBeUndefined();
    expect(getAvatarImageUri(undefined)).toBeUndefined();
    expect(getAvatarImageUri("")).toBeUndefined();
  });

  it("returns absolute URI for relative path (e.g. /avatars/userId/1.png)", () => {
    const uri = getAvatarImageUri("/avatars/usr-1/4.png");
    expect(uri).toBeDefined();
    expect(uri).toMatch(/^https?:\/\//);
    expect(uri).toContain("/avatars/usr-1/4.png");
  });

  it("leaves absolute URL unchanged", () => {
    const url = "https://example.com/avatars/1.png";
    expect(getAvatarImageUri(url)).toBe(url);
  });
});

describe("getAvatarUrlFromMeResponse", () => {
  it("returns avatarUrl string when present", () => {
    expect(getAvatarUrlFromMeResponse({ user: { avatarUrl: "/avatars/u1/1.png" } })).toBe("/avatars/u1/1.png");
  });

  it("returns null when user.avatarUrl is null", () => {
    expect(getAvatarUrlFromMeResponse({ user: { avatarUrl: null } })).toBe(null);
  });

  it("returns undefined when user or avatarUrl missing", () => {
    expect(getAvatarUrlFromMeResponse({})).toBeUndefined();
    expect(getAvatarUrlFromMeResponse({ user: {} })).toBeUndefined();
    expect(getAvatarUrlFromMeResponse(null)).toBeUndefined();
    expect(getAvatarUrlFromMeResponse(undefined)).toBeUndefined();
  });
});
