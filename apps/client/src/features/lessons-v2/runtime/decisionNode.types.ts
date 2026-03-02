import type { LessonStep, LessonStepType } from "@/features/lessons/lesson.types";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

export type DecisionNodeStepConfig = {
  stepType: LessonStepType;
  scenarioProviderKey: string;
  evaluatorKey: string;
  revealLayerKeys: string[];
  continuationKey?: string | null;
  runtimeConfig?: Record<string, unknown> | null;
  displayCategory?: string | null;
};

export type DecisionScenario = {
  snapshot?: TableSnapshotPayload | null;
  mcqOptions?: LessonStep["options"];
  heroCards?: string[];
  metadata?: Record<string, unknown>;
};

export type DecisionSubmission = {
  answer: unknown;
};

export type EvaluationGradeType = "binary" | "frequency" | "numeric";

export type EvaluationResult = {
  gradeType: EvaluationGradeType;
  isCorrect?: boolean;
  expectedAction?: string;
  evDelta?: number;
  explanation: string;
  gradingVersion: number;
  metadata?: Record<string, unknown>;
};

export type RevealLayerResult = {
  key: string;
  title?: string;
  payload: Record<string, unknown>;
};

export type ContinuationPayload = {
  nextSnapshot?: TableSnapshotPayload | null;
  timelinePointer?: number;
  animationHints?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type DecisionNodeRuntimeContext = {
  lessonId?: string;
  attemptId?: string;
  stepId: string;
  step: LessonStep;
};

export type DecisionRuntimeState =
  | "BEFORE"
  | "QUESTION"
  | "SUBMITTING"
  | "EVALUATED"
  | "REVEALING"
  | "CONTINUATION"
  | "ADVANCING"
  | "COMPLETE"
  | "ERROR";

export type DecisionNodeRuntimeEvent =
  | {
      name: "step_started";
      context: DecisionNodeRuntimeContext;
      scenarioProviderKey: string;
    }
  | {
      name: "step_submitted";
      context: DecisionNodeRuntimeContext;
      evaluatorKey: string;
    }
  | {
      name: "reveal_shown";
      context: DecisionNodeRuntimeContext;
      layerKey: string;
      index: number;
      total: number;
    }
  | {
      name: "continuation_started";
      context: DecisionNodeRuntimeContext;
      continuationKey: string;
    };
