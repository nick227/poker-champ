import React, { createContext, useContext, useState, type Dispatch, type SetStateAction } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { LessonEvaluation } from "@/lib/lessons/lessonEvaluator";
import { buildLessonSnapshot } from "@/lib/lessons/lessonSnapshots";

interface LessonRuntimeState {
  snapshot: TableSnapshotPayload;
  setSnapshot: Dispatch<SetStateAction<TableSnapshotPayload>>;
  evaluation: LessonEvaluation | null;
  setEvaluation: (evaluation: LessonEvaluation | null) => void;
}

const LessonRuntimeContext = createContext<LessonRuntimeState | null>(null);

/**
 * Provider for lesson runtime state that keeps snapshot and evaluation coherent.
 * 
 * This prevents the race condition where:
 * - Provider updates snapshot
 * - Evaluation hook still points at old lesson
 */
export function LessonRuntimeProvider({ 
  children, 
  lessonId 
}: { 
  children: React.ReactNode; 
  lessonId: string;
}) {
  const [snapshot, setSnapshot] = useState<TableSnapshotPayload>(() => 
    buildLessonSnapshot(lessonId)
  );
  const [evaluation, setEvaluation] = useState<LessonEvaluation | null>(null);

  const value: LessonRuntimeState = {
    snapshot,
    setSnapshot,
    evaluation,
    setEvaluation,
  };

  return (
    <LessonRuntimeContext.Provider value={value}>
      {children}
    </LessonRuntimeContext.Provider>
  );
}

/**
 * Hook to access coherent lesson runtime state.
 * 
 * Both provider and evaluation hook use this to stay in sync.
 */
export function useLessonRuntime(): LessonRuntimeState {
  const context = useContext(LessonRuntimeContext);
  if (!context) {
    throw new Error("useLessonRuntime must be used within LessonRuntimeProvider");
  }
  return context;
}
