import { useState, useEffect, useCallback } from "react";
import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { HandList } from "@/components/domain/history/HandList";
import { HandDetailModal } from "@/components/domain/history/HandDetailModal";
import { HistoryOverviewTab } from "@/components/domain/history/HistoryOverviewTab";
import { historyService, type HistoryOverview } from "@/services/history.service";
import { storeRegistry } from "@/registry/store.registry";
import { useAuthStore } from "@/stores/auth.store";

type HistoryTab = "overview" | "hands";

function HistoryTabs({
  activeTab,
  onChange,
}: {
  activeTab: HistoryTab;
  onChange: (tab: HistoryTab) => void;
}) {
  return (
    <View className="ui-row ui-border-b border-border">
      {(["overview", "hands"] as HistoryTab[]).map((tab) => {
        const active = activeTab === tab;
        return (
          <Pressable
            key={tab}
            onPress={() => onChange(tab)}
            className={`flex-1 py-3 items-center ${active ? "border-b-2 border-primary" : ""}`}
          >
            <Text variant={active ? "body" : "muted"}>
              {tab === "overview" ? "Overview" : "Hands"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export type HandHistorySectionProps = {
  currentUserId: string;
};

export function HandHistorySection({ currentUserId }: HandHistorySectionProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<HistoryTab>("overview");
  const [overview, setOverview] = useState<HistoryOverview | null>(null);
  const [selectedHandId, setSelectedHandId] = useState<string | null>(null);

  const token = useAuthStore((s) => s.token);
  const historyStore = storeRegistry.use.history();

  const loadOverview = useCallback(async () => {
    if (!token) return;
    const res = await historyService.getOverview({ token });
    setOverview(res.ok ? res.data : null);
  }, [token]);

  const loadHands = useCallback(
    async (cursor?: string) => {
      if (!token) return;
      const store = storeRegistry.history();
      try {
        store.setIsLoading(true);
        store.setError(null);
        const res = await historyService.getHands({ token, cursor, limit: 50 });
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
    [token]
  );

  useEffect(() => {
    if (!token) return;
    loadOverview();
    loadHands();
  }, [token, loadOverview, loadHands]);

  const loadMoreHands = () => {
    const store = storeRegistry.history();
    if (store.cursor && store.hasMore && !store.isLoading) {
      loadHands(store.cursor);
    }
  };

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
        setSelectedHandId(handId);
      } catch {
        store.setDetailError("Failed to load hand details");
      } finally {
        store.setIsLoadingDetail(false);
      }
    },
    [token]
  );

  const closeHand = useCallback(() => {
    storeRegistry.history().setSelectedHand(null);
    setSelectedHandId(null);
  }, []);

  const openReplay = useCallback(
    (handId: string) => {
      router.push(`/replay/${encodeURIComponent(handId)}`);
    },
    [router],
  );

  return (
    <View className="flex-1 min-h-0">
      <HistoryTabs activeTab={activeTab} onChange={setActiveTab} />
      <View className="flex-1 min-h-0">
        {activeTab === "overview" && <HistoryOverviewTab overview={overview} />}
        {activeTab === "hands" && (
          <HandList
            hands={historyStore.hands}
            isLoading={historyStore.isLoading}
            hasMore={historyStore.hasMore}
            onLoadMore={loadMoreHands}
            onHandPress={openHand}
            onReplayPress={openReplay}
            error={historyStore.error}
          />
        )}
      </View>
      <HandDetailModal
        visible={!!selectedHandId}
        hand={historyStore.selectedHand}
        onClose={closeHand}
        currentUserId={currentUserId}
        onReplayPress={openReplay}
      />
    </View>
  );
}
