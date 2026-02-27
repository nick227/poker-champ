/**
 * Parse avatarUrl from GET /api/auth/me response shape.
 * Used so table hero avatar can use the same contract as useProfile.
 */
export function getAvatarUrlFromMeResponse(
  data: unknown
): string | null | undefined {
  const d = data as { user?: { avatarUrl?: string | null } } | null | undefined;
  const u = d?.user;
  if (typeof u?.avatarUrl === "string") return u.avatarUrl;
  if (u?.avatarUrl === null) return null;
  return undefined;
}
