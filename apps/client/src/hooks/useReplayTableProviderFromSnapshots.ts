import { useEffect, useRef, useState } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { ReplayController, ReplayTableProvider } from "@/types/replayController";
import { assertTableProvider } from "@/types/tableProvider";
import { buildTableSceneModel } from "@/components/domain/table/hooks/useTableSceneModel";
import { buildReplayDisabledSceneModel } from "@/components/replay/replaySceneModel";

export interface ReplayFromSnapshotsResult {
  provider: ReplayTableProvider | null;
  loading: false;
  error: string | null;
}

export function useReplayTableProviderFromSnapshots(
  snapshots: readonly TableSnapshotPayload[],
): ReplayFromSnapshotsResult {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const totalSteps = snapshots.length;

  useEffect(() => {
    if (!isPlaying || currentStep >= totalSteps - 1) return;
    const delay = 1000 / speed;
    autoPlayTimerRef.current = setTimeout(() => {
      setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
    }, delay);
    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
  }, [isPlaying, currentStep, speed, totalSteps]);

  useEffect(() => {
    if (isPlaying && currentStep >= totalSteps - 1) {
      setIsPlaying(false);
    }
  }, [isPlaying, currentStep, totalSteps]);

  useEffect(() => {
    if (totalSteps > 0 && currentStep >= totalSteps) {
      setCurrentStep(totalSteps - 1);
    }
  }, [totalSteps, currentStep]);

  if (totalSteps === 0) {
    return { provider: null, loading: false, error: "No replay data." };
  }

  const safeStep = Math.min(currentStep, totalSteps - 1);
  const currentSnapshot = snapshots[safeStep];
  const sceneModel = buildReplayDisabledSceneModel(
    buildTableSceneModel(currentSnapshot, null, "CONNECTED"),
  );

  const tableProvider = assertTableProvider({
    snapshot: currentSnapshot,
    sceneModel,
    onAction: () => {
      console.warn("[REPLAY] Actions are disabled in replay mode");
    },
  });

  const replayController: ReplayController = {
    currentStep: safeStep,
    totalSteps,
    next: () => {
      if (safeStep < totalSteps - 1) setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
    },
    prev: () => {
      if (safeStep > 0) setCurrentStep((prev) => Math.max(prev - 1, 0));
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
