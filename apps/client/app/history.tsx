import { useState, useEffect } from "react";
import { View, Pressable } from "react-native";
import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/components/domain/lobby/Masthead";
import { ProfileStrip } from "@/components/domain/lobby/ProfileStrip";
import { BottomBar } from "@/components/containers/BottomBar";
import { Text } from "@/components/base/Text";
import { HandList } from "@/components/domain/history/HandList";
import { HandDetailModal } from "@/components/domain/history/HandDetailModal";
import { historyService, type HandHistoryListItem } from "@/services/history.service";
import { storeRegistry } from "@/registry/store.registry";
import { useAuthStore } from "@/stores/auth.store";
import { useProfile } from "@/hooks/useProfile";

// Tab Navigation Component
function HistoryTabNavigation({ activeTab, onTabChange }: { activeTab: "overview" | "hands"; onTabChange: (tab: "overview" | "hands") => void }) {
  return (
    <View className="ui-row ui-border-b border-border">
      <Pressable
        onPress={() => onTabChange("overview")}
        className={`flex-1 py-3 items-center ${activeTab === "overview" ? "border-b-2 border-primary" : ""}`}
      >
        <Text variant={activeTab === "overview" ? "body" : "muted"}>Overview</Text>
      </Pressable>
      <Pressable
        onPress={() => onTabChange("hands")}
        className={`flex-1 py-3 items-center ${activeTab === "hands" ? "border-b-2 border-primary" : ""}`}
      >
        <Text variant={activeTab === "hands" ? "body" : "muted"}>Hands</Text>
      </Pressable>
    </View>
  );
}

// Overview Tab Component
function OverviewTab({ hands }: { hands: HandHistoryListItem[] }) {
  // Calculate statistics client-side
  const totalHands = hands.length;
  const totalProfitCents = hands.reduce((sum, hand) => sum + hand.netResultCents, 0);
  const winningHands = hands.filter(hand => hand.netResultCents > 0).length;
  const winRate = totalHands > 0 ? (winningHands / totalHands) * 100 : 0;
  const avgPotCents = totalHands > 0 ? hands.reduce((sum, hand) => sum + hand.potCents, 0) / totalHands : 0;
  const biggestPotCents = Math.max(...hands.map(hand => hand.potCents), 0);

  const formatCents = (cents: number) => {
    return (cents / 100).toFixed(2);
  };

  return (
    <View className="p-4 space-y-4">
      <View className="items-center mb-4">
        <Text variant="h1">Your Poker Statistics</Text>
        <Text variant="muted" className="text-xs mt-1">Stats based on loaded hands ({totalHands} loaded)</Text>
      </View>
      
      <View className="ui-grid grid-cols-2 gap-4">
        <View className="ui-surface p-4 rounded-lg">
          <Text variant="muted" className="text-xs">Total Hands</Text>
          <Text variant="h2">{totalHands}</Text>
        </View>
        
        <View className="ui-surface p-4 rounded-lg">
          <Text variant="muted" className="text-xs">Net Profit/Loss</Text>
          <Text variant="h2" className={totalProfitCents >= 0 ? "text-green-500" : "text-red-500"}>
            ${formatCents(totalProfitCents)}
          </Text>
        </View>
        
        <View className="ui-surface p-4 rounded-lg">
          <Text variant="muted" className="text-xs">Win Rate</Text>
          <Text variant="h2">{winRate.toFixed(1)}%</Text>
        </View>
        
        <View className="ui-surface p-4 rounded-lg">
          <Text variant="muted" className="text-xs">Avg Pot</Text>
          <Text variant="h2">${formatCents(avgPotCents)}</Text>
        </View>
        
        <View className="ui-surface p-4 rounded-lg col-span-2">
          <Text variant="muted" className="text-xs">Biggest Pot</Text>
          <Text variant="h2">${formatCents(biggestPotCents)}</Text>
        </View>
      </View>
      
      {totalHands === 0 && (
        <View className="items-center py-8">
          <Text variant="muted" className="text-center">No hands played yet. Start playing to see your statistics!</Text>
        </View>
      )}
    </View>
  );
}

// Main Screen Component
export default function HandHistoryScreen() {
  const [activeTab, setActiveTab] = useState<"overview" | "hands">("overview");
  const [selectedHandId, setSelectedHandId] = useState<string | null>(null);
  
  const profile = useProfile();
  const token = useAuthStore((state) => state.token);
  const historyStore = storeRegistry.use.history();

  // Load initial hands
  useEffect(() => {
    if (token) {
      loadHands();
    }
  }, [token]);

  const loadHands = async (cursor?: string) => {
    if (!token) return;
    
    try {
      historyStore.setIsLoading(true);
      historyStore.setError(null);
      
      const response = await historyService.getHands({ token, cursor, limit: 50 });
      
      if (cursor) {
        historyStore.appendHands(response.hands);
      } else {
        historyStore.setHands(response.hands);
      }
      
      historyStore.setCursor(response.nextCursor);
      historyStore.setHasMore(response.nextCursor !== null);
    } catch (error) {
      console.error("Error loading hands:", error);
      historyStore.setError("Failed to load hands");
    } finally {
      historyStore.setIsLoading(false);
    }
  };

  const loadMoreHands = () => {
    if (historyStore.cursor && !historyStore.isLoading && historyStore.hasMore) {
      loadHands(historyStore.cursor);
    }
  };

  const loadHandDetail = async (handId: string) => {
    if (!token) return;
    
    try {
      historyStore.setIsLoadingDetail(true);
      historyStore.setDetailError(null);
      
      const hand = await historyService.getHandDetail({ token, handId });
      historyStore.setSelectedHand(hand);
      setSelectedHandId(handId);
    } catch (error) {
      console.error("Error loading hand detail:", error);
      historyStore.setDetailError("Failed to load hand details");
    } finally {
      historyStore.setIsLoadingDetail(false);
    }
  };

  const closeHandDetail = () => {
    historyStore.setSelectedHand(null);
    setSelectedHandId(null);
  };

  const onHandPress = (handId: string) => {
    loadHandDetail(handId);
  };

  return (
    <Screen>
      <Masthead />
      <ProfileStrip username={profile.username ?? "Player"} location={profile.location} />

      <View className="flex-1 ui-stack-3">
        <View className="ui-header">
          <Text variant="h1" className="text-center py-4">Hand History</Text>
        </View>
        
        <HistoryTabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
        
        {activeTab === "overview" && <OverviewTab hands={historyStore.hands} />}
        {activeTab === "hands" && (
          <HandList
            hands={historyStore.hands}
            isLoading={historyStore.isLoading}
            onLoadMore={loadMoreHands}
            hasMore={historyStore.hasMore}
            onHandPress={onHandPress}
          />
        )}
      </View>

      <HandDetailModal
        visible={!!selectedHandId}
        hand={historyStore.selectedHand}
        onClose={closeHandDetail}
        currentUserId={profile.userId ?? ''}
      />

      <BottomBar active="history" />
    </Screen>
  );
}
