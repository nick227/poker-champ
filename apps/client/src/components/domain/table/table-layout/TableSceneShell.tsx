/**
 * Single table chrome. All table states (auth, connecting, idle, active) use this shell only.
 * Do not introduce another shell (e.g. FooTableShell); see TABLE_SCENE_VIEWS_OVERVIEW.md guardrails.
 */
import type { ReactNode } from "react";
import { Platform, View, ScrollView, type ViewStyle } from "react-native";
import { vars } from "nativewind";
import { TableLayoutHeightProvider } from "./TableLayoutHeightContext";
import { TableGameTopBar } from "../table-game-top-bar";
import { OpponentStrip, type Opponent } from "../opponent-strip";
import { Surface } from "@/components/containers/Surface";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useTableLayoutDimensions } from "../hooks/useTableLayoutDimensions";
import { layoutStyles } from "./styles";
import { ACTION_BAR_HEIGHT } from "../constants/table-layout.constants";
import { useRouter } from "expo-router";

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
  /** 0–1 when an opponent is to act (for countdown bar); null otherwise */
  activeTurnProgress?: number | null;
  dealerBar: ReactNode;
  board: ReactNode;
  hero: ReactNode | null;
  bottom: ReactNode;
  rootClassName?: string;
  immersiveBoard?: boolean;
  hideBottomSection?: boolean;
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
  activeTurnProgress,
  dealerBar,
  board,
  hero,
  bottom,
  rootClassName,
  immersiveBoard = false,
  hideBottomSection = false,
}: TableSceneShellProps) {
  const { feltColor, cardFaceColor, cardBackColor, accentColor, backgroundColor, tableRadius } =
    usePreferencesStore();
  const { insets, boardAreaHeight, heroZoneHeight, layoutScale } =
    useTableLayoutDimensions();
  const router = useRouter();

  const heroSectionStyle: ViewStyle =
    Platform.OS === "web"
      ? ({ minHeight: "var(--table-hero-zone-height)" } as unknown as ViewStyle)
      : { minHeight: heroZoneHeight };

  const feltAreaStyle: ViewStyle = {
    height: boardAreaHeight,
    minHeight: boardAreaHeight,
  };

  const actionBarHeight = ACTION_BAR_HEIGHT + insets.bottom;

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
        <View collapsable={false} style={layoutStyles.titleSection}>
          <TableGameTopBar
            tableName={tableName}
            smallBlindCents={smallBlindCents}
            bigBlindCents={bigBlindCents}
            minBuyInCents={minBuyInCents}
            onLogoPress={() => router.replace("/")}
            right={topBarRight}
          />
        </View>

        {immersiveBoard ? (
          <View style={{ flex: 1 }}>
            <View style={{ flex: 1, justifyContent: "center" }}>{board}</View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
            <>
              <View
                collapsable={false}
                style={layoutStyles.opponentStripSection}
                className="table-opponent-strip mt-4"
              >
                {opponents.length === 0 && opponentStripEmptyState ? (
                  <View className="opponent-strip-empty-state">
                    {opponentStripEmptyState}
                  </View>
                ) : (
                  <OpponentStrip
                    opponents={opponents}
                    winnerName={winnerName}
                    onPlayerPress={onPlayerPress}
                    activeTurnProgress={activeTurnProgress}
                  />
                )}
              </View>

              <View className="game-area-container" collapsable={false}>
                  <View collapsable={false} style={layoutStyles.dealerBar}>
                    {dealerBar}
                  </View>
                  <View
                    collapsable={false}
                    style={[layoutStyles.feltArea, feltAreaStyle]}
                  >
                    {board}
                  </View>
                {hero != null ? (
                  <View
                    collapsable={false}
                    style={[layoutStyles.heroSection, heroSectionStyle]}
                    className="py-4 table-hero-section mt-2"
                  >
                    {hero}
                  </View>
                ) : null}
              </View>

              {!hideBottomSection ? (
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
              ) : null}
            </>
          </ScrollView>
        )}
      </TableLayoutHeightProvider>
    </View>
  );
}
