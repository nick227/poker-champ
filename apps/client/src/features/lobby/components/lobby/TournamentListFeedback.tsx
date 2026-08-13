import { Loader } from "@/components/base/Loader";
import { Text } from "@/components/base/Text";
import { View } from "react-native";
import { EmptyState } from "./EmptyState";
import { GameTablePanelSkeleton } from "./GameTablePanelSkeleton";

type TournamentListFeedbackProps = {
  busy: boolean;
  error: string | null;
  isEmpty: boolean;
  emptyMessage: string;
  onRetry?: () => void;
  onCreate?: () => void;
  skeletonCount?: number;
  embedded?: boolean;
};

export function TournamentListFeedback({
  busy,
  error,
  isEmpty,
  emptyMessage,
  onRetry,
  onCreate,
  skeletonCount = 2,
  embedded = false,
}: TournamentListFeedbackProps) {
  if (busy && isEmpty) {
    return (
      <View className="ui-stack-3">
        {Array.from({ length: skeletonCount }).map((_, idx) => (
          <GameTablePanelSkeleton key={`tourney-skel-${idx}`} />
        ))}
      </View>
    );
  }

  if (error) {
    return (
      <EmptyState
        message={error}
        tone="danger"
        detail="Couldn’t load tournaments. Retry when you’re back online."
        primary={onRetry ? { title: "Retry", onPress: onRetry, intent: "secondary" } : undefined}
        secondary={onCreate ? { title: "Create tournament", onPress: onCreate } : undefined}
        embedded={embedded}
      />
    );
  }

  if (!busy && isEmpty) {
    return (
      <EmptyState
        message={emptyMessage}
        primary={onCreate ? { title: "Create tournament", onPress: onCreate, intent: "accent" } : undefined}
        embedded={embedded}
      />
    );
  }

  if (busy) {
    return (
      <View className="ui-row items-center gap-2 py-1">
        <Loader />
        <Text variant="muted">Updating tournaments…</Text>
      </View>
    );
  }

  return null;
}
