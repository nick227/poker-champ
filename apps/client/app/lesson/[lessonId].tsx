import { View } from "react-native";
import { useMemo } from "react";
import { Screen } from "@/components/containers/Screen";
import { ActiveTableView } from "@/components/domain/table/views/ActiveTableView";
import { LessonPanel } from "@/components/lesson/LessonPanel";
import { useGameTableProvider } from "@/hooks/useGameTableProvider";
import { useLessonTableProvider, useLessonEvaluation } from "@/hooks/useLessonTableProvider";
import { useLocalSearchParams } from "expo-router";
import { useBankroll } from "@/hooks/useBankroll";
import { mapSeatsToOpponents } from "@/components/domain/table/table.adapter";
import type { TableProvider } from "@/types/tableProvider";
import { LessonRuntimeProvider } from "@/contexts/LessonRuntimeContext";

/**
 * Lesson screen that uses route-based provider selection.
 * 
 * Route: /lesson/[lessonId]
 * Provider: useLessonTableProvider
 * Architecture: Same ActiveTableView, different data source
 */
export default function LessonScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const { cents: balanceCents } = useBankroll();

  // Wrap with runtime context to keep state coherent
  return (
    <LessonRuntimeProvider lessonId={lessonId || "preflop-raise-decision"}>
      <LessonScreenContent balanceCents={balanceCents} />
    </LessonRuntimeProvider>
  );
}

function LessonScreenContent({ balanceCents }: { balanceCents: number }) {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  
  // Route-based provider selection
  const provider = useLessonTableProvider({ 
    lessonId: lessonId || "preflop-raise-decision" // lessonId comes from context
  });

  // Access evaluation separately from provider's internal state
  const { snapshot, onAction } = provider;
  const evaluation = useLessonEvaluation();

  // Create opponents from lesson snapshot (same logic as game mode)
  const opponents = useMemo(() => 
    snapshot ? mapSeatsToOpponents(snapshot) : [], 
    [snapshot]
  );

  const handleNextLesson = () => {
    // In future, this would navigate to next lesson in sequence
    console.log("[LESSON_NEXT]", { currentLesson: lessonId });
  };

  return (
    <Screen>
      <View className="flex-1 bg-panel h-full">
        {/* ActiveTableView renders lesson snapshot with all required props */}
        <ActiveTableView
          snapshot={snapshot} 
          onAction={onAction}
          opponents={opponents}
          balanceCents={balanceCents}
          tableStatus="LESSON"
          connectionStatus="CONNECTED"
        />

        {/* LessonPanel shows evaluation feedback */}
        {evaluation && (
          <LessonPanel 
            evaluation={evaluation} 
            onNextLesson={handleNextLesson}
          />
        )}
      </View>
    </Screen>
  );
}

