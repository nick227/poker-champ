import { getAvatarUrlFromMeResponse } from "./meResponse";

export type Profile = {
  username?: string;
  email?: string;
  location?: string;
  userId?: string;
  avatarUrl?: string | null;
};

export function parseProfileFromMe(d: unknown): Profile {
  const u = (d as { user?: { id?: string; username?: string; displayName?: string; email?: string } })?.user;
  return {
    userId:
      typeof u?.id === "string" && u.id.length > 0
        ? u.id
        : typeof u?.id === "number"
          ? String(u.id)
          : undefined,
    username:
      (typeof u?.displayName === "string" ? u.displayName : null) ??
      (typeof u?.username === "string" ? u.username : null) ??
      (typeof u?.email === "string" ? u.email : null) ??
      "Player",
    email: typeof u?.email === "string" ? u.email : undefined,
    location: undefined,
    avatarUrl: getAvatarUrlFromMeResponse(d),
  };
}
