import { useCallback, useEffect, useMemo, useState } from "react";
import type { UseChatOverlayParams } from "./types";

export function useChatOverlay({
  scopeKey,
  messages,
  onSend,
  onLoadOlder,
  hasMore = false,
  loadingOlder = false,
}: UseChatOverlayParams) {
  const [visible, setVisible] = useState(false);
  const [lastSeenCountByScope, setLastSeenCountByScope] = useState<Record<string, number>>({});

  const currentLength = messages.length;

  useEffect(() => {
    if (visible) {
      setLastSeenCountByScope((prev) => ({ ...prev, [scopeKey]: currentLength }));
      return;
    }
    setLastSeenCountByScope((prev) => {
      if (prev[scopeKey] !== undefined) return prev;
      return { ...prev, [scopeKey]: currentLength };
    });
  }, [visible, scopeKey, currentLength]);

  const lastSeenForScope = lastSeenCountByScope[scopeKey] ?? 0;
  const unseenCount = lastSeenForScope < currentLength ? currentLength - lastSeenForScope : 0;

  const onClose = useCallback(() => setVisible(false), []);

  return useMemo(
    () => ({
      visible,
      setVisible,
      messages,
      unseenCount,
      onClose,
      onSend,
      onLoadOlder,
      hasMore,
      loadingOlder,
    }),
    [visible, messages, unseenCount, onClose, onSend, onLoadOlder, hasMore, loadingOlder],
  );
}

