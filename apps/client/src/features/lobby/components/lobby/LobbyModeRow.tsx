import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { LobbyTabs, type LobbyTabKey } from "./LobbyTabs";

type Props = {
  active: LobbyTabKey;
  onChange: (key: LobbyTabKey) => void;
  tournamentsBadgeCount?: number;
  createLabel: string;
  onCreate: () => void;
  dense?: boolean;
};

/** Mode segmented control + quieter mode-owned create (Play now owns accent). */
export function LobbyModeRow({
  active,
  onChange,
  tournamentsBadgeCount,
  createLabel,
  onCreate,
  dense = false,
}: Props) {
  return (
    <View className={`ui-row items-center flex-wrap gap-2 pb-3 ${dense ? "" : "px-4"}`}>
      <View className="shrink min-w-0">
        <LobbyTabs
          active={active}
          onChange={onChange}
          tournamentsBadgeCount={tournamentsBadgeCount}
          dense
        />
      </View>
      <Button
        intent="secondary"
        title={createLabel}
        onPress={onCreate}
        size="sm"
        shape="hud"
        minWidth={0}
        className="shrink-0 border border-border"
      />
    </View>
  );
}
