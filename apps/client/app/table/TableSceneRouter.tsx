import { View, Pressable } from "react-native";
import { useEffect, useState } from "react";
import { ActiveTableView } from "@/components/domain/table/views/ActiveTableView";
import { EmptyTableView } from "@/components/domain/table/views/EmptyTableView";
import { StatusTableView } from "@/components/domain/table/views/StatusTableView";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import type { TablePageController } from "@/types/tableSceneContract";
import { tablePath } from "@/lib/nav";
import { useProfile } from "@/hooks/useProfile";
import { useAvatarUpload } from "@/hooks/useAvatarUpload";
import { serviceRegistry } from "@/registry/service.registry";
import { getAvatarUrlFromMeResponse } from "@/lib/meResponse";

export type TableSceneRouterProps = {
  scene: TablePageController["scene"];
  renderModel: TablePageController["renderModel"];
  actions: TablePageController["actions"];
};

function resolveShareTableUrl(tableId: string): string {
  const path = tablePath(tableId);
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  const origin = process.env.EXPO_PUBLIC_WEB_ORIGIN?.trim();
  if (origin) return `${origin.replace(/\/+$/, "")}${path}`;
  return path;
}

export function copyShareTableUrl(url?: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function" && url) {
    navigator.clipboard.writeText(url).catch((err) => {
      console.error("Failed to copy share table URL:", err);
    });
    alert("Share table URL copied to clipboard!");
  } else {
    console.warn("Clipboard API not available. Cannot copy share table URL.");
  }
}

export function TableSceneRouter({ scene, renderModel, actions }: TableSceneRouterProps) {
  const { snapshot, currentUserAvatarUrl } = renderModel;
  const { mode } = scene;
  const { refetch: refreshProfile, avatarUrl: profileAvatarUrl } = useProfile();
  const [heroAvatarUrl, setHeroAvatarUrl] = useState<string | null | undefined>(currentUserAvatarUrl ?? profileAvatarUrl);
  const { pickAndUpload: pickAndUploadAvatar } = useAvatarUpload({
    onSuccess: (result) => {
      setHeroAvatarUrl(result.avatarUrl);
      void refreshProfile();
    },
  });
  const profileOrCurrentUserUrl = currentUserAvatarUrl ?? profileAvatarUrl;
  useEffect(() => {
    setHeroAvatarUrl((prev) => profileOrCurrentUserUrl ?? prev);
  }, [profileOrCurrentUserUrl]);
  useEffect(() => {
    if (mode !== "active") return;
    let cancelled = false;
    Promise.all([serviceRegistry.get.me(), refreshProfile()]).then(([res]) => {
      if (cancelled || !res.ok || !res.data) return;
      const url = getAvatarUrlFromMeResponse(res.data);
      setHeroAvatarUrl((prev) => url ?? prev);
    });
    return () => { cancelled = true; };
  }, [mode, refreshProfile]);
  const showEmptyOpponentsState = renderModel.opponents.length === 0 && mode !== "connecting";
  const shareTableUrl = resolveShareTableUrl(renderModel.tableId);
  const emptyOpponentsState = showEmptyOpponentsState ? (
    <View className="p-4 gap-y-3 mt-2">
      <View className="ui-row rounded-lg border border-border-subtle bg-panel-elevated p-3">
        <Button title="Add bot" onPress={actions.openAddBotPicker} />
        <View className="ui-col p-4  flex-1 min-w-0">
          <Text variant="label" className="text-text-subtle mb-1 normal-case tracking-normal">
            Share this game URL
          </Text>
          <Pressable onPress={() => copyShareTableUrl(shareTableUrl)}>
            <Text numberOfLines={1} ellipsizeMode="tail" selectable className="w-full">
              {shareTableUrl}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  ) : null;

  switch (mode) {
    case "auth_loading":
    case "auth_required":
    case "connecting":
      return (
        <StatusTableView
          mode={mode}
          scene={scene}
          renderModel={renderModel}
          actions={actions}
        />
      );
    case "idle":
      return (
        <EmptyTableView
          snapshot={snapshot!}
          opponents={renderModel.opponents}
          balanceCents={renderModel.balanceCents}
          tableStatus={scene.tableStatus}
          handResultMessage={renderModel.handResultMessage}
          topBarRight={renderModel.tableTopBarRight}
          onPlayerPress={actions.onPlayerPress}
          opponentStripEmptyState={emptyOpponentsState}
          canRebuy={renderModel.canRebuy}
          onPressRebuy={actions.openRebuySheet}
          onBackToLobby={actions.closeTableAndReturn}
        />
      );
    case "active":
      return (
        <ActiveTableView
          snapshot={snapshot!}
          opponents={renderModel.opponents}
          balanceCents={renderModel.balanceCents}
          tableStatus={scene.tableStatus}
          connectionStatus={scene.connectionStatus}
          actionMessage={renderModel.actionMessage}
          handResultMessage={renderModel.handResultMessage}
          topBarRight={renderModel.tableTopBarRight}
          onAction={actions.sendAction}
          onToggleSittingOut={actions.toggleHeroSittingOut}
          onPlayerPress={actions.onPlayerPress}
          opponentStripEmptyState={emptyOpponentsState}
          canRebuy={renderModel.canRebuy}
          onPressRebuy={actions.openRebuySheet}
          heroAvatarUrlOverride={heroAvatarUrl ?? profileOrCurrentUserUrl ?? undefined}
          onHeroAvatarPress={pickAndUploadAvatar}
        />
      );
    default:
      return null;
  }
}
