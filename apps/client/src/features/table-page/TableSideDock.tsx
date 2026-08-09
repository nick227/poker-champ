import { useCallback, useEffect } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { HandList } from "@/components/domain/history/HandList";
import { HandDetailModal } from "@/components/domain/history/HandDetailModal";
import { historyService } from "@/services/history.service";
import { storeRegistry } from "@/registry/store.registry";
import { useAuthStore } from "@/stores/auth.store";

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  currentUserId: string;
};

/** Desktop right dock: hand history (collapsible). */
export function TableSideDock({ collapsed, onToggle, currentUserId }: Props) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const historyStore = storeRegistry.use.history();

  const loadHands = useCallback(
    async (cursor?: string) => {
      if (!token) return;
      const store = storeRegistry.history();
      try {
        store.setIsLoading(true);
        store.setError(null);
        const res = await historyService.getHands({ token, cursor, limit: 40 });
        if (!res.ok) throw new Error(res.error.message);
        cursor ? store.appendHands(res.data.hands) : store.setHands(res.data.hands);
        store.setCursor(res.data.nextCursor);
        store.setHasMore(res.data.nextCursor !== null);
      } catch {
        store.setError("Failed to load hands");
      } finally {
        store.setIsLoading(false);
      }
    },
    [token],
  );

  const openHand = useCallback(
    async (handId: string) => {
      if (!token) return;
      const store = storeRegistry.history();
      try {
        store.setIsLoadingDetail(true);
        store.setDetailError(null);
        const res = await historyService.getHandDetail({ token, handId });
        if (!res.ok) throw new Error(res.error.message);
        store.setSelectedHand(res.data);
      } catch {
        store.setDetailError("Failed to load hand details");
      } finally {
        store.setIsLoadingDetail(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!collapsed && token) void loadHands();
  }, [collapsed, token, loadHands]);

  if (collapsed) {
    return (
      <Pressable
        onPress={onToggle}
        className="w-10 shrink-0 border-l border-border items-center justify-center bg-panel/80"
        accessibilityLabel="Expand hand history dock"
      >
        <Text variant="muted" className="text-[11px]" style={{ transform: [{ rotate: "-90deg" }] }}>
          History
        </Text>
      </Pressable>
    );
  }

  return (
    <View className="w-[320px] shrink-0 border-l border-border bg-panel/90">
      <View className="ui-row items-center justify-between border-b border-border px-3 py-2.5">
        <Text variant="body" className="font-semibold tracking-wide">
          Hand history
        </Text>
        <Pressable onPress={onToggle} className="px-2 py-1" accessibilityLabel="Collapse dock">
          <Text variant="muted">⟩</Text>
        </Pressable>
      </View>
      <View className="flex-1 min-h-0">
        <HandList
          hands={historyStore.hands}
          isLoading={historyStore.isLoading}
          hasMore={historyStore.hasMore}
          error={historyStore.error}
          onLoadMore={() => {
            if (historyStore.cursor) void loadHands(historyStore.cursor);
          }}
          onHandPress={(handId) => void openHand(handId)}
          onReplayPress={(handId) => router.push(`/replay/${encodeURIComponent(handId)}`)}
        />
      </View>
      <HandDetailModal
        visible={historyStore.selectedHand != null}
        hand={historyStore.selectedHand}
        onClose={() => storeRegistry.history().setSelectedHand(null)}
        currentUserId={currentUserId}
        onReplayPress={(handId) => router.push(`/replay/${encodeURIComponent(handId)}`)}
      />
    </View>
  );
}
