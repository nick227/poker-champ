import { useEffect, useMemo, useState } from "react";
import { Share, View, Image } from "react-native";
import * as Clipboard from "expo-clipboard";

import { ActiveTableView } from "@/features/table";
import { EmptyTableView } from "@/features/table";
import { StatusTableView } from "@/features/table";

import { Button } from "@/components/base/Button";
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";
import { Text } from "@/components/base/Text";

import type { TablePageController } from "@/types/tableSceneContract";
import { tablePath } from "@/lib/nav";

import { useProfile } from "@/hooks/useProfile";
import { useAvatarUpload } from "@/hooks/useAvatarUpload";
import { serviceRegistry } from "@/registry/service.registry";
import { parseProfileFromMe } from "@/lib/profileFromMe";
import { getAvatarUrlFromMeResponse } from "@/lib/meResponse";
import { useToastStore } from "@/stores/toast.store";
import { useProfileStore } from "@/stores/profile.store";

export type TableSceneRouterProps = {
  scene: TablePageController["scene"];
  renderModel: TablePageController["renderModel"];
  actions: TablePageController["actions"];
};

const BOT_AVATAR_SOURCE = require("../../assets/images/cherry_002.jpg");
const DEFAULT_LOADING_SPIN_HOLD_MS = 1500;

function resolveShareTableUrl(tableId: string): string {
  const path = tablePath(tableId);

  // Web
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }

  // Native fallback (configured web origin)
  const origin = process.env.EXPO_PUBLIC_WEB_ORIGIN?.trim();
  if (origin) return `${origin.replace(/\/+$/, "")}${path}`;

  // Last resort: relative path
  return path;
}

async function shareTable(tableUrl: string) {
  try {
    await Share.share({
      title: "Poker Champ Table",
      message: `Join my table:`,
      url: tableUrl,
    });
  } catch (err) {
    console.error("Share failed:", err);
  }
}

function copyShareTableUrl(url: string, showToast: (msg: string, variant?: "default" | "success" | "danger") => void) {
  Clipboard.setStringAsync(url)
    .then(() => showToast("Share table URL copied to clipboard!", "success"))
    .catch((err) => {
      console.error("Failed to copy share table URL:", err);
    });
}

