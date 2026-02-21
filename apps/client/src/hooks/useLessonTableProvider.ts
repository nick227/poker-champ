import { useCallback } from "react";
import type { ActionBarOnAction } from "@/components/domain/table/ActionBar";
import { assertTableProvider, type TableProvider } from "@/types/tableProvider";
import { evaluateLessonAnswer } from "@/lib/lessons/lessonEvaluator";
import { useLessonRuntime } from "@/contexts/LessonRuntimeContext";
import { buildTableSceneModel } from "@/components/domain/table/hooks/useTableSceneModel";

interface UseLessonTableProviderProps {
  lessonId: string;
}

/**
 * Lesson provider that handles lesson-specific logic while maintaining TableProvider contract.
 * 
 * This provider:
 * - Uses shared runtime context to stay coherent with evaluation hook
 * - Records student answers
 * - Runs evaluator
 * - Locks actions via hero.actionOptions = []
 */
export function useLessonTableProvider({ lessonId }: UseLessonTableProviderProps): TableProvider {
  // Use shared runtime context for coherent state
  const { snapshot, setSnapshot, evaluation, setEvaluation } = useLessonRuntime();

  // Handle actions from ActionBar
  const onAction = useCallback<ActionBarOnAction>(
    (payload) => {
      console.log("[LESSON_ACTION_RECEIVED]", { lessonId, payload });

      // 1) Record answer
      const answer = payload;

      // 2) Evaluate answer
      const result = evaluateLessonAnswer({
        lessonId,
        snapshot,
        answer,
      });

      // 3) Save evaluation
      setEvaluation(result);

      // 4) Lock actions by clearing actionOptions
      setSnapshot((prev) => {
        if (!prev.hero?.actionOptions) return prev;
        
        return {
          ...prev,
          hero: {
            ...prev.hero,
            actionOptions: {
              ...prev.hero.actionOptions,
              canFold: false,
              canCheck: false,
              canCall: false,
              canBet: false,
              canRaise: false,
              canAllIn: false,
            },
          },
        };
      });
    },
    [lessonId, snapshot, setSnapshot, setEvaluation]
  );

  return assertTableProvider({
    snapshot,
    sceneModel: buildTableSceneModel(snapshot, null, "CONNECTED"),
    onAction,
  });
}

/**
 * Hook to access lesson evaluation results from shared runtime context.
 * This maintains the frozen TableProvider contract while allowing UI to access evaluation.
 */
export function useLessonEvaluation() {
  const { evaluation } = useLessonRuntime();
  return evaluation;
}
