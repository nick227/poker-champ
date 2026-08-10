import { EmptyState } from "./EmptyState";
import { LobbyTableList, type LobbySortDir } from "./LobbyTableList";
import type { LobbySortKey } from "../../lobbyTableSort";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import {
  hasActiveLobbyFilters,
  type LobbyTableFilters,
} from "../../lobbyTableFilters";

type Props = {
  busy: boolean;
  error: string | null;
  tables: LobbyTableRow[];
  balanceCents: number;
  filters: LobbyTableFilters;
  sortKey: LobbySortKey;
  sortDir: LobbySortDir;
  onSort: (key: LobbySortKey) => void;
  isJoining: (tableId: string) => boolean;
  onJoin: (table: LobbyTableRow) => void;
  onRetry: () => void;
  onCreate: () => void;
  onClearFilters: () => void;
  scrollable?: boolean;
  compact?: boolean;
};

/** Cash list stage: felt empty/error CTAs or live table browser. */
export function LobbyCashListStage({
  busy,
  error,
  tables,
  balanceCents,
  filters,
  sortKey,
  sortDir,
  onSort,
  isJoining,
  onJoin,
  onRetry,
  onCreate,
  onClearFilters,
  scrollable = true,
  compact = false,
}: Props) {
  if (busy) {
    return <EmptyState message="Loading tables…" />;
  }

  if (error) {
    return (
      <EmptyState
        message={error}
        tone="danger"
        detail="Couldn’t reach the lobby. Retry, or create a table once you’re connected."
        primary={{ title: "Retry", onPress: onRetry, intent: "secondary" }}
        secondary={{ title: "New cash table", onPress: onCreate }}
      />
    );
  }

  if (tables.length === 0) {
    const filtered = hasActiveLobbyFilters(filters);
    return (
      <EmptyState
        message={filtered ? "No games match your filters." : "No open cash tables right now."}
        detail={
          filtered
            ? "Clear filters to see the full list, or create your own table."
            : "Create a cash table or start an instant game above."
        }
        primary={
          filtered
            ? { title: "Clear filters", onPress: onClearFilters, intent: "secondary" }
            : { title: "New cash table", onPress: onCreate, intent: "accent" }
        }
        secondary={
          filtered ? { title: "New cash table", onPress: onCreate } : undefined
        }
      />
    );
  }

  return (
    <LobbyTableList
      tables={tables}
      balanceCents={balanceCents}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      isJoining={isJoining}
      onJoin={onJoin}
      scrollable={scrollable}
      compact={compact}
    />
  );
}