export function TableSceneRouter({ scene, renderModel, actions }: TableSceneRouterProps) {
  const { snapshot, currentUserAvatarUrl } = renderModel;
  const { mode } = scene;
  const showToast = useToastStore((s) => s.show);
  const [loadingSpinHoldUntilTs, setLoadingSpinHoldUntilTs] = useState(0);
  const [holdDelayActive, setHoldDelayActive] = useState(false);

  const { refetch: refreshProfile, avatarUrl: profileAvatarUrl } = useProfile();

  const profileOrCurrentUserUrl = currentUserAvatarUrl ?? profileAvatarUrl;

  const [heroAvatarUrl, setHeroAvatarUrl] = useState<string | null | undefined>(profileOrCurrentUserUrl);

  const { pickAndUpload: pickAndUploadAvatar } = useAvatarUpload({
    onSuccess: (result) => {
      setHeroAvatarUrl(result.avatarUrl);
      void refreshProfile();
    },
  });

  // Keep local hero avatar aligned with profile/currentUser, without clobbering any locally set override.
  useEffect(() => {
    setHeroAvatarUrl((prev) => profileOrCurrentUserUrl ?? prev);
  }, [profileOrCurrentUserUrl]);

  // On active table, fetch /me once and update both profile store and hero avatar (server source of truth).
  const setProfile = useProfileStore((s) => s.setProfile);
  useEffect(() => {
    if (mode !== "active") return;

    let cancelled = false;
    serviceRegistry.get.me().then((res) => {
      if (cancelled || !res.ok || !res.data) return;
      setProfile(parseProfileFromMe(res.data));
      const url = getAvatarUrlFromMeResponse(res.data);
      setHeroAvatarUrl((prev) => url ?? prev);
    });

    return () => {
      cancelled = true;
    };
  }, [mode, setProfile]);

  const shareTableUrl = useMemo(() => resolveShareTableUrl(renderModel.tableId), [renderModel.tableId]);

  const showEmptyOpponentsState = renderModel.opponents.length === 0 && mode !== "connecting";

  const emptyOpponentsState = showEmptyOpponentsState ? (
    <View className="p-4 gap-y-3 mt-2">
      <View className="ui-row rounded-lg border border-border-subtle bg-panel-elevated p-3">
        <Image source={BOT_AVATAR_SOURCE} className="max-w-16 max-h-16 rounded-full" resizeMode="cover" />
        <View className="ui-col px-4 flex-1 min-w-0 gap-2">

          <Text variant="label" className="text-text-subtle mb-1 normal-case tracking-normal">
            Share this game URL
          </Text>

          <Text numberOfLines={1} ellipsizeMode="tail" selectable className="w-full">
            {shareTableUrl}
          </Text>

          <View className="flex-row gap-2">
          <Button title="Add bot" onPress={actions.openAddBotPicker} />
          
            <Button
              title="Copy URL"
              onPress={() => copyShareTableUrl(shareTableUrl, showToast)}
              intent="neutral"
              size="sm"
            />

            <IconButton
              icon={<Icon name="share" size={20} />}
              intent="ghost"
              size="md"
              onPress={() => void shareTable(shareTableUrl)}
            />
          </View>
        </View>
      </View>
    </View>
  ) : null;

  const isBaseLoadingMode = mode === "auth_loading" || mode === "auth_required" || mode === "connecting";
  const noSnapshotReadyFallback = (mode === "idle" || mode === "active") && !snapshot;
  const shouldShowStatusWithoutHold = isBaseLoadingMode || noSnapshotReadyFallback;

  useEffect(() => {
    const remainingMs = loadingSpinHoldUntilTs - Date.now();
    if (remainingMs <= 0) {
      setHoldDelayActive(false);
      return;
    }
    setHoldDelayActive(true);
    const timeoutId = setTimeout(() => setHoldDelayActive(false), remainingMs);
    return () => clearTimeout(timeoutId);
  }, [loadingSpinHoldUntilTs]);

  useEffect(() => {
    setLoadingSpinHoldUntilTs(0);
    setHoldDelayActive(false);
  }, [renderModel.tableId]);

  const shouldHoldRevealForSlotSpin = !shouldShowStatusWithoutHold && holdDelayActive;
  const showStatusView = shouldShowStatusWithoutHold || shouldHoldRevealForSlotSpin;
  const statusViewMode = shouldShowStatusWithoutHold ? mode : "connecting";

  const handleLoadingSlotSpinStart = (spinDurationMs: number) => {
    const safeDurationMs = Number.isFinite(spinDurationMs) && spinDurationMs > 0 ? spinDurationMs : DEFAULT_LOADING_SPIN_HOLD_MS;
    const nextUntilTs = Date.now() + safeDurationMs;
    setLoadingSpinHoldUntilTs((currentUntilTs) => Math.max(currentUntilTs, nextUntilTs));
  };

  if (showStatusView) {
    return (
      <StatusTableView
        mode={statusViewMode}
        scene={scene}
        renderModel={renderModel}
        actions={actions}
        onLoadingSlotSpinStart={handleLoadingSlotSpinStart}
      />
    );
  }

  switch (mode) {
    case "idle":
      if (!snapshot) {
        return (
          <StatusTableView
            mode="connecting"
            scene={scene}
            renderModel={renderModel}
            actions={actions}
            onLoadingSlotSpinStart={handleLoadingSlotSpinStart}
          />
        );
      }
      return (
        <EmptyTableView
          snapshot={snapshot}
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
          onRejoin={actions.rejoinHero}
          onJoinTable={actions.joinTableFromFallback}
          rejoinState={renderModel.rejoinUiState}
          rejoinErrorMessage={renderModel.rejoinErrorMessage}
        />
      );

    case "active":
      if (!snapshot) {
        return (
          <StatusTableView
            mode="connecting"
            scene={scene}
            renderModel={renderModel}
            actions={actions}
            onLoadingSlotSpinStart={handleLoadingSlotSpinStart}
          />
        );
      }
      return (
        <ActiveTableView
          snapshot={snapshot}
          opponents={renderModel.opponents}
          balanceCents={renderModel.balanceCents}
          tableStatus={scene.tableStatus}
          connectionStatus={scene.connectionStatus}
          actionMessage={renderModel.actionMessage}
          handResultMessage={renderModel.handResultMessage}
          topBarRight={renderModel.tableTopBarRight}
          onAction={actions.sendAction}
          onToggleSittingOut={actions.toggleHeroSittingOut}
          onRejoin={actions.rejoinHero}
          onJoinTable={actions.joinTableFromFallback}
          rejoinState={renderModel.rejoinUiState}
          rejoinErrorMessage={renderModel.rejoinErrorMessage}
          onBackToLobby={actions.closeTableAndReturn}
          onPlayerPress={actions.onPlayerPress}
          opponentStripEmptyState={emptyOpponentsState}
          canRebuy={renderModel.canRebuy}
          onPressRebuy={actions.openRebuySheet}
          heroAvatarUrlOverride={heroAvatarUrl ?? profileOrCurrentUserUrl ?? undefined}
          onHeroAvatarPress={pickAndUploadAvatar}
        />
      );

    default:
      return (
        <StatusTableView
          mode="connecting"
          scene={scene}
          renderModel={renderModel}
          actions={actions}
          onLoadingSlotSpinStart={handleLoadingSlotSpinStart}
        />
      );
  }
}

