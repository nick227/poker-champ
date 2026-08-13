export const LOBBY_HOME_PREVIEW_COUNT = 5;

export function sliceLobbyPreview<T>(
  pinned: T[],
  rest: T[],
  limit = LOBBY_HOME_PREVIEW_COUNT,
): { pinned: T[]; rest: T[]; total: number; hasMore: boolean } {
  const total = pinned.length + rest.length;
  const pinnedOut = pinned.slice(0, limit);
  const restOut = rest.slice(0, Math.max(0, limit - pinnedOut.length));
  return { pinned: pinnedOut, rest: restOut, total, hasMore: total > limit };
}
