import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/components/domain/lobby/Masthead";
import { AppTopNav } from "@/components/domain/navigation/AppTopNav";
import { BottomBar } from "@/components/containers/BottomBar";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { OnlinePlayersSheet } from "@/components/domain/lobby/OnlinePlayersSheet";
import { useProfile } from "@/hooks/useProfile";
import { useAuthStore } from "@/stores/auth.store";
import { storeRegistry } from "@/registry/store.registry";
import { useLobbyRealtimeBridge } from "@/realtime/lobbyRealtimeBridge";
import {
  leaderboardService,
  type LeaderboardCategory,
  type LeaderboardEntry,
} from "@/services/leaderboard.service";

import { useBankroll } from "@/hooks/useBankroll";

const CATEGORY_OPTIONS: Array<{ key: LeaderboardCategory; label: string }> = [
  { key: "biggest_winner", label: "Winners" },
  //{ key: "biggest_donor", label: "Biggest Donor" },
  { key: "showdown_sniper", label: "Showdowns" },
  { key: "all_in_maniac", label: "All-Ins" },
  //{ key: "ice_cold", label: "Losses Streak" },
  { key: "heater", label: "Streak" },
  //{ key: "tight_rock", label: "Tightest" },
  //{ key: "action_junkie", label: "Loosest" },
];

function formatComputedAt(input: string | null): string {
  if (!input) return "Pending first snapshot";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "Pending first snapshot";
  return date.toLocaleString();
}

function LeaderboardLoadingSkeleton() {
  return (
    <View className="ui-stack-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <View key={index} className="ui-surface-card rounded-xl px-3 py-3">
          <View className="ui-row items-center justify-between">
            <View className="h-4 w-40 rounded bg-border-subtle" />
            <View className="h-4 w-20 rounded bg-border-subtle" />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function LeaderboardScreen() {
  const profile = useProfile();
  const token = useAuthStore((state) => state.token);
  const [category, setCategory] = useState<LeaderboardCategory>("biggest_winner");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [onlineSheetVisible, setOnlineSheetVisible] = useState(false);
  const hasEntriesRef = useRef(false);

  const {
    onlineTotal,
    onlinePlayers,
    onlineBusy,
    onlineError,
  } = storeRegistry.use.lobby();
  const { requestOnlinePlayers } = useLobbyRealtimeBridge();

  const loadLeaderboard = useCallback(async () => {
    if (!token) {
      setEntries([]);
      setComputedAt(null);
      hasEntriesRef.current = false;
      setError("Sign in required");
      setLoading(false);
      return;
    }

    if (!hasEntriesRef.current) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);
    try {
      const response = await leaderboardService.getLeaderboard({
        token,
        period: "weekly",
        category,
        limit: 20,
      });
      setEntries(response.entries);
      setComputedAt(response.computedAt);
      hasEntriesRef.current = response.entries.length > 0;
    } catch (err) {
      setEntries([]);
      setComputedAt(null);
      hasEntriesRef.current = false;
      setError((err as Error)?.message ?? "Failed to load leaderboard");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [category, token]);

  useEffect(() => {
    void loadLeaderboard();
  }, [loadLeaderboard, refreshNonce]);

  const openOnlineSheet = useCallback(() => {
    setOnlineSheetVisible(true);
    requestOnlinePlayers();
  }, [requestOnlinePlayers]);

  const onlineLabel = onlineTotal === 1 ? "1 Online" : `${onlineTotal} Online`;

  const { cents: bankroll } = useBankroll();
  const [slotBankroll, setSlotBankroll] = useState(bankroll);

  useEffect(() => {
    setSlotBankroll(bankroll);
  }, [bankroll]);

  const currentBankroll = slotBankroll ?? 0;

  return (
    <Screen>
      <Masthead />
      <AppTopNav
        username={profile.username ?? "Player"}
        onlineLabel={onlineLabel}
        onPressOnline={openOnlineSheet}
        amountCents={currentBankroll}
        avatarUrl={profile.avatarUrl}
      />

      <View className="flex-1 ui-stack-3 m-4">

          <View className="ui-row items-start gap-2 py-1 pr-2 h-[60]">
            {CATEGORY_OPTIONS.map((option) => {
              const active = option.key === category;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setCategory(option.key)}
                  className={`rounded-full px-3 py-2 ${active ? "bg-brand border border-border-subtle" : "ui-surface border border-border-subtle"}`}
                >
                  <Text variant={active ? "body" : "muted"}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>

        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {loading ? (
            <LeaderboardLoadingSkeleton />
          ) : error ? (
            <View className="ui-surface-card rounded-xl px-4 py-5 ui-stack-2">
              <Text variant="danger">{error}</Text>
              <Button title="Retry" variant="ghost" onPress={() => setRefreshNonce((v) => v + 1)} />
            </View>
          ) : entries.length === 0 ? (
            <View className="ui-surface-card rounded-xl px-4 py-5">
              <Text variant="muted">
                {computedAt
                  ? "No qualifying players in this period yet. Play some hands to climb the ranks."
                  : "No leaderboard data available yet."}
              </Text>
            </View>
          ) : (
            <View className={`ui-stack-2 pb-4 ${isRefreshing ? "opacity-50" : ""}`}>
              {entries.map((entry) => (
                <View key={`${entry.rank}-${entry.userId}`} className="ui-surface-card rounded-xl px-3 py-3">
                  <View className="ui-row items-center justify-between">
                    <View className="ui-row items-center gap-3">
                      <Text variant="h2" className="text-base">{entry.rank}</Text>
                      <View>
                        <Text variant="body">{entry.displayName}</Text>
                        <Text variant="muted">{entry.handCount} hands</Text>
                      </View>
                    </View>
                    <Text variant="body">{entry.value}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>

      <OnlinePlayersSheet
        visible={onlineSheetVisible}
        onClose={() => setOnlineSheetVisible(false)}
        players={onlinePlayers}
        loading={onlineBusy}
        error={onlineError}
        onRefresh={requestOnlinePlayers}
      />

      <BottomBar active="leaderboard" />
    </Screen>
  );
}
