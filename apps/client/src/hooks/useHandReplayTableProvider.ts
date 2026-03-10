/**
 * 🎯 HAND REPLAY: Lean TableProvider Hook
 * 
 * Returns a TableProvider with replay controls attached
 * No parallel abstractions - just another provider
 */

import { useEffect, useRef, useState } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { historyService } from "@/services/history.service";
import { storeRegistry } from "@/registry/store.registry";
import type { ReplayController, ReplayTableProvider } from "@/types/replayController";
import { buildTableSceneModel } from "@/features/table/model";
import { buildReplayDisabledSceneModel } from "@/components/replay/replaySceneModel";

export interface HandReplayResult {
  provider: ReplayTableProvider | null;
  loading: boolean;
  error: string | null;
}

/**
 * 🎯 HAND REPLAY TABLE PROVIDER HOOK
 *
 * @param handId - Hand to replay
 * @returns Result with provider (when snapshots exist), loading, and error (e.g. no snapshots)
 */
export function useHandReplayTableProvider(handId: string): HandReplayResult {
  const [snapshots, setSnapshots] = useState<TableSnapshotPayload[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const hasValidHandId = Boolean(handId?.trim());

  // 🎯 LOAD SNAPSHOTS
  useEffect(() => {
    if (!hasValidHandId) {
      setLoading(false);
      setError("No hand ID.");
      return;
    }
    let cancelled = false;

    const loadSnapshots = async () => {
      try {
        setLoading(true);
        setError(null);

        const profile = storeRegistry.auth();
        if (!profile.token) {
          throw new Error("Authentication required");
        }

        const handDetail = await historyService.getHandDetail({
          token: profile.token,
          handId,
        });

        if (!handDetail.snapshots || handDetail.snapshots.length === 0) {
          setError("No replay data for this hand.");
          return;
        }

        if (!cancelled) {
          setSnapshots(handDetail.snapshots);
          setCurrentStep(0);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load replay");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadSnapshots();

    return () => {
      cancelled = true;
    };
  }, [handId, hasValidHandId]);

  // 🎯 AUTO-PLAY LOGIC
  useEffect(() => {
    if (isPlaying && currentStep < snapshots.length - 1) {
      const delay = 1000 / speed;
      
      autoPlayTimerRef.current = setTimeout(() => {
        setCurrentStep(prev => Math.min(prev + 1, snapshots.length - 1));
      }, delay);
    } else if (isPlaying && currentStep >= snapshots.length - 1) {
      setIsPlaying(false);
    }

    return () => {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
      }
    };
  }, [isPlaying, currentStep, speed, snapshots.length]);

  // 🎯 LOADING/ERROR/EMPTY: return result with no provider (no throw)
  if (!hasValidHandId) {
    return { provider: null, loading: false, error: "No hand ID." };
  }
  if (loading) {
    return { provider: null, loading: true, error: null };
  }
  if (error || snapshots.length === 0) {
    return { provider: null, loading: false, error: error ?? "No replay data for this hand." };
  }

  // 🎯 TABLE PROVIDER (pure contract) - only reached when we have at least one snapshot
  const currentSnapshot = snapshots[currentStep];
  const totalSteps = snapshots.length;
  const sceneModel = buildReplayDisabledSceneModel(
    buildTableSceneModel(currentSnapshot, null, "CONNECTED"),
  );
  const tableProvider = {
    snapshot: currentSnapshot,
    sceneModel,
    onAction: () => {
      console.warn("[REPLAY] Actions are disabled in replay mode");
    },
  };

  const replayController: ReplayController = {
    currentStep,
    totalSteps,
    next: () => {
      if (currentStep < totalSteps - 1) setCurrentStep((prev) => prev + 1);
    },
    prev: () => {
      if (currentStep > 0) setCurrentStep((prev) => prev - 1);
    },
    goTo: (step: number) => {
      if (step >= 0 && step < totalSteps) setCurrentStep(step);
    },
    play: () => setIsPlaying(true),
    pause: () => setIsPlaying(false),
    setSpeed: (newSpeed: number) => {
      setSpeed(Math.min(Math.max(newSpeed, 0.1), 3.0));
    },
    isPlaying,
    speed,
  };

  return {
    provider: { ...tableProvider, replay: replayController },
    loading: false,
    error: null,
  };
}


