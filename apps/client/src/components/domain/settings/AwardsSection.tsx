import { useCallback, useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Text } from "@/components/base/Text";
import { getMyAwards, parseGraphic, type UserAwardItem } from "@/services/awards.service";

const CATEGORY_ORDER = ["PROGRESSION", "PERFORMANCE", "ENGAGEMENT", "TABLE", "Other"];

function groupByCategory(items: UserAwardItem[]): Map<string, UserAwardItem[]> {
  const map = new Map<string, UserAwardItem[]>();
  for (const item of items) {
    const cat = item.category ?? "Other";
    const list = map.get(cat) ?? [];
    list.push(item);
    map.set(cat, list);
  }
  return map;
}

export function AwardsSection() {
  const [items, setItems] = useState<UserAwardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyAwards();
      if (!res.ok) throw new Error(res.error.message);
      setItems(res.data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load awards");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View className="ui-surface-card ui-p-4 items-center py-8">
        <ActivityIndicator />
        <Text variant="muted" className="mt-2">Loading awards…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="ui-surface-card ui-p-4">
        <Text variant="body" className="text-danger">{error}</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View className="ui-surface-card ui-p-4">
        <Text variant="label">Awards</Text>
        <Text variant="muted" className="mt-1">Complete lessons and play hands to earn awards.</Text>
      </View>
    );
  }

  const byCategory = groupByCategory(items);
  const categories = [...byCategory.entries()].sort(([a], [b]) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  return (
    <View className="ui-surface-card ui-p-4 ui-stack-3">
      <Text variant="label">Awards</Text>
      {categories.map(([category, list]) => (
        <View key={category} className="ui-stack-2">
          <Text variant="muted" className="text-xs uppercase tracking-wide">{category}</Text>
          {list.map((a) => (
            <View key={a.awardId} className="flex-row items-center gap-3 py-2 border-b border-border/50">
              <View className="rounded-lg bg-background p-2 w-10 h-10 items-center justify-center">
                <Text variant="h1" className="text-lg">{parseGraphic(a.graphic)}</Text>
              </View>
              <View className="flex-1 min-w-0">
                <Text variant="body" className="font-medium">{a.name}</Text>
                <Text variant="muted" className="text-sm">{a.reason}</Text>
                <Text variant="muted" className="text-xs mt-0.5">
                  Earned {new Date(a.lastEarnedAt).toLocaleDateString()}
                  {a.count > 1 ? ` · ${a.count}×` : ""}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
