import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";
import { useAuthStore } from "@/stores/auth.store";
import { useTableChromeMenuStore } from "@/stores/tableChromeMenu.store";
import { useMobileNavStore } from "@/stores/mobileNav.store";
import { useIsDesktopWorkspace } from "@/hooks/useIsDesktopWorkspace";
import { getSettingsTargetPath } from "@/lib/authNavigation";
import { loginPathWithNext } from "@/lib/nav";
import { ProfilePill } from "@/components/domain/navigation/ProfilePill";
import { useActiveTableStatus, type ActiveTableStatus } from "@/hooks/useActiveTableStatus";
import { TournamentInfoModal } from "@/features/table/components/table/TournamentInfoModal";
import { formatChipCount } from "@/lib/money/table-money";
import { chips } from "@/lib/money/types";
import { formatCountdownTo, formatTournamentStatus } from "@/lib/tournament.utils";
import { APP_NAME } from "@/constants/copy";

/** Live "status · level · blinds · next level in" line, ticking once a second while a level clock is running. */
function useTournamentSummaryLine(tournament: ActiveTableStatus["tournament"]): string | null {
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!tournament?.nextLevelAtTs) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [tournament?.nextLevelAtTs]);

  if (!tournament) return null;

  const blindsLine = `${formatChipCount(chips(tournament.smallBlindCents))} / ${formatChipCount(chips(tournament.bigBlindCents))}`;
  const anteSuffix = tournament.anteCents > 0 ? ` (ante ${formatChipCount(chips(tournament.anteCents))})` : "";
  const countdown = formatCountdownTo(tournament.nextLevelAtTs);

  const parts = [
    formatTournamentStatus(tournament.status),
    `Level ${tournament.currentLevel}`,
    `Blinds ${blindsLine}${anteSuffix}`,
  ];
  if (countdown) parts.push(`Next level in ${countdown}`);
  return parts.join("  ·  ");
}

type Props = {
  username: string;
  amountCents: number;
  onlineLabel: string;
  onPressOnline?: () => void;
  avatarUrl?: string | null;
  authenticated: boolean;
};

/** Persistent HUD status strip: presence + account. On mobile also carries brand + primary nav trigger. */
export function WorkspaceStatusBar({
  username,
  amountCents,
  onlineLabel,
  onPressOnline,
  avatarUrl,
  authenticated,
}: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? "/lobby";
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  const settingsPath = getSettingsTargetPath({ hydrated, token });
  const tableStatus = useActiveTableStatus();
  const tableMenu = useTableChromeMenuStore((s) => s.menu);
  const isDesktopWorkspace = useIsDesktopWorkspace();
  const openMobileNav = useMobileNavStore((s) => s.toggle);
  const [tournamentInfoVisible, setTournamentInfoVisible] = useState(false);

  const leadingLabel = tableStatus
    ? tableStatus.tournament
      ? tableStatus.tableName
      : [tableStatus.tableName, tableStatus.stakesLine].filter(Boolean).join("  ·  ")
    : null;
  const tournamentId = tableStatus?.tournament?.tournamentId;
  const tournamentSummary = useTournamentSummaryLine(tableStatus?.tournament ?? null);

  return (
    <View
      className={`ui-row items-center justify-between border-b border-border gap-3 pt-4 shrink-0 ${
        isDesktopWorkspace ? "pb-4" : "px-4 pt-3 pb-3"
      }`}
    >
      {!isDesktopWorkspace ? (
        <IconButton icon={<Icon name="menu" size={20} />} size="sm" onPress={openMobileNav} />
      ) : null}
      <View className="flex-1 min-w-0 flex-col px-4 justify-center">
        <View className="flex-row items-center gap-2">
          {leadingLabel ? (
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              allowFontScaling={false}
              className="text-text font-semibold text-[13px] tracking-wide"
            >
              {leadingLabel}
            </Text>
          ) : !isDesktopWorkspace ? (
            <Pressable
              onPress={() => router.push("/lobby")}
              className="ui-touch"
              accessibilityRole="link"
              accessibilityLabel={APP_NAME}
            >
              <Text className="text-lg text-gold">♠</Text>
            </Pressable>
          ) : null}
          {tournamentId ? (
            <IconButton
              icon={<Icon name="info" size={16} />}
              size="sm"
              onPress={() => setTournamentInfoVisible(true)}
            />
          ) : null}
        </View>
        {tournamentSummary ? (
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            allowFontScaling={false}
            variant="muted"
            className="text-[11px] tracking-wide"
          >
            {tournamentSummary}
          </Text>
        ) : null}
      </View>
      {tournamentId ? (
        <TournamentInfoModal
          visible={tournamentInfoVisible}
          onClose={() => setTournamentInfoVisible(false)}
          tournamentId={tournamentId}
        />
      ) : null}
      <View className="ui-row items-center gap-3 shrink-0">
        <Pressable
          onPress={onPressOnline}
          disabled={!onPressOnline}
          className={`btn h-9 items-center justify-center rounded-2 ${isDesktopWorkspace ? "px-3" : "px-2"}`}
          style={{ backgroundColor: "transparent" }}
          accessibilityRole="button"
          accessibilityLabel={onlineLabel}
        >
          <View className="ui-row items-center gap-2">
            <View className="h-1.5 w-1.5 rounded-full bg-brand" />
            {isDesktopWorkspace ? (
              <Text variant="muted" className="text-[13px] tracking-wide">
                {onlineLabel}
              </Text>
            ) : null}
          </View>
        </Pressable>
        {authenticated ? (
          <ProfilePill
            username={username}
            amountCents={amountCents}
            avatarUrl={avatarUrl}
            avatarSize={28}
            onPress={() => router.push(settingsPath)}
          />
        ) : (
          <Button
            title="Login / Register"
            intent="accent"
            size="sm"
            shape="hud"
            minWidth={0}
            onPress={() => router.push(loginPathWithNext(pathname))}
          />
        )}
        {tableMenu}
      </View>
    </View>
  );
}
