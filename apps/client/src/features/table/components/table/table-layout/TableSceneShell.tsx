/**
 * Single table chrome. All table states (auth, connecting, idle, active) use this shell only.
 * Do not introduce another shell (e.g. FooTableShell); see TABLE_SCENE_VIEWS_OVERVIEW.md guardrails.
 */
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Animated, Platform, View, ScrollView, type ViewStyle } from "react-native";
import type { Rect } from "@/features/table/animations/animationTypes";
import { vars } from "nativewind";
import { TableLayoutHeightProvider } from "./TableLayoutHeightContext";
import { TableGameTopBar } from "../table-game-top-bar";
import { OpponentStrip, type Opponent } from "../opponent-strip";
import { Surface } from "@/components/containers/Surface";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useTableLayoutDimensions } from "../hooks/useTableLayoutDimensions";
import { layoutStyles } from "./styles";
import { ACTION_BAR_HEIGHT, TABLE_REVEAL_MS } from "../constants/table-layout.constants";
import { useRouter } from "expo-router";
import { useIsDesktopWorkspace } from "@/hooks/useIsDesktopWorkspace";

export type TableSceneShellProps = {
  tableName: string;
  balanceCents: number;
  playerStackCents?: number;
  smallBlindCents?: number;
  bigBlindCents?: number;
  minBuyInCents?: number;
  topBarRight?: ReactNode;
  opponents: Opponent[];
  opponentStripEmptyState?: ReactNode;
  winnerName?: string;
  onPlayerPress?: (opponent: Opponent) => void;
  /** Report seat rect by index for SEAT-anchored FX. */
  onSeatBounds?: (seatIndex: number, rect: Rect) => void;
  /** 0–1 when an opponent is to act (for countdown bar); null otherwise */
  activeTurnProgress?: number | null;
  dealerBar: ReactNode;
  board: ReactNode;
  hero: ReactNode | null;
  bottom: ReactNode;
  rootClassName?: string;
  immersiveBoard?: boolean;
  hideBottomSection?: boolean;
  /** When true, body is shown at full opacity (loading state). When false, body uses revealed + fade. */
  showStatusView?: boolean;
  /** Phase 2: latched reveal; when true, table body fades in. */
  revealed?: boolean;
  revealDurationMs?: number;
  reducedMotion?: boolean;
  tournamentBanner?: ReactNode;
};

