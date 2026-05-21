import { useCallback, useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { Screen } from "@/components/containers/Screen";
import { Text } from "@/components/base/Text";
import { Loader } from "@/components/base/Loader";
import { Button } from "@/components/base/Button";
import { AdminTournamentsPanel } from "@/features/admin/components/AdminTournamentsPanel";
import { serviceRegistry } from "@/registry/service.registry";
import { useAuthStore } from "@/stores/auth.store";
import { useToastStore } from "@/stores/toast.store";
import { formatCents } from "@/lib/format";

type AdminTab = "users" | "tournaments";

type MeUser = {
  id: string;
  role: string;
};

type AdminListItem = {
  id: string;
  email: string;
  displayName: string;
  username?: string | null;
  role: string;
  isBanned: boolean;
  deletedAt?: string | null;
  stats?: {
    lastOnlineAt?: string | null;
    totalOnlineHours?: number;
    totalSpendCents?: number;
    totalLostCents?: number;
    totalBuyInCents?: number;
    totalCashOutCents?: number;
    totalTournamentEntryCents?: number;
    totalTournamentPayoutCents?: number;
  };
};

function getAvatarInitial(user: AdminListItem): string {
  const source = user.displayName || user.username || user.email || "U";
  return source.trim().slice(0, 1).toUpperCase() || "U";
}

function formatLastOnline(input?: string | null): string {
  if (!input) return "Never";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminScreen() {
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  const [user, setUser] = useState<MeUser | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminListItem[]>([]);
  const [adminTotal, setAdminTotal] = useState(0);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>("users");
  const showToast = useToastStore((s) => s.show);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setUser(null);
      return;
    }

    setAuthLoading(true);
    serviceRegistry.get.me()
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setUser(null);
          return;
        }
        const maybeUser = (res.data as { user?: { id?: string; role?: string } })?.user;
        if (!maybeUser?.id || !maybeUser?.role) {
          setUser(null);
          return;
        }
        setUser({ id: maybeUser.id, role: maybeUser.role });
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });

    return () => { cancelled = true; };
  }, [token]);

  const loadAdminUsers = useCallback(async () => {
    setAdminLoading(true);
    setAdminError(null);
    const res = await serviceRegistry.get.adminUsers(1, 50);
    if (!res.ok) {
      setAdminError(res.error.message || "Failed to load admin users.");
      setAdminUsers([]);
      setAdminTotal(0);
      setAdminLoading(false);
      return;
    }
    setAdminUsers((res.data.users ?? []) as AdminListItem[]);
    setAdminTotal(res.data.total ?? 0);
    setAdminLoading(false);
  }, []);

  useEffect(() => {
    if (!token || user?.role !== "ADMIN") return;
    void loadAdminUsers();
  }, [token, user?.role, loadAdminUsers]);

  const runUserAction = useCallback(async (key: string, fn: () => Promise<{ ok: boolean; error?: { message?: string } }>, okMessage: string) => {
    setActionKey(key);
    const res = await fn();
    if (!res.ok) {
      showToast(res.error?.message || "Action failed", "danger");
      setActionKey(null);
      return;
    }
    showToast(okMessage, "success");
    await loadAdminUsers();
    setActionKey(null);
  }, [loadAdminUsers, showToast]);

  const handleMakeAdmin = useCallback(async (targetUserId: string) => {
    await runUserAction(
      `${targetUserId}:promote`,
      () => serviceRegistry.post.adminPromoteUser(targetUserId),
      "User promoted to admin",
    );
  }, [runUserAction]);

  const handleSuspend = useCallback(async (targetUserId: string) => {
    await runUserAction(
      `${targetUserId}:suspend`,
      () => serviceRegistry.post.adminSuspendUser(targetUserId),
      "User suspended",
    );
  }, [runUserAction]);

  const handleDelete = useCallback(async (targetUserId: string) => {
    await runUserAction(
      `${targetUserId}:delete`,
      () => serviceRegistry.post.adminDeleteUser(targetUserId),
      "User deleted",
    );
  }, [runUserAction]);

  if (!hydrated) return null;
  if (!token) return <Redirect href="/login" />;
  if (authLoading) return <Loader />;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== "ADMIN") return <Redirect href="/" />;

  return (
    <Screen>
      <View className="flex-1 py-4">
        <View className="rounded-2xl border border-border-subtle bg-panel/80 p-4">
          <Text variant="h1">Admin Console</Text>
          <Text variant="muted">
            {tab === "users" ? "Manage users, roles, and account status." : "Create and manage scheduled tournaments."}
          </Text>
          <View className="mt-3 ui-row ui-inline-2">
            <Pressable
              onPress={() => setTab("users")}
              className={`flex-1 rounded-xl border p-3 ${tab === "users" ? "border-brand bg-panel-elevated" : "border-border-subtle bg-panel/60"}`}
            >
              <Text variant="label">Users</Text>
              <Text variant="h2">{adminTotal}</Text>
            </Pressable>
            <Pressable
              onPress={() => setTab("tournaments")}
              className={`flex-1 rounded-xl border p-3 ${tab === "tournaments" ? "border-brand bg-panel-elevated" : "border-border-subtle bg-panel/60"}`}
            >
              <Text variant="label">Tournaments</Text>
              <Text variant="body">{tab === "tournaments" ? "Manage" : "Open"}</Text>
            </Pressable>
          </View>
        </View>

        {tab === "tournaments" ? <AdminTournamentsPanel /> : null}

        {tab === "users" && adminLoading ? <Loader /> : null}
        {tab === "users" && adminError ? <Text variant="danger">{adminError}</Text> : null}
        {tab === "users" && !adminLoading && !adminError && adminUsers.length === 0 ? (
          <Text variant="muted">No users found.</Text>
        ) : null}

        {tab === "users" && !adminLoading && !adminError ? (
          <ScrollView className="mt-4 flex-1" contentContainerStyle={{ gap: 12, paddingBottom: 20 }}>
            {adminUsers.map((item) => (
              <View key={item.id} className="rounded-2xl border border-border-subtle bg-panel/90 p-4">
                <View className="ui-row items-start ui-inline-3">
                  <View className="h-12 w-12 rounded-full border border-border-subtle bg-panel-elevated ui-center">
                    <Text variant="h2">{getAvatarInitial(item)}</Text>
                  </View>
                  <View className="flex-1">
                    <Text variant="body">{item.displayName || item.email}</Text>
                    <Text variant="muted">{item.email}</Text>
                    <Text variant="muted">{item.username ? `@${item.username}` : item.id.slice(0, 12)}</Text>
                  </View>
                  <View className="items-end ui-stack-1">
                    <View className="rounded-full border border-border-subtle bg-panel-elevated px-3 py-1">
                      <Text variant="label">{item.role}</Text>
                    </View>
                    <View className="rounded-full border border-border-subtle bg-panel-elevated px-3 py-1">
                      <Text variant="label">{item.deletedAt ? "Deleted" : item.isBanned ? "Suspended" : "Active"}</Text>
                    </View>
                  </View>
                </View>

                <View className="mt-3 rounded-xl border border-border-subtle bg-panel-elevated/70 p-3">
                  <Text variant="label">Activity</Text>
                  <View className="mt-2 ui-row ui-inline-2">
                    <View className="flex-1 rounded-lg border border-border-subtle bg-panel p-2">
                      <Text variant="muted">Last Online</Text>
                      <Text variant="body">{formatLastOnline(item.stats?.lastOnlineAt)}</Text>
                    </View>
                    <View className="flex-1 rounded-lg border border-border-subtle bg-panel p-2">
                      <Text variant="muted">Total Hours</Text>
                      <Text variant="body">{(item.stats?.totalOnlineHours ?? 0).toFixed(1)}h</Text>
                    </View>
                  </View>
                </View>

                <View className="mt-3 rounded-xl border border-border-subtle bg-panel-elevated/70 p-3">
                  <Text variant="label">Financial</Text>
                  <View className="mt-2 ui-row ui-inline-2">
                    <View className="flex-1 rounded-lg border border-border-subtle bg-panel p-2">
                      <Text variant="muted">Total Spend</Text>
                      <Text variant="body">{formatCents(item.stats?.totalSpendCents ?? 0)}</Text>
                    </View>
                    <View className="flex-1 rounded-lg border border-border-subtle bg-panel p-2">
                      <Text variant="muted">Total Lost</Text>
                      <Text variant="body">{formatCents(item.stats?.totalLostCents ?? 0)}</Text>
                    </View>
                  </View>
                  <View className="mt-2 ui-row ui-inline-2">
                    <View className="flex-1 rounded-lg border border-border-subtle bg-panel p-2">
                      <Text variant="muted">Buy-ins</Text>
                      <Text variant="body">{formatCents(item.stats?.totalBuyInCents ?? 0)}</Text>
                    </View>
                    <View className="flex-1 rounded-lg border border-border-subtle bg-panel p-2">
                      <Text variant="muted">Cash-outs</Text>
                      <Text variant="body">{formatCents(item.stats?.totalCashOutCents ?? 0)}</Text>
                    </View>
                  </View>
                  <View className="mt-2 ui-row ui-inline-2">
                    <View className="flex-1 rounded-lg border border-border-subtle bg-panel p-2">
                      <Text variant="muted">Tournament Entries</Text>
                      <Text variant="body">{formatCents(item.stats?.totalTournamentEntryCents ?? 0)}</Text>
                    </View>
                    <View className="flex-1 rounded-lg border border-border-subtle bg-panel p-2">
                      <Text variant="muted">Tournament Payouts</Text>
                      <Text variant="body">{formatCents(item.stats?.totalTournamentPayoutCents ?? 0)}</Text>
                    </View>
                  </View>
                </View>

                <View className="mt-3 ui-row ui-inline-2">
                  <Button
                    title="Make Admin"
                    variant="ghost"
                    className="flex-1"
                    disabled={item.role === "ADMIN" || item.deletedAt != null}
                    loading={actionKey === `${item.id}:promote`}
                    onPress={() => { void handleMakeAdmin(item.id); }}
                  />
                  <Button
                    title="Suspend"
                    variant="danger"
                    className="flex-1"
                    disabled={!!item.isBanned || item.deletedAt != null}
                    loading={actionKey === `${item.id}:suspend`}
                    onPress={() => { void handleSuspend(item.id); }}
                  />
                  <Button
                    title="Delete"
                    variant="danger"
                    className="flex-1"
                    disabled={item.deletedAt != null}
                    loading={actionKey === `${item.id}:delete`}
                    onPress={() => { void handleDelete(item.id); }}
                  />
                </View>
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>
    </Screen>
  );
}
