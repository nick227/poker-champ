import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Share, View, Image } from "react-native";
import * as Clipboard from "expo-clipboard";

import { TableSceneShell, TABLE_REVEAL_MS } from "@/features/table";
import { TableMoneyDisplayProvider } from "@/features/table/context/TableMoneyDisplayContext";
import { useTableSceneSlots } from "./useTableSceneSlots";

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

function TableSceneRouterContent({
  scene,
  renderModel,
  actions,
}: TableSceneRouterProps) {
  const { snapshot, currentUserAvatarUrl } = renderModel;
  const { mode } = scene;
  const showToast = useToastStore((s) => s.show);
  const [loadingSpinHoldUntilTs, setLoadingSpinHoldUntilTs] = useState(0);
  const [holdDelayActive, setHoldDelayActive] = useState(false);
  const [revealed, setRevealed] = useState(false);

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
    <View className="flex-row items-center gap-2 px-3 py-2 border-b border-border-subtle bg-panel/80">
      <Image
        source={BOT_AVATAR_SOURCE}
        className="w-8 h-8 rounded-full"
        resizeMode="cover"
      />
      <Text
        variant="caption"
        className="text-text-subtle shrink-0"
        numberOfLines={1}
      >
        Invite friends or add a bot
      </Text>
      <Text
        numberOfLines={1}
        ellipsizeMode="middle"
        selectable
        className="flex-1 min-w-0 text-text-subtle text-xs"
      >
        {shareTableUrl}
      </Text>
      <Button title="Add bot" size="sm" onPress={actions.openAddBotPicker} />
      <Button
        title="Copy"
        size="sm"
        intent="neutral"
        onPress={() => copyShareTableUrl(shareTableUrl, showToast)}
      />
      <IconButton
        icon={<Icon name="share" size={18} />}
        intent="ghost"
        size="sm"
        onPress={() => void shareTable(shareTableUrl)}
      />
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
    setRevealed(false);
  }, [renderModel.tableId]);

  const hasSnapshot = snapshot != null;
  useEffect(() => {
    if (hasSnapshot && !holdDelayActive) setRevealed(true);
  }, [hasSnapshot, holdDelayActive]);

  const shouldHoldRevealForSlotSpin = !shouldShowStatusWithoutHold && holdDelayActive && !revealed;
  const showStatusView = shouldShowStatusWithoutHold || shouldHoldRevealForSlotSpin;
  const statusViewMode = shouldShowStatusWithoutHold ? mode : "connecting";

  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof AccessibilityInfo.isReduceMotionEnabled !== "function") return;
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReducedMotion(Boolean(enabled));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleLoadingSlotSpinStart = (spinDurationMs: number) => {
    const safeDurationMs = Number.isFinite(spinDurationMs) && spinDurationMs > 0 ? spinDurationMs : DEFAULT_LOADING_SPIN_HOLD_MS;
    const nextUntilTs = Date.now() + safeDurationMs;
    setLoadingSpinHoldUntilTs((currentUntilTs) => Math.max(currentUntilTs, nextUntilTs));
  };

  const slots = useTableSceneSlots({
    showStatusView,
    statusViewMode,
    snapshot: snapshot ?? null,
    mode,
    scene,
    renderModel,
    actions,
    revealed,
    loadingParams: {
      onLoadingSlotSpinStart: handleLoadingSlotSpinStart,
      reducedMotion,
    },
    emptyOpponentsState,
    heroAvatarUrl: heroAvatarUrl ?? profileOrCurrentUserUrl ?? undefined,
  });

  return (
    <TableSceneShell
      {...slots}
      showStatusView={showStatusView}
      revealed={revealed}
      revealDurationMs={TABLE_REVEAL_MS}
      reducedMotion={reducedMotion}
    />
  );
}

export function TableSceneRouter(props: TableSceneRouterProps) {
  return (
    <TableMoneyDisplayProvider snapshot={props.renderModel.snapshot ?? null}>
      <TableSceneRouterContent {...props} />
    </TableMoneyDisplayProvider>
  );
}