function cx(...tokens: Array<string | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

export function TableSceneShell({
  tableName,
  balanceCents,
  playerStackCents,
  smallBlindCents,
  bigBlindCents,
  minBuyInCents,
  topBarRight,
  opponents,
  opponentStripEmptyState,
  winnerName,
  onPlayerPress,
  onSeatBounds,
  activeTurnProgress,
  dealerBar,
  board,
  hero,
  bottom,
  rootClassName,
  immersiveBoard = false,
  hideBottomSection = false,
  showStatusView = false,
  // Default to visible for standalone callers (lesson/replay). TableSceneRouter
  // passes an explicit reveal state for the main table loading transition.
  revealed = true,
  revealDurationMs = TABLE_REVEAL_MS,
  reducedMotion = false,
  tournamentBanner,
}: TableSceneShellProps) {
  const { feltColor, cardFaceColor, cardBackColor, accentColor, backgroundColor, tableRadius } =
    usePreferencesStore();
  const { insets, boardAreaHeight, heroZoneHeight, layoutScale } = useTableLayoutDimensions();
  const isDesktopWorkspace = useIsDesktopWorkspace();
  const router = useRouter();
  const revealOpacity = useRef(new Animated.Value(0)).current;

  // Only re-run on revealed/showStatusView so the animation fires once on transition, not on every prop update.
  useEffect(() => {
    if (showStatusView) {
      revealOpacity.stopAnimation();
      revealOpacity.setValue(1);
      return;
    }
    if (!revealed) {
      revealOpacity.setValue(0);
      return;
    }
    Animated.timing(revealOpacity, {
      toValue: 1,
      duration: reducedMotion ? 0 : revealDurationMs,
      useNativeDriver: true,
    }).start();
  }, [reducedMotion, revealDurationMs, revealOpacity, revealed, showStatusView]);

  const heroSectionStyle: ViewStyle =
    Platform.OS === "web"
      ? ({ minHeight: "var(--table-hero-zone-height)" } as unknown as ViewStyle)
      : { minHeight: heroZoneHeight };

  const actionBarHeight = ACTION_BAR_HEIGHT + insets.bottom;

  const emptyStrip =
    opponents.length === 0 && opponentStripEmptyState ? (
      <View
        collapsable={false}
        style={layoutStyles.opponentStripSection}
        className="table-opponent-strip opponent-strip-empty-state"
      >
        {opponentStripEmptyState}
      </View>
    ) : null;

  const arena = (
    <View
      className="game-area-container"
      collapsable={false}
      style={isDesktopWorkspace ? layoutStyles.gameArenaFill : undefined}
    >
      <OpponentStrip
        opponents={opponents}
        winnerName={winnerName}
        onPlayerPress={onPlayerPress}
        onSeatBounds={onSeatBounds}
        activeTurnProgress={activeTurnProgress}
        centerSlot={board}
      />
      {hero != null ? (
        <View
          collapsable={false}
          style={[layoutStyles.heroSection, heroSectionStyle]}
          className="table-hero-section"
        >
          {hero}
        </View>
      ) : null}
    </View>
  );

  const actionBar = !hideBottomSection ? (
    <Surface
      as={View}
      styleId="surface.sim.table.actionbar"
      collapsable={false}
      style={[
        layoutStyles.actionBarSection,
        {
          height: actionBarHeight,
          minHeight: actionBarHeight,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {bottom}
    </Surface>
  ) : null;

  const bodyInner = (
    <>
      {emptyStrip}
      {arena}
      {actionBar}
    </>
  );

  const body = isDesktopWorkspace ? (
    <Animated.View style={[{ opacity: revealOpacity }, layoutStyles.desktopBody]}>
      {bodyInner}
      <View collapsable={false}>{dealerBar}</View>
    </Animated.View>
  ) : (
    <>
      <Animated.View style={{ opacity: revealOpacity }}>{bodyInner}</Animated.View>
      <View collapsable={false}>{dealerBar}</View>
    </>
  );

  return (
    <View
      collapsable={false}
      style={[
        vars({
          "--c-felt": feltColor,
          "--c-card-face": cardFaceColor,
          "--c-card-back": cardBackColor,
          "--c-gold": accentColor,
          "--c-brand": accentColor,
          "--c-bg": backgroundColor,
          "--r-table": tableRadius,
          "--table-hero-zone-height": `${heroZoneHeight}px`,
        }),
        layoutStyles.root,
        { paddingTop: insets.top },
      ]}
      className={cx("table-wrapper", rootClassName)}
    >
      <TableLayoutHeightProvider
        heroZoneHeight={heroZoneHeight}
        boardAreaHeight={boardAreaHeight}
        layoutScale={layoutScale}
      >
        <View className="bg-panel/90 rounded-t-lg" collapsable={false} style={layoutStyles.titleSection}>
          <TableGameTopBar
            tableName={tableName}
            smallBlindCents={smallBlindCents}
            bigBlindCents={bigBlindCents}
            minBuyInCents={minBuyInCents}
            onLogoPress={() => router.replace("/")}
            right={topBarRight}
          />
        </View>
        {tournamentBanner}

        {immersiveBoard ? (
          <View style={{ flex: 1 }}>
            <View style={{ flex: 1, justifyContent: "center" }}>{board}</View>
          </View>
        ) : isDesktopWorkspace ? (
          body
        ) : (
          <ScrollView contentContainerStyle={{ flexGrow: 1 }}>{body}</ScrollView>
        )}
      </TableLayoutHeightProvider>
    </View>
  );
}
