import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

import { TableSceneShell, TABLE_REVEAL_MS } from "@/features/table";
import { TableMoneyDisplayProvider } from "@/features/table/context/TableMoneyDisplayContext";
import { useTableSceneSlots } from "./useTableSceneSlots";

import type { TablePageController } from "@/types/tableSceneContract";

import { useProfile } from "@/hooks/useProfile";
import { serviceRegistry } from "@/registry/service.registry";
import { parseProfileFromMe } from "@/lib/profileFromMe";
import { getAvatarUrlFromMeResponse } from "@/lib/meResponse";
import { useProfileStore } from "@/stores/profile.store";

export type TableSceneRouterProps = {
  scene: TablePageController["scene"];
  renderModel: TablePageController["renderModel"];
  actions: TablePageController["actions"];
};

const DEFAULT_LOADING_SPIN_HOLD_MS = 1500;

function TableSceneRouterContent({
  scene,
  renderModel,
  actions,
}: TableSceneRouterProps) {
  const { snapshot, currentUserAvatarUrl } = renderModel;
  const { mode } = scene;
  const [loadingSpinHoldUntilTs, setLoadingSpinHoldUntilTs] = useState(0);
  const [holdDelayActive, setHoldDelayActive] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const { avatarUrl: profileAvatarUrl } = useProfile();

  const profileOrCurrentUserUrl = currentUserAvatarUrl ?? profileAvatarUrl;

  const [heroAvatarUrl, setHeroAvatarUrl] = useState<string | null | undefined>(profileOrCurrentUserUrl);

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
    emptyOpponentsState: undefined,
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
