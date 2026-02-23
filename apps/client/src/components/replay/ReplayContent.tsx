import type { ReplayContentProps } from "./replay.types";
import { ReplayFromRemoteSource } from "./ReplayFromRemoteSource";
import { ReplayFromSnapshots } from "./ReplayFromSnapshots";

/**
 * Public replay API. Dispatches by source type; never fetches unless source says so.
 * No direct TableLayout; always goes through ReplayFrom* → ReplaySurface.
 */
export function ReplayContent({ source, compact, onClose }: ReplayContentProps) {
  if (source.type === "handId") {
    return (
      <ReplayFromRemoteSource
        handId={source.handId}
        compact={compact}
        onClose={onClose}
      />
    );
  }
  return (
    <ReplayFromSnapshots
      snapshots={source.snapshots}
      handId={source.handId}
      compact={compact}
      onClose={onClose}
    />
  );
}
