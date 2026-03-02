import { useCallback, useEffect, useState } from "react";
import { historyService } from "@/services/history.service";
import { useAuthStore } from "@/stores/auth.store";

const LATEST_REPLAY_LOOKUP_LIMIT = 25;
const DETAIL_PROBE_LIMIT = 25;

export type UseLatestReplayHandResult = {
  latestHandId: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useLatestReplayHand(): UseLatestReplayHandResult {
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  const [latestHandId, setLatestHandId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setLatestHandId(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await historyService.getHands({
        token,
        limit: LATEST_REPLAY_LOOKUP_LIMIT,
      });

      const serverFlagged = response.hands.find((hand) => hand.hasReplay === true) ?? null;
      if (serverFlagged) {
        setLatestHandId(serverFlagged.id);
        return;
      }

      // Prefer server-flagged replayable hands first, then probe unknowns.
      const prioritized = [
        ...response.hands.filter((hand) => hand.hasReplay !== true),
      ];

      const uniqueCandidates = prioritized.filter(
        (hand, index, arr) => arr.findIndex((x) => x.id === hand.id) === index,
      );

      let resolvedHandId: string | null = null;
      for (const candidate of uniqueCandidates.slice(0, DETAIL_PROBE_LIMIT)) {
        try {
          const detail = await historyService.getHandDetail({
            token,
            handId: candidate.id,
          });
          if ((detail.snapshots?.length ?? 0) > 0) {
            resolvedHandId = candidate.id;
            break;
          }
        } catch {
          // Ignore single-candidate detail failures; continue probing.
        }
      }

      setLatestHandId(resolvedHandId);
      if (!resolvedHandId && response.hands.length > 0) {
        setError("No replay snapshots found for recent hands yet.");
      }
    } catch (err) {
      setLatestHandId(null);
      setError(err instanceof Error ? err.message : "Failed to load latest replay hand");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!hydrated) return;
    void refresh();
  }, [hydrated, refresh]);

  return { latestHandId, loading, error, refresh };
}
