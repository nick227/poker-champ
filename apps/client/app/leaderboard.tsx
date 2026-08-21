import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { ScrollView, View, TouchableOpacity, Text } from "react-native";
import { Screen } from "@/components/containers/Screen";
import { Surface } from "@/components/containers/Surface";
import { Button } from "@/components/base/Button";
import { Avatar } from "@/components/base/Avatar";
import { useAuthStore } from "@/stores/auth.store";
import {
  leaderboardService,
  type LeaderboardCategory,
  type LeaderboardEntry,
} from "@/services/leaderboard.service";
import { loginPathWithNext } from "@/lib/nav";
import { usePageBoot } from "@/hooks/usePageBoot";

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

export default function LeaderboardScreen() {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const [category, setCategory] = useState<LeaderboardCategory>("biggest_winner");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const hasEntriesRef = useRef(false);
  const ready = usePageBoot(!loading, { busy: loading });
  const authError = useMemo(
    () => Boolean(error) && /authorization|unauthorized|sign in|session/i.test(error ?? ""),
    [error],
  );

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
      const res = await leaderboardService.getLeaderboard({
        token,
        period: "weekly",
        category,
        limit: 20,
      });
      if (!res.ok) throw new Error(res.error.message);
      setEntries(res.data.entries);
      setComputedAt(res.data.computedAt);
      hasEntriesRef.current = res.data.entries.length > 0;
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

  return (
    <Screen ready={ready}>
      <View className="flex-1 p-4 bg-bg">
        <View className="flex-row items-start gap-2 py-2 h-14">
          {CATEGORY_OPTIONS.map((option) => {
            const active = option.key === category;
            return (
              <Button
                key={option.key}
                title={option.label}
                onPress={() => setCategory(option.key)}
                intent="neutral"
                size="sm"
                selected={active}
                className="min-h-[32px] px-3"
                textClassName={active ? "text-text" : "text-muted"}
              />
            );
          })}
        </View>

        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {error ? (
            <Surface styleId="surface.list.panel" className="p-4">
              <Text className="text-red-400 mb-3">{error}</Text>
              {authError ? (
                <Button
                  title="Login / Register"
                  intent="ghost"
                  onPress={() => router.push(loginPathWithNext("/leaderboard"))}
                />
              ) : null}
              <Button title="Retry" intent="ghost" onPress={() => setRefreshNonce((v) => v + 1)} />
            </Surface>
          ) : entries.length === 0 ? (
            <Surface styleId="surface.list.panel" className="p-4">
              <Text className="text-gray-400 text-center">
                {computedAt
                  ? "No qualifying players in this period yet. Play some hands to climb the ranks."
                  : "No leaderboard data available yet."}
              </Text>
            </Surface>
          ) : (
            <View className={`pb-4 ${isRefreshing ? "opacity-50" : ""}`}>
              {entries.map((entry) => (
                <Surface key={entry.userId} styleId="surface.list.row" className="mb-2">
                  <TouchableOpacity
                    delayPressIn={50}
                    className="flex-row items-center h-16 px-4"
                  >
                    {/* Rank - Right aligned */}
                    <View className="w-8 items-end pr-1">
                      <Text className="text-sm text-gray-300 font-medium">
                        {entry.rank}
                      </Text>
                    </View>

                    {/* Avatar - 32px with fallback */}
                    <Avatar
                      url={entry.avatarUrl}
                      username={entry.displayName}
                      size="sm"
                      className="ml-2"
                    />

                    {/* Name block - Flexible center */}
                    <View className="flex-1 ml-4">
                      <Text className="text-base font-semibold text-white" numberOfLines={1}>
                        {entry.displayName}
                      </Text>
                      <Text className="text-xs text-gray-400 mt-1">
                        {entry.handCount} hands
                      </Text>
                    </View>

                    {/* Amount - Fixed width, tabular numbers */}
                    <Text
                      className="min-w-[88px] text-right text-base font-bold text-green-400"
                      style={{ fontVariant: ["tabular-nums"] }}
                    >
                      {entry.value}
                    </Text>
                  </TouchableOpacity>
                </Surface>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Screen>
  );
}

