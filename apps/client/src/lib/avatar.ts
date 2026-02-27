import { getApiBaseUrl } from "@poker-champ/sdk";
import { DEFAULT_API_URL } from "@/constants";

/**
 * Resolves relative avatar path (e.g. /avatars/userId/1.jpg) to absolute URI for Image source.
 * Returns undefined for empty/null/undefined; leaves absolute URLs unchanged.
 */
export function getAvatarImageUri(avatarUrl: string | undefined | null): string | undefined {
  if (avatarUrl == null || avatarUrl === "") return undefined;
  if (avatarUrl.startsWith("http")) return avatarUrl;
  const base = getApiBaseUrl() || DEFAULT_API_URL;
  return `${base.replace(/\/$/, "")}${avatarUrl.startsWith("/") ? avatarUrl : `/${avatarUrl}`}`;
}
