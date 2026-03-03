/**
 * Single table chrome. All table states (auth, connecting, idle, active) use this shell only.
 * Do not introduce another shell (e.g. FooTableShell); see TABLE_SCENE_VIEWS_OVERVIEW.md guardrails.
 */
import type { ReactNode } from "react";
import { Platform, View, ScrollView } from "react-native";
import { vars } from "nativewind";
import { TableLayoutHeightProvider } from "./TableLayoutHeightContext";
import { TableGameTopBar } from "../TableGameTopBar";
import { OpponentStrip, type Opponent } from "../OpponentStrip";
import { Surface } from "@/components/containers/Surface";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useTableLayoutHeights } from "../hooks/useTableLayoutHeights";
import { layoutStyles } from "../tableLayout.styles";
import {
  ACTION_BAR_HEIGHT,
} from "../constants/tableLayout.constants";
import { useProfile } from "@/hooks/useProfile";
import { useRouter } from "expo-router";

export type TableSceneShellProps = {
  tableName: string;
  balanceCents: number;
  playerStackCents?: number;
  topBarRight?: ReactNode;
  opponents: Opponent[];
  opponentStripEmptyState?: ReactNode;
  winnerName?: string;
  onPlayerPress?: (opponent: Opponent) => void;
  dealerBar: ReactNode;
  board: ReactNode;
  hero: ReactNode;
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
  topBarRight,
  opponents,
  opponentStripEmptyState,
  winnerName,
  onPlayerPress,
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
  const { insets, heroZoneHeight } = useTableLayoutHeights();
  const profile = useProfile();
  const router = useRouter();

  const heroSectionStyle =
    Platform.OS === "web"
      ? { height: "var(--table-hero-zone-height)" as unknown as number }
      : { height: heroZoneHeight, minHeight: heroZoneHeight };

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
      <TableLayoutHeightProvider heroZoneHeight={heroZoneHeight}>
        <View collapsable={false} style={layoutStyles.titleSection}>
          <TableGameTopBar
            tableName={tableName}
            userName={profile.username}
            stackCents={playerStackCents ?? balanceCents}
            onLogoPress={() => router.push("/")}
            right={topBarRight}
          />
        </View>

        <ScrollView contentContainerStyle={immersiveBoard ? { flexGrow: 1 } : undefined}>
          {immersiveBoard ? (
            <View
              collapsable={false}
              style={{
                flexGrow: 1,
                justifyContent: "center",
              }}
            >
              <View collapsable={false} style={{ flex: 1, justifyContent: "center" }}>
                {board}
              </View>
            </View>
          ) : (
            <>
              <View
                collapsable={false}
                style={layoutStyles.opponentStripSection}
                className="table-opponent-strip"
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
                  />
                )}
              </View>

              <View collapsable={false}>
                <View collapsable={false} style={layoutStyles.gameArea}>
                  <View collapsable={false} style={layoutStyles.dealerBar}>
                    {dealerBar}
                  </View>
                  <View collapsable={false} style={layoutStyles.feltArea}>
                    {board}
                  </View>
                </View>
                <View
                  collapsable={false}
                  style={[layoutStyles.heroSection, heroSectionStyle]}
                  className="table-hero-section"
                >
                  {hero}
                </View>
              </View>

              {!hideBottomSection ? (
                <Surface
                  as={View}
                  styleId="surface.sim.table.actionbar"
                  collapsable={false}
                  style={[
                    layoutStyles.actionBarSection,
                    {
                      height: ACTION_BAR_HEIGHT + insets.bottom,
                      minHeight: ACTION_BAR_HEIGHT + insets.bottom,
                      paddingBottom: insets.bottom,
                    },
                  ]}
                >
                  {bottom}
                </Surface>
              ) : null}
            </>
          )}
        </ScrollView>
      </TableLayoutHeightProvider>
    </View>
  );
}
