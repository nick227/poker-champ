import { useState, useEffect, useCallback } from "react";
import { View, Pressable } from "react-native";

import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/components/domain/lobby/Masthead";
import { ProfileStrip } from "@/components/domain/lobby/ProfileStrip";
import { BottomBar } from "@/components/containers/BottomBar";
import { Text } from "@/components/base/Text";
import { HandList } from "@/components/domain/history/HandList";
import { HandDetailModal } from "@/components/domain/history/HandDetailModal";
import { HistoryOverviewTab } from "@/components/domain/history/HistoryOverviewTab";

import { historyService, type HistoryOverview } from "@/services/history.service";
import { storeRegistry } from "@/registry/store.registry";
import { useAuthStore } from "@/stores/auth.store";
import { useProfile } from "@/hooks/useProfile";

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

export default function HandHistoryScreen() {
  const [activeTab, setActiveTab] = useState<HistoryTab>("overview");
  const [overview, setOverview] = useState<HistoryOverview | null>(null);
  const [selectedHandId, setSelectedHandId] = useState<string | null>(null);

  const profile = useProfile();
  const token = useAuthStore((s) => s.token);
  const historyStore = storeRegistry.use.history();

  const loadOverview = useCallback(async () => {
    if (!token) return;

    try {
      setOverview(await historyService.getOverview({ token }));
    } catch {
      setOverview(null);
    }
  }, [token]);

  const loadHands = useCallback(
    async (cursor?: string) => {
      if (!token) return;

      const store = storeRegistry.history();

      try {
        store.setIsLoading(true);
        store.setError(null);

        const res = await historyService.getHands({
          token,
          cursor,
          limit: 50,
        });

        cursor ? store.appendHands(res.hands) : store.setHands(res.hands);
        store.setCursor(res.nextCursor);
        store.setHasMore(res.nextCursor !== null);
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

  const openHand = async (handId: string) => {
    if (!token) return;

    const store = storeRegistry.history();

    try {
      store.setIsLoadingDetail(true);
      store.setDetailError(null);

      const hand = await historyService.getHandDetail({ token, handId });
      store.setSelectedHand(hand);
      setSelectedHandId(handId);
    } catch {
      store.setDetailError("Failed to load hand details");
    } finally {
      store.setIsLoadingDetail(false);
    }
  };

  const closeHand = () => {
    storeRegistry.history().setSelectedHand(null);
    setSelectedHandId(null);
  };

  return (
    <Screen>
      <Masthead />
      <ProfileStrip username={profile.username ?? "Player"} location={profile.location} />

      <View className="flex-1 ui-stack-3">
        <View className="ui-header">
          <Text variant="h1" className="text-center py-4">
            History
          </Text>
        </View>

        <HistoryTabs activeTab={activeTab} onChange={setActiveTab} />

        <View className="flex-1">
          {activeTab === "overview" && <HistoryOverviewTab overview={overview} />}

          {activeTab === "hands" && (
            <HandList
              hands={historyStore.hands}
              isLoading={historyStore.isLoading}
              hasMore={historyStore.hasMore}
              onLoadMore={loadMoreHands}
              onHandPress={openHand}
              error={historyStore.error}
            />
          )}
        </View>
      </View>

      <HandDetailModal
        visible={!!selectedHandId}
        hand={historyStore.selectedHand}
        onClose={closeHand}
        currentUserId={profile.userId ?? ""}
      />

      <BottomBar active="history" />
    </Screen>
  );
}
