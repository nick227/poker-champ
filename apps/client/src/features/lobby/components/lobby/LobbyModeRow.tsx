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

/** Mode fills the line; create anchors the trailing edge. */
export function LobbyModeRow({
  active,
  onChange,
  tournamentsBadgeCount,
  createLabel,
  onCreate,
  dense = false,
}: Props) {
  return (
    <View
      className={`ui-row items-center gap-3 pb-3 w-full ${dense ? "" : "px-4"}`}
    >
      <View className="flex-1 min-w-0" style={{ flex: 1 }}>
        <LobbyTabs
          active={active}
          onChange={onChange}
          tournamentsBadgeCount={tournamentsBadgeCount}
          dense
          stretch
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
