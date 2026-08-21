/**
 * Single table chrome. Stage is TableStage (felt + rail seats + center board).
 * Hero sits on the south seat slot — no separate HeroZone band.
 * Table name/stakes live in WorkspaceStatusBar; table menu publishes into that bar.
 */
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Animated, View } from "react-native";
import type { Rect } from "@/features/table/animations/animationTypes";
import { vars } from "nativewind";
import { TableLayoutHeightProvider } from "./TableLayoutHeightContext";
import type { Opponent } from "../table.adapter";
import { Surface } from "@/components/containers/Surface";
import { useChromeInsets } from "@/components/containers/ChromeInsets";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useTableChromeMenuStore } from "@/stores/tableChromeMenu.store";
import { useTableLayoutDimensions } from "../hooks/useTableLayoutDimensions";
import { layoutStyles } from "./styles";
import { ACTION_BAR_HEIGHT, TABLE_REVEAL_MS } from "../constants/table-layout.constants";
import { TableStage } from "../table-stage";
import type { SeatPlateProps } from "../table-stage";

export type TableSceneShellProps = {
  tableName: string;
  balanceCents: number;
  playerStackCents?: number;
  smallBlindCents?: number;
  bigBlindCents?: number;
  minBuyInCents?: number;
  topBarRight?: ReactNode;
  opponents: Opponent[];
  /** @deprecated empty strip removed; kept for slot compat */
  opponentStripEmptyState?: ReactNode;
  winnerName?: string;
  onPlayerPress?: (opponent: Opponent) => void;
  onSeatInteractPress?: (opponent: Opponent) => void;
  onSeatBounds?: (seatIndex: number, rect: Rect) => void;
  onHeroBounds?: (rect: Rect) => void;
  activeTurnProgress?: number | null;
  turnCountdownSeconds?: number | null;
  dealerBar?: ReactNode;
  board: ReactNode;
  /** @deprecated hero is on the stage ring via heroPlate */
  hero?: ReactNode | null;
  /** Uniform south-seat plate (preferred over `hero` band). */
  heroPlate?: SeatPlateProps | null;
  /** Hero table seat index for rail slot mapping. */
  heroSeat?: number;
  maxSeats?: number;
  bottom: ReactNode;
  rootClassName?: string;
  immersiveBoard?: boolean;
  hideBottomSection?: boolean;
  showStatusView?: boolean;
  revealed?: boolean;
  revealDurationMs?: number;
  reducedMotion?: boolean;
  tournamentBanner?: ReactNode;
};

function cx(...tokens: Array<string | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

export function TableSceneShell({
  tableName: _tableName,
  balanceCents: _balanceCents,
  playerStackCents: _playerStackCents,
  smallBlindCents: _smallBlindCents,
  bigBlindCents: _bigBlindCents,
  minBuyInCents: _minBuyInCents,
  topBarRight,
  opponents,
  winnerName,
  onPlayerPress,
  onSeatInteractPress,
  onSeatBounds,
  onHeroBounds,
  activeTurnProgress,
  turnCountdownSeconds = null,
  dealerBar: _dealerBar,
  board,
  heroPlate = null,
  heroSeat = 0,
  maxSeats = 6,
  bottom,
  rootClassName,
  immersiveBoard = false,
  hideBottomSection = false,
  showStatusView = false,
  revealed = true,
  revealDurationMs = TABLE_REVEAL_MS,
  reducedMotion = false,
  tournamentBanner,
}: TableSceneShellProps) {
  const { feltColor, cardFaceColor, cardBackColor, accentColor, backgroundColor, tableRadius } =
    usePreferencesStore();
  const { insets, boardAreaHeight, heroZoneHeight, layoutScale } = useTableLayoutDimensions();
  const { topConsumed } = useChromeInsets();
  const setChromeMenu = useTableChromeMenuStore((s) => s.setMenu);
  const revealOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setChromeMenu(topBarRight ?? null);
    return () => setChromeMenu(null);
  }, [setChromeMenu, topBarRight]);

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

  const hudBottomPadding = Math.max(insets.bottom, 8);
  const hudMax = ACTION_BAR_HEIGHT + hudBottomPadding;

  return (
    <View
      nativeID="table-wrapper"
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
        { paddingTop: topConsumed ? 0 : insets.top },
      ]}
      className={cx("table-wrapper", rootClassName)}
    >
      <TableLayoutHeightProvider
        heroZoneHeight={heroZoneHeight}
        boardAreaHeight={boardAreaHeight}
        layoutScale={layoutScale}
      >
        {tournamentBanner}

        {immersiveBoard ? (
          <View style={{ flex: 1 }}>
            <View style={{ flex: 1, justifyContent: "center" }}>{board}</View>
          </View>
        ) : (
          <Animated.View nativeID="table-body" style={[{ opacity: revealOpacity }, layoutStyles.body]}>
            <View nativeID="table-stage-host" style={layoutStyles.stageHost} collapsable={false}>
              <TableStage
                opponents={opponents}
                heroPlate={heroPlate}
                heroSeat={heroSeat}
                maxSeats={maxSeats}
                board={board}
                winnerName={winnerName}
                onPlayerPress={onPlayerPress}
                onSeatInteractPress={onSeatInteractPress}
                onSeatBounds={onSeatBounds}
                onHeroBounds={onHeroBounds}
                activeTurnProgress={activeTurnProgress}
                turnCountdownSeconds={turnCountdownSeconds}
              />
            </View>
            {!hideBottomSection ? (
              <Surface
                nativeID="table-action-hud"
                as={View}
                styleId="surface.sim.table.actionbar"
                collapsable={false}
                style={[
                  layoutStyles.actionHudSection,
                  {
                    height: hudMax,
                    minHeight: hudMax,
                    maxHeight: hudMax,
                    paddingBottom: hudBottomPadding,
                  },
                ]}
              >
                {bottom}
              </Surface>
            ) : null}
          </Animated.View>
        )}
      </TableLayoutHeightProvider>
    </View>
  );
}
