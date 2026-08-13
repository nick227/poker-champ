import { EmptyState } from "./EmptyState";
import { LobbyTableList, type LobbySortDir } from "./LobbyTableList";
import type { LobbySortKey } from "../../lobbyTableSort";
import type { LobbyTableRow } from "@/lib/lobbyTables";

type Props = {
  busy: boolean;
  error: string | null;
  tables: LobbyTableRow[];
  pinnedTables?: LobbyTableRow[];
  sortKey: LobbySortKey;
  sortDir: LobbySortDir;
  onSort: (key: LobbySortKey) => void;
  isJoining: (tableId: string) => boolean;
  onJoin: (table: LobbyTableRow) => void;
  onResume?: (table: LobbyTableRow) => void;
  onRetry: () => void;
  onCreate: () => void;
  scrollable?: boolean;
  compact?: boolean;
  embedded?: boolean;
};

export function LobbyCashListStage({
  busy,
  error,
  tables,
  pinnedTables = [],
  sortKey,
  sortDir,
  onSort,
  isJoining,
  onJoin,
  onResume,
  onRetry,
  onCreate,
  scrollable = true,
  compact = false,
  embedded = false,
}: Props) {
  if (busy && pinnedTables.length === 0) {
    return <EmptyState message="Loading tables…" embedded={embedded} />;
  }

  if (error && pinnedTables.length === 0) {
    return (
      <EmptyState
        message={error}
        tone="danger"
        detail="Couldn’t reach the lobby. Retry, or create a table once you’re connected."
        primary={{ title: "Retry", onPress: onRetry, intent: "secondary" }}
        secondary={{ title: "New cash table", onPress: onCreate }}
        embedded={embedded}
      />
    );
  }

  if (tables.length === 0 && pinnedTables.length === 0) {
    return (
      <EmptyState
        message="No open cash tables right now."
        detail="Create a cash table to get a game going."
        primary={{ title: "New cash table", onPress: onCreate, intent: "accent" }}
        embedded={embedded}
      />
    );
  }

  return (
    <LobbyTableList
      tables={tables}
      pinnedTables={pinnedTables}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      isJoining={isJoining}
      onJoin={onJoin}
      onResume={onResume}
      scrollable={scrollable}
      compact={compact}
      embedded={embedded}
    />
  );
}
