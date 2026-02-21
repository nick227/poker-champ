import { useCallback, useEffect, useMemo, useState } from "react";

export type ChatMessageForOverlay = {
  id: string;
  sender: string;
  text: string;
  isSelf: boolean;
};

export function useChatOverlay(
  tableId: string,
  messages: ChatMessageForOverlay[],
  options: { onSend: (text: string) => void }
) {
  const [visible, setVisible] = useState(false);
  const [lastSeenCountByTableId, setLastSeenCountByTableId] = useState<Record<string, number>>({});

  const currentLength = messages.length;

  useEffect(() => {
    if (visible) {
      setLastSeenCountByTableId((prev) => ({ ...prev, [tableId]: currentLength }));
    } else {
      setLastSeenCountByTableId((prev) => {
        if (prev[tableId] !== undefined) return prev;
        return { ...prev, [tableId]: currentLength };
      });
    }
  }, [visible, tableId, currentLength]);

  const lastSeenForTable = lastSeenCountByTableId[tableId] ?? 0;
  const unseenCount =
    lastSeenForTable < currentLength ? currentLength - lastSeenForTable : 0;

  const onClose = useCallback(() => setVisible(false), []);

  return useMemo(
    () => ({
      visible,
      setVisible,
      messages,
      unseenCount,
      onClose,
      onSend: options.onSend,
    }),
    [visible, messages, unseenCount, onClose, options.onSend]
  );
}
